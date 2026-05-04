import { cmd } from "./cmd"
import * as prompts from "@clack/prompts"
import { UI } from "../ui"
import { Global } from "../../global"
import path from "path"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"

const OLLAMA_LOCAL_URL = "http://localhost:11434/v1"
const OLLAMA_CLOUD_URL = "https://ollama.com/v1"
const OLLAMA_CLOUD_API_TAGS = "https://ollama.com/api/tags"
const OLLAMA_LOCAL_API_TAGS = "http://localhost:11434/api/tags"

interface OllamaModel {
  name: string
  model: string
  size: number
  details: {
    parameter_size: string
  }
}

async function fetchModels(apiTagsUrl: string): Promise<OllamaModel[]> {
  const res = await fetch(apiTagsUrl, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = (await res.json()) as { models: OllamaModel[] }
  return data.models ?? []
}

async function testApiKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch(OLLAMA_CLOUD_URL + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gemma3:4b",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
      }),
      signal: AbortSignal.timeout(15000),
    })
    // Any non-401 means the key is valid (even 400 means auth passed)
    return res.status !== 401
  } catch {
    return false
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "cloud"
  const gb = bytes / 1e9
  if (gb >= 1) return `${gb.toFixed(0)}B`
  const mb = bytes / 1e6
  return `${mb.toFixed(0)}M`
}

function loadExistingConfig(): Record<string, any> {
  const configDir = Global.Path.config
  const configPath = path.join(configDir, "socraticode.json")
  if (existsSync(configPath)) {
    try {
      return JSON.parse(readFileSync(configPath, "utf-8"))
    } catch {
      return {}
    }
  }
  return {}
}

function saveConfig(config: Record<string, any>): string {
  const configDir = Global.Path.config
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
  const configPath = path.join(configDir, "socraticode.json")
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8")
  return configPath
}

export const SetupCommand = cmd({
  command: "setup",
  describe: "configure Ollama (local or cloud) for SocraticCode",
  handler: async () => {
    prompts.intro("SocraticCode Setup")

    // Step 1: Choose source
    const source = await prompts.select({
      message: "Where do you want to run the models?",
      options: [
        { label: "Ollama Cloud (free, large models)", value: "cloud" },
        { label: "Ollama Local (your machine)", value: "local" },
      ],
    })
    if (prompts.isCancel(source)) throw new UI.CancelledError()

    let baseURL: string
    let apiKey: string
    let models: OllamaModel[]

    if (source === "cloud") {
      // Step 2a: Cloud setup
      const key = await prompts.text({
        message: "Your Ollama Cloud API key:",
        placeholder: "oll-xxxxxxxxxxxxxxxx",
        validate: (v) => {
          if (!v || v.trim().length < 5) return "API key is required"
        },
      })
      if (prompts.isCancel(key)) throw new UI.CancelledError()

      apiKey = key.trim()
      baseURL = OLLAMA_CLOUD_URL

      // Test the key
      const s = prompts.spinner()
      s.start("Testing API key...")

      const valid = await testApiKey(apiKey)
      if (!valid) {
        s.stop("Invalid API key")
        prompts.log.error("Could not authenticate with Ollama Cloud. Check your API key.")
        prompts.outro("Setup cancelled")
        process.exit(1)
      }
      s.stop("API key valid!")

      // Fetch cloud models
      s.start("Loading available models...")
      try {
        models = await fetchModels(OLLAMA_CLOUD_API_TAGS)
      } catch (e) {
        s.stop("Error loading models")
        prompts.log.error("Could not fetch models from Ollama Cloud")
        prompts.outro("Setup cancelled")
        process.exit(1)
      }
      s.stop(`${models.length} models available`)
    } else {
      // Step 2b: Local setup
      apiKey = "ollama"
      baseURL = OLLAMA_LOCAL_URL

      const s = prompts.spinner()
      s.start("Connecting to local Ollama...")

      try {
        models = await fetchModels(OLLAMA_LOCAL_API_TAGS)
      } catch {
        s.stop("Could not connect")
        prompts.log.error("Ollama is not running. Run 'ollama serve' first.")
        prompts.outro("Setup cancelled")
        process.exit(1)
      }

      if (models.length === 0) {
        s.stop("No models")
        prompts.log.error("No models installed. Run 'ollama pull qwen2.5-coder' first.")
        prompts.outro("Setup cancelled")
        process.exit(1)
      }
      s.stop(`${models.length} local models found`)
    }

    // Step 3: Sort models by size (smaller first for easier selection)
    const sorted = [...models].sort((a, b) => a.size - b.size)

    // Step 4: Pick one model — just arrows + enter, no space-toggling.
    // Users who want more than one can add entries to socraticode.json by
    // hand or re-run setup. One default is what 99% of the flow needs.
    const picked = await prompts.select({
      message: "Pick the model to use (arrows + enter):",
      options: sorted.map((m) => ({
        label: `${m.name} (${formatSize(m.size)})`,
        value: m.name,
      })),
    })
    if (prompts.isCancel(picked)) throw new UI.CancelledError()
    const defaultModel: string = picked as string
    const selected: string[] = [defaultModel]

    // Step 5: Build and save config
    const existingConfig = loadExistingConfig()

    const modelEntries: Record<string, any> = {}
    for (const name of selected) {
      const original = models.find((m) => m.name === name)
      modelEntries[name] = {
        name: name,
        limit: {
          context: 32000,
          output: 8000,
        },
        options: {},
      }
    }

    const providerConfig: Record<string, any> = {
      ...existingConfig.provider,
      "ollama-cloud": source === "cloud"
        ? {
            id: "ollama-cloud",
            name: "Ollama Cloud",
            api: "openai-compatible",
            env: [],
            options: {
              baseURL,
              apiKey,
            },
            models: modelEntries,
          }
        : existingConfig.provider?.["ollama-cloud"],
      ollama: source === "local"
        ? {
            id: "ollama",
            name: "Ollama Local",
            api: "openai-compatible",
            env: [],
            options: {
              baseURL,
              apiKey,
            },
            models: modelEntries,
          }
        : existingConfig.provider?.ollama,
    }

    // Clean undefined entries
    for (const key of Object.keys(providerConfig)) {
      if (providerConfig[key] === undefined) delete providerConfig[key]
    }

    const providerId = source === "cloud" ? "ollama-cloud" : "ollama"

    const mergedDisabled = Array.from(
      new Set([...(existingConfig.disabled_providers ?? []), "opencode"]),
    )

    const newConfig = {
      ...existingConfig,
      provider: providerConfig,
      model: existingConfig.model ?? `${providerId}/${defaultModel}`,
      disabled_providers: mergedDisabled,
    }

    const configPath = saveConfig(newConfig)

    prompts.log.success(`Config saved to: ${configPath}`)
    if (existingConfig.model && existingConfig.model !== `${providerId}/${defaultModel}`) {
      prompts.log.info(`Main model kept: ${existingConfig.model} (Ollama added as alternative)`)
      prompts.log.info(`To switch, set "model": "${providerId}/${defaultModel}" in the config or pick it in the TUI.`)
    } else {
      prompts.log.info(`Main model: ${providerId}/${defaultModel}`)
    }
    prompts.log.info(`Provider "opencode" disabled (we use Ollama)`)
    prompts.log.info(`To add more models later, edit "provider.${providerId}.models" in the config file.`)
    prompts.log.info(`To start: socraticode  (or 'bun run dev')`)

    prompts.outro("Setup complete!")
  },
})
