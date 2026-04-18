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
   * Treats each assistant message together with its immediately-following
   * `tool` messages as a single atomic block. This prevents a truncation
   * that would leave an orphan `tool` message without its preceding
   * assistant tool_call — which Anthropic, Ollama, and most OpenAI-compat
   * providers reject with "Unexpected role 'tool' after role 'system'".
   *
   * Stable: preserves the relative order of what remains.
   */
  /**
   * Scan messages for orphan `tool` rows (a tool message whose preceding
   * non-tool message is not an assistant) and drop them. This is always
   * safe: a tool message without a matching assistant tool_call is
   * universally rejected by providers ("Unexpected role 'tool' after
   * role 'user'" / "... after role 'system'"). We sanitize here to
   * defend against upstream compaction bugs that leave the conversation
   * in that state even when no budget trim is needed.
   */
  export function sanitizeOrphanTools<T extends TrimmableMessage>(messages: T[]): { messages: T[]; dropped: number } {
    const drop = new Set<number>()
    let lastNonToolRole: string | null = null
    for (let i = 0; i < messages.length; i++) {
      const role = messages[i]!.role
      if (role === "tool") {
        if (lastNonToolRole !== "assistant") drop.add(i)
      } else {
        lastNonToolRole = role
      }
    }
    if (drop.size === 0) return { messages: [...messages], dropped: 0 }
    return { messages: messages.filter((_, i) => !drop.has(i)), dropped: drop.size }
  }

  export function trimHistory<T extends TrimmableMessage>(
    messages: T[],
    budgetTokens: number,
  ): TrimResult<T> {
    if (budgetTokens < 0) budgetTokens = 0

    // Always sanitize orphan tools first — they're invalid regardless
    // of whether we need to trim for budget.
    const sanitized = sanitizeOrphanTools(messages)
    messages = sanitized.messages as T[]

    const total = estimateMessagesTokens(messages)
    if (total <= budgetTokens) {
      return {
        messages: [...messages],
        dropped: sanitized.dropped,
        finalTokens: total,
        trimmed: sanitized.dropped > 0,
      }
    }

    // Group contiguous messages into atomic blocks:
    //   - assistant + following tool messages -> single block
    //   - any other role -> single-message block
    // A `tool` message is attached to the previous block ONLY IF that block
    // already contains an assistant. Otherwise the tool is orphan from the
    // start (upstream bug) and gets its own block, which naturally becomes
    // a drop candidate.
    // If a block contains any pinned message, the whole block is pinned.
    type Block = { indices: number[]; pinned: boolean; tokens: number; hasAssistant: boolean }
    const blocks: Block[] = []
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]!
      const cost = estimateTokens(m.content) + 4
      const last = blocks[blocks.length - 1]
      if (m.role === "tool" && last && last.hasAssistant) {
        last.indices.push(i)
        last.tokens += cost
        if (m.pinned) last.pinned = true
      } else {
        blocks.push({
          indices: [i],
          pinned: !!m.pinned,
          tokens: cost,
          hasAssistant: m.role === "assistant",
        })
      }
    }

    // Drop whole blocks oldest-to-newest until we fit or run out.
    const drop = new Set<number>()
    let remaining = total
    for (const block of blocks) {
      if (remaining <= budgetTokens) break
      if (block.pinned) continue
      for (const idx of block.indices) drop.add(idx)
      remaining -= block.tokens
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
