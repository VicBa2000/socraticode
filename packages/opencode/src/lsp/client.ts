import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import path from "path"
import { pathToFileURL, fileURLToPath } from "url"
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from "vscode-jsonrpc/node"
import type { Diagnostic as VSCodeDiagnostic } from "vscode-languageserver-types"
import { Effect } from "effect"
import { Log } from "../util"
import { Process } from "../util"
import { LANGUAGE_EXTENSIONS } from "./language"
import z from "zod"
import type * as LSPServer from "./server"
import { NamedError } from "@opencode-ai/shared/util/error"
import { Instance } from "../project/instance"
import { Filesystem } from "../util"

const DIAGNOSTICS_DEBOUNCE_MS = 150

const log = Log.create({ service: "lsp.client" })

type Connection = ReturnType<typeof createMessageConnection>

export interface Info {
  readonly root: string
  readonly serverID: string
  readonly connection: Connection
  readonly notify: {
    readonly open: (input: { path: string }) => Effect.Effect<void>
  }
  readonly diagnostics: Map<string, Diagnostic[]>
  readonly waitForDiagnostics: (input: { path: string }) => Effect.Effect<void>
  readonly shutdown: () => Effect.Effect<void>
}

export type Diagnostic = VSCodeDiagnostic

export const InitializeError = NamedError.create(
  "LSPInitializeError",
  z.object({
    serverID: z.string(),
  }),
)

export const Event = {
  Diagnostics: BusEvent.define(
    "lsp.client.diagnostics",
    z.object({
      serverID: z.string(),
      path: z.string(),
    }),
  ),
}

export const create = Effect.fn("LSPClient.create")(function* (input: {
  serverID: string
  server: LSPServer.Handle
  root: string
}) {
  const l = log.clone().tag("serverID", input.serverID)
  l.info("starting client")

  const connection = createMessageConnection(
    new StreamMessageReader(input.server.process.stdout as any),
    new StreamMessageWriter(input.server.process.stdin as any),
  )

  const diagnostics = new Map<string, Diagnostic[]>()
  connection.onNotification("textDocument/publishDiagnostics", (params) => {
    const filePath = Filesystem.normalizePath(fileURLToPath(params.uri))
    l.info("textDocument/publishDiagnostics", {
      path: filePath,
      count: params.diagnostics.length,
    })
    const exists = diagnostics.has(filePath)
    diagnostics.set(filePath, params.diagnostics)
    if (!exists && input.serverID === "typescript") return
    Bus.publish(Event.Diagnostics, { path: filePath, serverID: input.serverID })
  })
  connection.onRequest("window/workDoneProgress/create", (params) => {
    l.info("window/workDoneProgress/create", params)
    return null
  })
  connection.onRequest("workspace/configuration", async () => [input.server.initialization ?? {}])
  connection.onRequest("client/registerCapability", async () => {})
  connection.onRequest("client/unregisterCapability", async () => {})
  connection.onRequest("workspace/workspaceFolders", async () => [
    {
      name: "workspace",
      uri: pathToFileURL(input.root).href,
    },
  ])
  connection.listen()

  l.info("sending initialize")
  yield* Effect.tryPromise(() =>
    connection.sendRequest("initialize", {
      rootUri: pathToFileURL(input.root).href,
      processId: input.server.process.pid,
      workspaceFolders: [
        {
          name: "workspace",
          uri: pathToFileURL(input.root).href,
        },
      ],
      initializationOptions: {
        ...input.server.initialization,
      },
      capabilities: {
        window: {
          workDoneProgress: true,
        },
        workspace: {
          configuration: true,
          didChangeWatchedFiles: {
            dynamicRegistration: true,
          },
        },
        textDocument: {
          synchronization: {
            didOpen: true,
            didChange: true,
          },
          publishDiagnostics: {
            versionSupport: true,
          },
        },
      },
    }),
  ).pipe(
    Effect.timeout(45_000),
    Effect.mapError((cause) => new InitializeError({ serverID: input.serverID }, { cause })),
    Effect.tapError((error) => Effect.sync(() => l.error("initialize error", { error }))),
  )

  yield* Effect.tryPromise(() => connection.sendNotification("initialized", {}))

  if (input.server.initialization) {
    yield* Effect.tryPromise(() =>
      connection.sendNotification("workspace/didChangeConfiguration", {
        settings: input.server.initialization,
      }),
    )
  }

  const files: Record<string, number> = {}

  const open = Effect.fn("LSPClient.notify.open")(function* (next: { path: string }) {
    next.path = path.isAbsolute(next.path) ? next.path : path.resolve(Instance.directory, next.path)
    const text = yield* Effect.promise(() => Filesystem.readText(next.path)).pipe(Effect.orDie)
    const extension = path.extname(next.path)
    const languageId = LANGUAGE_EXTENSIONS[extension] ?? "plaintext"

    const version = files[next.path]
    if (version !== undefined) {
      log.info("workspace/didChangeWatchedFiles", next)
      yield* Effect.tryPromise(() =>
        connection.sendNotification("workspace/didChangeWatchedFiles", {
          changes: [
            {
              uri: pathToFileURL(next.path).href,
              type: 2,
            },
          ],
        }),
      ).pipe(Effect.orDie)

      const nextVersion = version + 1
      files[next.path] = nextVersion
      log.info("textDocument/didChange", {
        path: next.path,
        version: nextVersion,
      })
      yield* Effect.tryPromise(() =>
        connection.sendNotification("textDocument/didChange", {
          textDocument: {
            uri: pathToFileURL(next.path).href,
            version: nextVersion,
          },
          contentChanges: [{ text }],
        }),
      ).pipe(Effect.orDie)
      return
    }

    log.info("workspace/didChangeWatchedFiles", next)
    yield* Effect.tryPromise(() =>
      connection.sendNotification("workspace/didChangeWatchedFiles", {
        changes: [
          {
            uri: pathToFileURL(next.path).href,
            type: 1,
          },
        ],
      }),
    ).pipe(Effect.orDie)

    log.info("textDocument/didOpen", next)
    diagnostics.delete(next.path)
    yield* Effect.tryPromise(() =>
      connection.sendNotification("textDocument/didOpen", {
        textDocument: {
          uri: pathToFileURL(next.path).href,
          languageId,
          version: 0,
          text,
        },
      }),
    ).pipe(Effect.orDie)
    files[next.path] = 0
  })

  const waitForDiagnostics = Effect.fn("LSPClient.waitForDiagnostics")(function* (next: { path: string }) {
    const normalizedPath = Filesystem.normalizePath(
      path.isAbsolute(next.path) ? next.path : path.resolve(Instance.directory, next.path),
    )
    log.info("waiting for diagnostics", { path: normalizedPath })
    yield* Effect.callback<void>((resume) => {
      let debounceTimer: ReturnType<typeof setTimeout> | undefined
      const unsub = Bus.subscribe(Event.Diagnostics, (event) => {
        if (event.properties.path !== normalizedPath || event.properties.serverID !== input.serverID) return
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          log.info("got diagnostics", { path: normalizedPath })
          resume(Effect.void)
        }, DIAGNOSTICS_DEBOUNCE_MS)
      })

      return Effect.sync(() => {
        if (debounceTimer) clearTimeout(debounceTimer)
        unsub()
      })
    }).pipe(Effect.timeoutOption(3000), Effect.asVoid)
  })

  const shutdown = Effect.fn("LSPClient.shutdown")(function* () {
    l.info("shutting down")
    connection.end()
    connection.dispose()
    yield* Effect.promise(() => Process.stop(input.server.process)).pipe(Effect.orDie)
    l.info("shutdown")
  })

  l.info("initialized")

  return {
    root: input.root,
    get serverID() {
      return input.serverID
    },
    get connection() {
      return connection
    },
    notify: {
      open,
    },
    get diagnostics() {
      return diagnostics
    },
    waitForDiagnostics,
    shutdown,
  } satisfies Info
})
