import { describe, expect, test, beforeEach } from "bun:test"
import path from "path"
import { Effect } from "effect"
import { Bus } from "../../src/bus"
import { LSPClient } from "../../src/lsp"
import { LSPServer } from "../../src/lsp"
import { Log } from "../../src/util"
import { provideInstance } from "../fixture/fixture"

// Minimal fake LSP server that speaks JSON-RPC over stdio
function spawnFakeServer() {
  const { spawn } = require("child_process")
  const serverPath = path.join(__dirname, "../fixture/lsp/fake-lsp-server.js")
  return {
    process: spawn(process.execPath, [serverPath], {
      stdio: "pipe",
    }),
  }
}

async function createClient() {
  const handle = spawnFakeServer() as any
  const cwd = process.cwd()
  const client = await Effect.runPromise(
    LSPClient.create({
      serverID: "fake",
      server: handle as unknown as LSPServer.Handle,
      root: cwd,
    }).pipe(provideInstance(cwd)),
  )

  return { client, cwd }
}

describe("LSPClient interop", () => {
  beforeEach(async () => {
    await Log.init({ print: true })
  })

  test("handles workspace/workspaceFolders request", async () => {
    const { client } = await createClient()

    await client.connection.sendNotification("test/trigger", {
      method: "workspace/workspaceFolders",
    })

    await new Promise((r) => setTimeout(r, 100))

    expect(client.connection).toBeDefined()

    await Effect.runPromise(client.shutdown())
  })

  test("handles client/registerCapability request", async () => {
    const { client } = await createClient()

    await client.connection.sendNotification("test/trigger", {
      method: "client/registerCapability",
    })

    await new Promise((r) => setTimeout(r, 100))

    expect(client.connection).toBeDefined()

    await Effect.runPromise(client.shutdown())
  })

  test("handles client/unregisterCapability request", async () => {
    const { client } = await createClient()

    await client.connection.sendNotification("test/trigger", {
      method: "client/unregisterCapability",
    })

    await new Promise((r) => setTimeout(r, 100))

    expect(client.connection).toBeDefined()

    await Effect.runPromise(client.shutdown())
  })

  test("waitForDiagnostics() resolves when a matching diagnostic event is published", async () => {
    const { client, cwd } = await createClient()
    const file = path.join(cwd, "fixture.ts")

    const waiting = Effect.runPromise(client.waitForDiagnostics({ path: file }).pipe(provideInstance(cwd)))

    await Effect.runPromise(Effect.sleep(20))
    await Effect.runPromise(Effect.promise(() => Bus.publish(LSPClient.Event.Diagnostics, { path: file, serverID: "fake" })).pipe(provideInstance(cwd)))
    await waiting

    await Effect.runPromise(client.shutdown())
  })

  test("waitForDiagnostics() times out without throwing when no event arrives", async () => {
    const { client, cwd } = await createClient()
    const started = Date.now()

    await Effect.runPromise(client.waitForDiagnostics({ path: path.join(cwd, "never.ts") }).pipe(provideInstance(cwd)))

    const elapsed = Date.now() - started
    expect(elapsed).toBeGreaterThanOrEqual(2900)
    expect(elapsed).toBeLessThan(5000)

    await Effect.runPromise(client.shutdown())
  })
})
