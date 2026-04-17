/**
 * Model capability detection for SocraticCode.
 *
 * Classifies a model as "strong" (full socratic prompts, HINT_META metadata,
 * complex directives) or "lite" (minimal prompts, no metadata, short bullets).
 *
 * The goal is graceful degradation on small local models (<8B params, weak
 * tool calling, poor JSON adherence) so the user with modest hardware does not
 * blame the product when the model is the bottleneck.
 *
 * Model lists + regex patterns live in data/model-capabilities.json so
 * community contributors can add/remove entries without touching TypeScript.
 * Regex strings in the JSON are compiled with the 'i' flag at module load.
 *
 * Detection order:
 *   1. SOCRATICODE_FORCE_LITE=1 env var → lite (manual override)
 *   2. SOCRATICODE_FORCE_STRONG=1 env var → strong (manual override)
 *   3. KNOWN_WEAK_MODELS match → lite (specific beats general: a known small
 *      variant like "deepseek-r1:1.5b" must win over its family prefix "deepseek-r1")
 *   4. KNOWN_STRONG_MODELS match → strong
 *   5. Parameter-size heuristic on the id → lite if tiny
 *   6. Default → strong (conservative — assume capable unless proven otherwise)
 */

import capabilitiesData from "./data/model-capabilities.json"

export namespace Capability {
  export type Level = "strong" | "lite"

  // ── Compile JSON into runtime structures once ────────────

  const KNOWN_STRONG_MODELS: string[] = capabilitiesData.strongModels
  const KNOWN_WEAK_MODELS: string[] = capabilitiesData.weakModels
  const SMALL_SIZE_REGEX: RegExp = new RegExp(capabilitiesData.smallSizeRegex, "i")
  const DEFAULT_CONTEXT: number = capabilitiesData.defaultContext

  const CONTEXT_PATTERNS: Array<[RegExp, number]> = capabilitiesData.contextSizes.map(
    (entry) => [new RegExp(entry.pattern, "i"), entry.tokens] as [RegExp, number],
  )

  const NATIVE_TOOL_PATTERNS: RegExp[] = capabilitiesData.nativeToolSupport.map(
    (p) => new RegExp(p, "i"),
  )

  const LOCAL_PATTERNS: RegExp[] = capabilitiesData.local.map((p) => new RegExp(p, "i"))

  /**
   * Decide the capability tier of a model.
   * Safe to call with undefined/empty — returns "strong" (default-permissive).
   */
  export function detectCapability(modelId: string | undefined | null): Level {
    // Manual overrides always win.
    if (process.env["SOCRATICODE_FORCE_LITE"] === "1") return "lite"
    if (process.env["SOCRATICODE_FORCE_STRONG"] === "1") return "strong"

    if (!modelId) return "strong"
    const id = modelId.toLowerCase()

    // Check weak BEFORE strong so specific small variants (e.g. "deepseek-r1:1.5b")
    // override broader family matches (e.g. "deepseek-r1").
    if (KNOWN_WEAK_MODELS.some((m) => id.includes(m.toLowerCase()))) {
      return "lite"
    }
    if (KNOWN_STRONG_MODELS.some((m) => id.includes(m.toLowerCase()))) {
      return "strong"
    }
    if (SMALL_SIZE_REGEX.test(id)) {
      return "lite"
    }

    return "strong"
  }

  /**
   * Convenience boolean for prompt-building sites.
   */
  export function isLite(modelId: string | undefined | null): boolean {
    return detectCapability(modelId) === "lite"
  }

  // ── Extended model info (Phase 12a) ──────────────────────

  /**
   * Per-model metadata. Used to budget context, decide whether to use
   * native tool-calling vs text-mode, and surface warnings to the user.
   *
   * contextTokens is an approximation — for the real number, the provider
   * config should override via CONTEXT_OVERRIDES.
   */
  export interface ModelInfo {
    id: string
    tier: Level
    /** Approximate usable context window in tokens. */
    contextTokens: number
    /** Whether the model reliably emits OpenAI-style tool_calls. */
    nativeToolSupport: boolean
    /** Whether the id looks like a local Ollama model (for prewarm, etc). */
    isLocal: boolean
  }

  export function getModelInfo(modelId: string | undefined | null): ModelInfo {
    const id = (modelId ?? "").toLowerCase()

    const tier = detectCapability(modelId)

    let contextTokens = DEFAULT_CONTEXT
    for (const [pattern, size] of CONTEXT_PATTERNS) {
      if (pattern.test(id)) {
        contextTokens = size
        break
      }
    }

    const nativeToolSupport = NATIVE_TOOL_PATTERNS.some((p) => p.test(id))
    const isLocal = LOCAL_PATTERNS.some((p) => p.test(id))

    return {
      id: modelId ?? "",
      tier,
      contextTokens,
      nativeToolSupport,
      isLocal,
    }
  }
}
