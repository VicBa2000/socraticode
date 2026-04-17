import { Config } from "effect"

function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

export namespace Flag {
  export const OTEL_EXPORTER_OTLP_ENDPOINT = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]
  export const OTEL_EXPORTER_OTLP_HEADERS = process.env["OTEL_EXPORTER_OTLP_HEADERS"]

  export const SOCRATICODE_AUTO_SHARE = truthy("SOCRATICODE_AUTO_SHARE")
  export const SOCRATICODE_AUTO_HEAP_SNAPSHOT = truthy("SOCRATICODE_AUTO_HEAP_SNAPSHOT")
  export const SOCRATICODE_GIT_BASH_PATH = process.env["SOCRATICODE_GIT_BASH_PATH"]
  export const SOCRATICODE_CONFIG = process.env["SOCRATICODE_CONFIG"]
  export declare const SOCRATICODE_PURE: boolean
  export declare const SOCRATICODE_TUI_CONFIG: string | undefined
  export declare const SOCRATICODE_CONFIG_DIR: string | undefined
  export declare const SOCRATICODE_PLUGIN_META_FILE: string | undefined
  export const SOCRATICODE_CONFIG_CONTENT = process.env["SOCRATICODE_CONFIG_CONTENT"]
  export const SOCRATICODE_DISABLE_AUTOUPDATE = truthy("SOCRATICODE_DISABLE_AUTOUPDATE")
  export const SOCRATICODE_ALWAYS_NOTIFY_UPDATE = truthy("SOCRATICODE_ALWAYS_NOTIFY_UPDATE")
  export const SOCRATICODE_DISABLE_PRUNE = truthy("SOCRATICODE_DISABLE_PRUNE")
  export const SOCRATICODE_DISABLE_TERMINAL_TITLE = truthy("SOCRATICODE_DISABLE_TERMINAL_TITLE")
  export const SOCRATICODE_SHOW_TTFD = truthy("SOCRATICODE_SHOW_TTFD")
  export const SOCRATICODE_PERMISSION = process.env["SOCRATICODE_PERMISSION"]
  export const SOCRATICODE_DISABLE_DEFAULT_PLUGINS = truthy("SOCRATICODE_DISABLE_DEFAULT_PLUGINS")
  export const SOCRATICODE_DISABLE_LSP_DOWNLOAD = truthy("SOCRATICODE_DISABLE_LSP_DOWNLOAD")
  export const SOCRATICODE_ENABLE_EXPERIMENTAL_MODELS = truthy("SOCRATICODE_ENABLE_EXPERIMENTAL_MODELS")
  export const SOCRATICODE_DISABLE_AUTOCOMPACT = truthy("SOCRATICODE_DISABLE_AUTOCOMPACT")
  export const SOCRATICODE_DISABLE_MODELS_FETCH = truthy("SOCRATICODE_DISABLE_MODELS_FETCH")
  export const SOCRATICODE_DISABLE_MOUSE = truthy("SOCRATICODE_DISABLE_MOUSE")
  export const SOCRATICODE_DISABLE_CLAUDE_CODE = truthy("SOCRATICODE_DISABLE_CLAUDE_CODE")
  export const SOCRATICODE_DISABLE_CLAUDE_CODE_PROMPT =
    SOCRATICODE_DISABLE_CLAUDE_CODE || truthy("SOCRATICODE_DISABLE_CLAUDE_CODE_PROMPT")
  export const SOCRATICODE_DISABLE_CLAUDE_CODE_SKILLS =
    SOCRATICODE_DISABLE_CLAUDE_CODE || truthy("SOCRATICODE_DISABLE_CLAUDE_CODE_SKILLS")
  export const SOCRATICODE_DISABLE_EXTERNAL_SKILLS =
    SOCRATICODE_DISABLE_CLAUDE_CODE_SKILLS || truthy("SOCRATICODE_DISABLE_EXTERNAL_SKILLS")
  export declare const SOCRATICODE_DISABLE_PROJECT_CONFIG: boolean
  export const SOCRATICODE_FAKE_VCS = process.env["SOCRATICODE_FAKE_VCS"]
  export declare const SOCRATICODE_CLIENT: string
  export const SOCRATICODE_SERVER_PASSWORD = process.env["SOCRATICODE_SERVER_PASSWORD"]
  export const SOCRATICODE_SERVER_USERNAME = process.env["SOCRATICODE_SERVER_USERNAME"]
  export const SOCRATICODE_ENABLE_QUESTION_TOOL = truthy("SOCRATICODE_ENABLE_QUESTION_TOOL")

  // Experimental
  export const SOCRATICODE_EXPERIMENTAL = truthy("SOCRATICODE_EXPERIMENTAL")
  export const SOCRATICODE_EXPERIMENTAL_FILEWATCHER = Config.boolean("SOCRATICODE_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  )
  export const SOCRATICODE_EXPERIMENTAL_DISABLE_FILEWATCHER = Config.boolean(
    "SOCRATICODE_EXPERIMENTAL_DISABLE_FILEWATCHER",
  ).pipe(Config.withDefault(false))
  export const SOCRATICODE_EXPERIMENTAL_ICON_DISCOVERY =
    SOCRATICODE_EXPERIMENTAL || truthy("SOCRATICODE_EXPERIMENTAL_ICON_DISCOVERY")

  const copy = process.env["SOCRATICODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
  export const SOCRATICODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT =
    copy === undefined ? process.platform === "win32" : truthy("SOCRATICODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const SOCRATICODE_ENABLE_EXA =
    truthy("SOCRATICODE_ENABLE_EXA") || SOCRATICODE_EXPERIMENTAL || truthy("SOCRATICODE_EXPERIMENTAL_EXA")
  export const SOCRATICODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("SOCRATICODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const SOCRATICODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("SOCRATICODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const SOCRATICODE_EXPERIMENTAL_OXFMT = SOCRATICODE_EXPERIMENTAL || truthy("SOCRATICODE_EXPERIMENTAL_OXFMT")
  export const SOCRATICODE_EXPERIMENTAL_LSP_TY = truthy("SOCRATICODE_EXPERIMENTAL_LSP_TY")
  export const SOCRATICODE_EXPERIMENTAL_LSP_TOOL = SOCRATICODE_EXPERIMENTAL || truthy("SOCRATICODE_EXPERIMENTAL_LSP_TOOL")
  export const SOCRATICODE_DISABLE_FILETIME_CHECK = Config.boolean("SOCRATICODE_DISABLE_FILETIME_CHECK").pipe(
    Config.withDefault(false),
  )
  export const SOCRATICODE_EXPERIMENTAL_PLAN_MODE = SOCRATICODE_EXPERIMENTAL || truthy("SOCRATICODE_EXPERIMENTAL_PLAN_MODE")
  export const SOCRATICODE_EXPERIMENTAL_WORKSPACES = SOCRATICODE_EXPERIMENTAL || truthy("SOCRATICODE_EXPERIMENTAL_WORKSPACES")
  export const SOCRATICODE_EXPERIMENTAL_MARKDOWN = !falsy("SOCRATICODE_EXPERIMENTAL_MARKDOWN")
  export const SOCRATICODE_MODELS_URL = process.env["SOCRATICODE_MODELS_URL"]
  export const SOCRATICODE_MODELS_PATH = process.env["SOCRATICODE_MODELS_PATH"]
  export const SOCRATICODE_DISABLE_EMBEDDED_WEB_UI = truthy("SOCRATICODE_DISABLE_EMBEDDED_WEB_UI")
  export const SOCRATICODE_DB = process.env["SOCRATICODE_DB"]
  export const SOCRATICODE_DISABLE_CHANNEL_DB = truthy("SOCRATICODE_DISABLE_CHANNEL_DB")
  export const SOCRATICODE_SKIP_MIGRATIONS = truthy("SOCRATICODE_SKIP_MIGRATIONS")
  export const SOCRATICODE_STRICT_CONFIG_DEPS = truthy("SOCRATICODE_STRICT_CONFIG_DEPS")

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
}

// Dynamic getter for SOCRATICODE_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "SOCRATICODE_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("SOCRATICODE_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for SOCRATICODE_TUI_CONFIG
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "SOCRATICODE_TUI_CONFIG", {
  get() {
    return process.env["SOCRATICODE_TUI_CONFIG"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for SOCRATICODE_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "SOCRATICODE_CONFIG_DIR", {
  get() {
    return process.env["SOCRATICODE_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for SOCRATICODE_PURE
// This must be evaluated at access time, not module load time,
// because the CLI can set this flag at runtime
Object.defineProperty(Flag, "SOCRATICODE_PURE", {
  get() {
    return truthy("SOCRATICODE_PURE")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for SOCRATICODE_PLUGIN_META_FILE
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "SOCRATICODE_PLUGIN_META_FILE", {
  get() {
    return process.env["SOCRATICODE_PLUGIN_META_FILE"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for SOCRATICODE_CLIENT
// This must be evaluated at access time, not module load time,
// because some commands override the client at runtime
Object.defineProperty(Flag, "SOCRATICODE_CLIENT", {
  get() {
    return process.env["SOCRATICODE_CLIENT"] ?? "cli"
  },
  enumerable: true,
  configurable: false,
})
