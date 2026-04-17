import { cmd } from "./cmd"
import { UI } from "../ui"
import { Capability } from "../../socratic/capability"
import { TextTools } from "../../socratic/text-tools"
import { Budget } from "../../socratic/budget"
import { Prewarm } from "../../socratic/prewarm"

/**
 * `socraticode benchmark <provider/model>` — probe a model's fitness for
 * socratic use. Measures, for a short suite of prompts:
 *
 *   1. Availability: does the endpoint respond at all?
 *   2. Latency: time-to-first-token + total generation time.
 *   3. Instruction following: does it respect a structural directive?
 *   4. JSON adherence: can it produce a valid JSON object?
 *   5. Tool-call adherence: can it follow the text-mode tool protocol?
 *   6. Context recall: does it remember an earlier detail?
 *
 * Output is a pass/fail grid + a recommendation (strong/lite/avoid).
 * No LLM judge — every check is deterministic string match / parse.
 *
 * Usage:
 *   socraticode benchmark ollama/qwen3:4b
 *   socraticode benchmark ollama-cloud/minimax-m2
 *
 * The provider config in ~/.config/socraticode/socraticode.json is read
 * to find baseURL + apiKey for the given provider.
 */

interface ProviderConfig {
  options?: {
    baseURL?: string
    apiKey?: string
  }
}

interface BenchResult {
  name: string
  ok: boolean
  detail: string
  latencyMs?: number
}

async function readConfig(): Promise<Record<string, any>> {
  const { Global } = await import("../../global")
  const path = await import("path")
  const fs = await import("fs")
  const cfgPath = path.join(Global.Path.config, "socraticode.json")
  try {
    return JSON.parse(fs.readFileSync(cfgPath, "utf-8"))
  } catch {
    return {}
  }
}

async function resolveProvider(
  modelSpec: string,
): Promise<{ baseURL: string; apiKey?: string; modelName: string } | null> {
  const [providerId, ...rest] = modelSpec.split("/")
  const modelName = rest.join("/")
  if (!providerId || !modelName) return null

  const cfg = await readConfig()
  const provider = cfg.provider?.[providerId] as ProviderConfig | undefined
  if (!provider?.options?.baseURL) return null

  return {
    baseURL: provider.options.baseURL,
    apiKey: provider.options.apiKey,
    modelName,
  }
}

async function chat(opts: {
  baseURL: string
  apiKey?: string
  model: string
  messages: Array<{ role: string; content: string }>
  maxTokens?: number
  timeoutMs?: number
}): Promise<{
  text: string
  latencyMs: number
  error?: string
  /** For reasoning models (qwen3, deepseek-r1), the internal chain-of-thought
   *  is exposed in a separate field. The availability probe accepts this as
   *  proof-of-life; other probes need `text` to be populated. */
  reasoning?: string
}> {
  const start = Date.now()
  try {
    const res = await fetch(joinUrl(opts.baseURL, "chat/completions"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        // Reasoning models (qwen3, deepseek-r1) burn tokens inside a thinking
        // block before emitting content — a tiny cap empties `content`.
        max_tokens: opts.maxTokens ?? 512,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
    })
    const latencyMs = Date.now() - start
    if (!res.ok) {
      return { text: "", latencyMs, error: `HTTP ${res.status}` }
    }
    const data = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string; reasoning?: string; reasoning_content?: string }
      }>
    }
    const msg = data.choices?.[0]?.message ?? {}
    const text = msg.content ?? ""
    const reasoning = msg.reasoning ?? msg.reasoning_content ?? ""
    return { text, reasoning, latencyMs }
  } catch (err) {
    return {
      text: "",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base
  const p = path.startsWith("/") ? path.slice(1) : path
  return `${b}/${p}`
}

// ── Probes ────────────────────────────────────────────────

async function probeAvailability(cfg: {
  baseURL: string
  apiKey?: string
  model: string
}): Promise<BenchResult> {
  // 180s budget on first touch — an 8B model cold-loading from disk into
  // VRAM can take 30-60s on modest hardware, more for bigger weights.
  const r = await chat({
    ...cfg,
    messages: [{ role: "user", content: "Say OK." }],
    maxTokens: 256,
    timeoutMs: 180_000,
  })
  if (r.error) return { name: "availability", ok: false, detail: r.error, latencyMs: r.latencyMs }
  // Reasoning models may leave `content` empty — reasoning field proves life.
  const responded = r.text.length > 0 || (r.reasoning ?? "").length > 0
  const preview = (r.text || r.reasoning || "").slice(0, 50)
  return { name: "availability", ok: responded, detail: preview, latencyMs: r.latencyMs }
}

async function probeInstructionFollowing(cfg: {
  baseURL: string
  apiKey?: string
  model: string
}): Promise<BenchResult> {
  const r = await chat({
    ...cfg,
    messages: [
      {
        role: "user",
        content:
          "Respond with exactly one line containing only the word BANANA. No explanation, no punctuation.",
      },
    ],
    maxTokens: 512,
  })
  const trimmed = r.text.trim().toUpperCase()
  // Accept BANANA anywhere on the first non-empty line — some small models
  // prepend a brief lead-in despite the instruction. Strict "first word only".
  const firstLine = trimmed.split(/\n/).find((l) => l.trim().length > 0) ?? ""
  const ok = /^BANANA\b/.test(firstLine)
  return { name: "instruction", ok, detail: r.text.slice(0, 50), latencyMs: r.latencyMs }
}

async function probeJSONOutput(cfg: {
  baseURL: string
  apiKey?: string
  model: string
}): Promise<BenchResult> {
  const r = await chat({
    ...cfg,
    messages: [
      {
        role: "user",
        content:
          'Output ONLY a JSON object with keys "name" (string) and "count" (number). No markdown, no fence, no prose. Example: {"name":"x","count":3}',
      },
    ],
    maxTokens: 512,
  })
  try {
    // tolerate markdown fences
    const cleaned = r.text.replace(/```(json)?/gi, "").trim()
    const parsed = JSON.parse(cleaned) as { name?: unknown; count?: unknown }
    const ok = typeof parsed.name === "string" && typeof parsed.count === "number"
    return {
      name: "json",
      ok,
      detail: ok ? "valid JSON" : "parsed but wrong shape",
      latencyMs: r.latencyMs,
    }
  } catch {
    return { name: "json", ok: false, detail: "parse failed", latencyMs: r.latencyMs }
  }
}

async function probeToolCall(cfg: {
  baseURL: string
  apiKey?: string
  model: string
}): Promise<BenchResult> {
  const directive = TextTools.buildDirective([
    { name: "read_file", description: "Read a file", paramsHint: "path: string" },
  ])
  const r = await chat({
    ...cfg,
    messages: [
      { role: "system", content: directive ?? "" },
      {
        role: "user",
        content: "I want to read /etc/hosts. Use the tool.",
      },
    ],
    maxTokens: 512,
  })
  const parsed = TextTools.extract(r.text)
  const ok = parsed.calls.length > 0 && parsed.calls[0]!.name === "read_file"
  return {
    name: "tool-call",
    ok,
    detail: ok ? "emitted <tool-call> block" : "did not follow protocol",
    latencyMs: r.latencyMs,
  }
}

async function probeContextRecall(cfg: {
  baseURL: string
  apiKey?: string
  model: string
}): Promise<BenchResult> {
  const r = await chat({
    ...cfg,
    messages: [
      { role: "user", content: "My favorite color is ultramarine. Remember that." },
      { role: "assistant", content: "Noted: ultramarine." },
      { role: "user", content: "What is my favorite color? One word only." },
    ],
    maxTokens: 256,
  })
  const ok = /ultramarine/i.test(r.text)
  return { name: "context-recall", ok, detail: r.text.slice(0, 50), latencyMs: r.latencyMs }
}

// ── Report ────────────────────────────────────────────────

function recommendation(results: BenchResult[], info: Capability.ModelInfo): string {
  const passing = results.filter((r) => r.ok).length
  const total = results.length
  const availability = results.find((r) => r.name === "availability")?.ok ?? false

  if (!availability) return "AVOID — model is not reachable"
  if (passing === total) return "STRONG — full socratic features will work"
  if (passing >= total - 1) return "STRONG — minor quirks, usable with full prompts"
  if (passing >= Math.ceil(total / 2))
    return `LITE — use SOCRATICODE_FORCE_LITE=1 and text-mode tools (ctx=${info.contextTokens})`
  return "AVOID — too many probes failed; pick a bigger model"
}

function formatReport(
  modelSpec: string,
  info: Capability.ModelInfo,
  results: BenchResult[],
): string {
  const lines: string[] = []
  lines.push(`── Benchmark: ${modelSpec} ──`)
  lines.push(
    `  Tier: ${info.tier} · Context: ${info.contextTokens} tok · Native tools: ${info.nativeToolSupport ? "yes" : "no"} · Local: ${info.isLocal ? "yes" : "no"}`,
  )
  lines.push("")
  for (const r of results) {
    const mark = r.ok ? "✓" : "✗"
    const lat = r.latencyMs !== undefined ? ` (${r.latencyMs}ms)` : ""
    lines.push(`  ${mark} ${r.name.padEnd(18)} ${r.detail}${lat}`)
  }
  lines.push("")
  const avgLatency = Math.round(
    results.filter((r) => r.latencyMs).reduce((s, r) => s + (r.latencyMs ?? 0), 0) /
      Math.max(1, results.length),
  )
  lines.push(`  Average latency: ${avgLatency}ms`)
  lines.push(`  Recommendation: ${recommendation(results, info)}`)
  return lines.join("\n")
}

// ── Command ───────────────────────────────────────────────

export const BenchmarkCommand = cmd({
  command: "benchmark <model>",
  describe:
    "probe a model's fitness for socratic use (availability, JSON, tool calls, context)",
  builder: (y) =>
    y.positional("model", {
      type: "string",
      describe: 'model spec, e.g. "ollama/qwen3:4b" or "ollama-cloud/minimax-m2"',
      demandOption: true,
    }),
  handler: async (argv) => {
    const spec = String(argv["model"])
    UI.println(`Benchmarking ${spec} ...`)

    const resolved = await resolveProvider(spec)
    if (!resolved) {
      UI.println(`✗ Could not resolve "${spec}". Check ~/.config/socraticode/socraticode.json`)
      return
    }

    const cfg = {
      baseURL: resolved.baseURL,
      apiKey: resolved.apiKey,
      model: resolved.modelName,
    }

    const info = Capability.getModelInfo(spec)
    const budget = Budget.computeBudget({
      contextTokens: info.contextTokens,
      systemTokens: 800, // typical socratic base
      toolSchemaTokens: info.nativeToolSupport ? 1500 : 200,
    })
    UI.println(
      `Context budget: ${budget.availableForHistory} tok free for history (after system + tools + output reserve).`,
    )

    // Pre-warm for local models — the first call otherwise pays the cost of
    // loading weights into VRAM, which can mask everything else with a huge
    // cold-start latency.
    if (info.isLocal || resolved.baseURL.includes("localhost")) {
      UI.println("Pre-warming (loading weights into VRAM may take 30-60s on first run)...")
      const warm = await Prewarm.prewarm({
        baseURL: resolved.baseURL,
        apiKey: resolved.apiKey,
        modelID: cfg.model,
      })
      if (warm.attempted) {
        UI.println(
          `  ${warm.ok ? "warmed" : "warmup failed"} in ${warm.durationMs}ms${warm.error ? ` (${warm.error})` : ""}`,
        )
      }
    }
    UI.println("")

    // Run probes sequentially so we keep the model warm across them.
    const results: BenchResult[] = []
    results.push(await probeAvailability(cfg))

    // If not reachable, skip the rest — there's nothing to measure.
    if (!results[0]!.ok) {
      UI.println(formatReport(spec, info, results))
      return
    }

    results.push(await probeInstructionFollowing(cfg))
    results.push(await probeJSONOutput(cfg))
    results.push(await probeToolCall(cfg))
    results.push(await probeContextRecall(cfg))

    UI.println(formatReport(spec, info, results))
  },
})
