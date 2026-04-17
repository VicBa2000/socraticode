/**
 * Interactive chat mode for SocraticCode.
 *
 * Writes directly to the terminal (no fullscreen TUI).
 * Works perfectly in VS Code terminal — you can scroll normally.
 *
 * Usage: socraticode chat
 */

import { cmd } from "./cmd"
import { UI } from "../ui"
import { bootstrap } from "../bootstrap"
import { Filesystem } from "../../util/filesystem"
import { createOpencodeClient, type OpencodeClient, type ToolPart } from "@opencode-ai/sdk/v2"
import { Server } from "../../server/server"
import { Provider } from "../../provider/provider"
import { Agent } from "../../agent/agent"
import * as readline from "readline"

function toolSummary(part: ToolPart): string {
  const state = part.state
  const input = "input" in state ? (state.input as Record<string, any>) : {}
  switch (part.tool) {
    case "bash":
      return `  $ ${(input.command ?? "").toString().split("\n")[0].slice(0, 100)}`
    case "glob":
      return `  glob: ${input.pattern ?? ""}`
    case "grep":
      return `  grep: ${input.pattern ?? ""}`
    case "read":
      return `  read: ${input.file_path ?? ""}`
    case "write":
      return `  write: ${input.file_path ?? ""}`
    case "edit":
      return `  edit: ${input.file_path ?? ""}`
    default:
      return `  ${part.tool}`
  }
}

const DIM = "\x1b[2m"
const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"
const CYAN = "\x1b[36m"
const GREEN = "\x1b[32m"
const YELLOW = "\x1b[33m"
const RED = "\x1b[31m"

export const ChatCommand = cmd({
  command: "chat",
  describe: "interactive chat (terminal-friendly, scrollable, no fullscreen TUI)",
  builder: (yargs) =>
    yargs
      .option("model", {
        alias: ["m"],
        type: "string",
        describe: "model to use (provider/model)",
      })
      .option("agent", {
        type: "string",
        describe: "agent to use",
      })
      .option("continue", {
        alias: ["c"],
        type: "boolean",
        describe: "continue the last session",
      })
      .option("session", {
        alias: ["s"],
        type: "string",
        describe: "session id to continue",
      })
      .option("dangerously-skip-permissions", {
        type: "boolean",
        describe: "auto-approve all permissions",
        default: false,
      }),
  handler: async (args) => {
    const directory = Filesystem.resolve(process.env.PWD ?? process.cwd())

    await bootstrap(directory, async () => {
      const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init)
        return Server.Default().app.fetch(request)
      }) as typeof globalThis.fetch
      const sdk = createOpencodeClient({ baseUrl: "http://opencode.internal", fetch: fetchFn })

      // Resolve model
      let model = args.model
      if (!model) {
        const cfg = await sdk.config.get()
        model = cfg.data?.model ?? undefined
      }

      // Create or continue session
      let sessionID: string | undefined

      if (args.continue) {
        const sessions = await sdk.session.list()
        sessionID = sessions.data?.find((s) => !s.parentID)?.id
      } else if (args.session) {
        sessionID = args.session
      }

      if (!sessionID) {
        const result = await sdk.session.create({})
        sessionID = result.data?.id
      }

      if (!sessionID) {
        UI.error("Failed to create session")
        process.exit(1)
      }

      // Print header
      console.log()
      console.log(`${BOLD}${CYAN}SocraticCode Chat${RESET}`)
      console.log(`${DIM}Directorio: ${directory}${RESET}`)
      if (model) console.log(`${DIM}Modelo: ${model}${RESET}`)
      console.log(`${DIM}Escribe tu mensaje. /exit para salir. /help para comandos.${RESET}`)
      console.log()

      // Interactive loop
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      const prompt = (): Promise<string> =>
        new Promise((resolve) => {
          rl.question(`${GREEN}> ${RESET}`, resolve)
        })

      async function sendMessage(text: string) {
        const events = await sdk.event.subscribe()
        let started = false

        // Start event loop FIRST (non-blocking), then send prompt
        const loopDone = (async () => {
          for await (const event of events.stream) {
          if (event.type === "message.updated" && event.properties.info.role === "assistant" && !started) {
            console.log()
            console.log(`${DIM}${event.properties.info.agent} · ${event.properties.info.modelID}${RESET}`)
            console.log()
            started = true
          }

          if (event.type === "message.part.updated") {
            const part = event.properties.part
            if (part.sessionID !== sessionID) continue

            if (part.type === "tool" && (part.state.status === "completed" || part.state.status === "error")) {
              if (part.state.status === "completed") {
                console.log(`${DIM}${toolSummary(part)}${RESET}`)
              } else {
                console.log(`${RED}  ✗ ${part.tool} failed${RESET}`)
              }
            }

            if (part.type === "text" && part.time?.end) {
              const text = part.text.trim()
              if (text) {
                console.log(text)
                console.log()
              }
            }
          }

          if (event.type === "session.error") {
            if (event.properties.sessionID !== sessionID) continue
            const err = event.properties.error
            const msg =
              err && "data" in err && err.data && "message" in (err.data as any)
                ? String((err.data as any).message)
                : String(err?.name ?? "Unknown error")
            console.log(`${RED}Error: ${msg}${RESET}`)
          }

          if (event.type === "permission.asked") {
            const perm = event.properties
            if (perm.sessionID !== sessionID) continue

            if (args["dangerously-skip-permissions"]) {
              await sdk.permission.reply({ requestID: perm.id, reply: "once" })
            } else {
              console.log(
                `${YELLOW}  ! Permiso: ${perm.permission} (${perm.patterns.join(", ")}) — auto-rechazado${RESET}`,
              )
              await sdk.permission.reply({ requestID: perm.id, reply: "reject" })
            }
          }

          if (
            event.type === "session.status" &&
            event.properties.sessionID === sessionID &&
            event.properties.status.type === "idle"
          ) {
            break
          }
        }
        })()

        // Send prompt after event loop is listening
        const parsedModel = model ? Provider.parseModel(model) : undefined
        await sdk.session.prompt({
          sessionID: sessionID!,
          parts: [{ type: "text", text }],
          model: parsedModel,
          ...(args.agent ? { agent: args.agent } : {}),
        })

        // Wait for the event loop to finish
        await loopDone
      }

      // Main loop
      try {
        while (true) {
          const input = await prompt()
          const trimmed = input.trim()

          if (!trimmed) continue

          if (trimmed === "/exit" || trimmed === "/quit" || trimmed === "/q") {
            console.log(`${DIM}Hasta luego!${RESET}`)
            break
          }

          if (trimmed === "/help") {
            console.log()
            console.log(`${BOLD}Comandos:${RESET}`)
            console.log(`  /exit, /q      Salir`)
            console.log(`  /clear         Nueva sesion`)
            console.log(`  /help          Esta ayuda`)
            console.log(`  ${DIM}Cualquier otra cosa se envia al modelo${RESET}`)
            console.log()
            continue
          }

          if (trimmed === "/clear" || trimmed === "/new") {
            const result = await sdk.session.create({})
            sessionID = result.data?.id
            console.log(`${DIM}Nueva sesion iniciada${RESET}`)
            console.log()
            continue
          }

          await sendMessage(trimmed)
        }
      } finally {
        rl.close()
      }
    })
  },
})
