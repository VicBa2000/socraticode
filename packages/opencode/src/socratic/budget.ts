/**
 * Context budget manager for SocraticCode (Phase 12a).
 *
 * Small local models (4k-32k context) get overrun fast by long socratic
 * system prompts plus accumulated tool results. This module provides:
 *
 *   - A cheap token estimator (chars/4 heuristic, provider-agnostic).
 *   - A budget computation that accounts for system prompt + expected
 *     output buffer + per-message overhead.
 *   - A trimmer that drops the oldest non-critical messages until the
 *     remaining conversation fits under budget.
 *
 * The estimator is deliberately approximate — we under-estimate consumption
 * by <10% for English/Spanish text, which is acceptable given we already
 * keep a safety headroom (RESERVED_FOR_OUTPUT).
 */

export namespace Budget {
  /** Tokens reserved for the model's output on every turn. */
  export const RESERVED_FOR_OUTPUT = 1_500

  /** Safety headroom on top of the estimator's numbers (absorbs under-counts). */
  export const HEADROOM = 512

  /** Chars per token for the rough heuristic. 4 is a reasonable average. */
  const CHARS_PER_TOKEN = 4

  // ── Estimator ───────────────────────────────────────────

  /**
   * Estimate the token count of a string. Cheap and provider-agnostic.
   * For English and Spanish the error is <10% on messages >100 chars.
   */
  export function estimateTokens(text: string): number {
    if (!text) return 0
    return Math.ceil(text.length / CHARS_PER_TOKEN)
  }

  /**
   * Estimate tokens in an array of messages. Counts content + a fixed
   * overhead per message (the role token, wrappers).
   */
  export function estimateMessagesTokens(
    messages: Array<{ role: string; content: string }>,
  ): number {
    let total = 0
    for (const m of messages) {
      total += estimateTokens(m.content) + 4 // overhead per message
    }
    return total
  }

  // ── Budget computation ─────────────────────────────────

  export interface BudgetInput {
    /** Total context the model can handle, in tokens. */
    contextTokens: number
    /** Tokens consumed by the system prompt. */
    systemTokens: number
    /** Tokens consumed by the tool schemas (JSON or markdown-compact). */
    toolSchemaTokens: number
    /** Reserved for the model's output. Defaults to RESERVED_FOR_OUTPUT. */
    reservedOutput?: number
  }

  export interface BudgetResult {
    /** Tokens remaining for conversation history. May be negative. */
    availableForHistory: number
    /** Whether the fixed overhead already exceeds the window. */
    overflow: boolean
  }

  export function computeBudget(input: BudgetInput): BudgetResult {
    const reserved = input.reservedOutput ?? RESERVED_FOR_OUTPUT
    const fixed =
      input.systemTokens + input.toolSchemaTokens + reserved + HEADROOM
    const available = input.contextTokens - fixed
    return {
      availableForHistory: available,
      overflow: available < 0,
    }
  }

  // ── Trimmer ─────────────────────────────────────────────

  export interface TrimmableMessage {
    role: string
    content: string
    /**
     * When true, this message is preserved regardless of budget.
     * Typical uses: the latest user message, a pinned system reminder.
     */
    pinned?: boolean
  }

  export interface TrimResult<T extends TrimmableMessage> {
    messages: T[]
    /** How many messages were dropped. */
    dropped: number
    /** Token count of the resulting conversation. */
    finalTokens: number
    /** True if budget was exceeded and we trimmed. */
    trimmed: boolean
  }

  /**
   * Drop oldest non-pinned messages until the remaining conversation fits
   * under `budget`. Always keeps pinned messages; always keeps the latest
   * user message implicitly if callers mark it pinned.
   *
   * Stable: preserves the relative order of what remains.
   */
  export function trimHistory<T extends TrimmableMessage>(
    messages: T[],
    budgetTokens: number,
  ): TrimResult<T> {
    if (budgetTokens < 0) budgetTokens = 0

    const total = estimateMessagesTokens(messages)
    if (total <= budgetTokens) {
      return { messages: [...messages], dropped: 0, finalTokens: total, trimmed: false }
    }

    // Walk from oldest to newest, dropping non-pinned until we fit.
    // We keep a list of "indices to drop" then filter.
    const drop = new Set<number>()
    let remaining = total
    for (let i = 0; i < messages.length; i++) {
      if (remaining <= budgetTokens) break
      const m = messages[i]!
      if (m.pinned) continue
      drop.add(i)
      remaining -= estimateTokens(m.content) + 4
    }

    const kept = messages.filter((_, i) => !drop.has(i))
    return {
      messages: kept,
      dropped: drop.size,
      finalTokens: estimateMessagesTokens(kept),
      trimmed: drop.size > 0,
    }
  }

  /**
   * User-facing warning message when we had to trim. Short so it doesn't
   * distract from the actual response.
   */
  export function warningFor(trim: TrimResult<any>): string | null {
    if (!trim.trimmed) return null
    return `⚠ Context budget: plegados ${trim.dropped} turno(s) antiguos para caber en la ventana del modelo.`
  }
}
