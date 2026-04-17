/**
 * Text-mode tool harness for SocraticCode (Phase 12a).
 *
 * Small local models (<14B) rarely emit valid OpenAI-style tool_call tokens.
 * They will announce a tool in prose ("I'll use the read tool") but never
 * produce the structured function_call payload the AI SDK expects — so the
 * agent loop stalls.
 *
 * This module defines a simple text protocol that small models CAN follow:
 *
 *     <tool-call>
 *     {"name": "read", "args": {"path": "/foo.ts"}}
 *     </tool-call>
 *
 * It also builds a directive that teaches the model the protocol, and
 * provides helpers to extract, strip, and format tool calls from a response.
 *
 * The directive is injected only when the capability tier is "lite" AND the
 * model lacks native tool-call support (Capability.getModelInfo). On strong
 * models we use the SDK's native path and this module is a no-op.
 */

export namespace TextTools {
  // ── Parsed call shape ────────────────────────────────────

  export interface ParsedToolCall {
    name: string
    args: Record<string, unknown>
    /** Original match text (including delimiters). Useful for stripping. */
    raw: string
  }

  export interface ExtractResult {
    /** Response text with tool-call blocks stripped. */
    cleanText: string
    calls: ParsedToolCall[]
  }

  // ── Protocol ────────────────────────────────────────────

  /**
   * The block regex. `<tool-call>...</tool-call>` with optional whitespace.
   * The body must parse as JSON with a `name` field.
   */
  const BLOCK_REGEX = /<tool-call>\s*([\s\S]*?)\s*<\/tool-call>/gi

  /**
   * Fallback syntax for models that can't produce angle-bracket tags cleanly:
   *     [[TOOL name="read" args='{"path":"/foo"}']]
   * Rarely needed; primary path is the XML-ish block.
   */
  const FALLBACK_REGEX = /\[\[TOOL\s+name=["']([a-z_][\w-]*)["']\s+args=['"]([\s\S]*?)['"]\]\]/gi

  /**
   * Extract tool calls from a model response.
   * Returns the response without the blocks, plus the structured calls.
   * Malformed blocks are dropped silently but the raw text is left in place
   * so the user at least sees what the model attempted.
   */
  export function extract(text: string): ExtractResult {
    if (!text || text.length < 20) {
      return { cleanText: text, calls: [] }
    }

    const calls: ParsedToolCall[] = []
    let cleanText = text

    // Primary: <tool-call> blocks
    let match: RegExpExecArray | null
    BLOCK_REGEX.lastIndex = 0
    while ((match = BLOCK_REGEX.exec(text)) !== null) {
      const body = match[1] ?? ""
      const parsed = safeParseCall(body, match[0]!)
      if (parsed) {
        calls.push(parsed)
        cleanText = cleanText.replace(match[0]!, "").trim()
      }
    }

    // Fallback: [[TOOL name="x" args='...']]
    FALLBACK_REGEX.lastIndex = 0
    while ((match = FALLBACK_REGEX.exec(text)) !== null) {
      const name = match[1]!
      const argsStr = match[2]!
      try {
        const args = JSON.parse(argsStr) as Record<string, unknown>
        calls.push({ name, args, raw: match[0]! })
        cleanText = cleanText.replace(match[0]!, "").trim()
      } catch {
        // malformed — leave it in place
      }
    }

    // Normalize trailing whitespace left behind
    cleanText = cleanText.replace(/\n{3,}/g, "\n\n").trim()

    return { cleanText, calls }
  }

  function safeParseCall(body: string, raw: string): ParsedToolCall | null {
    const trimmed = body.trim()
    if (!trimmed) return null
    try {
      const parsed = JSON.parse(trimmed) as { name?: unknown; args?: unknown }
      if (typeof parsed.name !== "string") return null
      const args =
        parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args)
          ? (parsed.args as Record<string, unknown>)
          : {}
      return { name: parsed.name, args, raw }
    } catch {
      return null
    }
  }

  /**
   * Whether a response contains at least one recognized tool-call block.
   */
  export function hasToolCalls(text: string): boolean {
    BLOCK_REGEX.lastIndex = 0
    if (BLOCK_REGEX.test(text)) return true
    FALLBACK_REGEX.lastIndex = 0
    return FALLBACK_REGEX.test(text)
  }

  // ── Directive ────────────────────────────────────────────

  export interface ToolSummary {
    name: string
    description: string
    /** Short parameter hint e.g. 'path: string, line?: number'. Optional. */
    paramsHint?: string
  }

  /**
   * Build the text-mode tool-calling directive to inject into the system prompt.
   *
   * Kept under ~600 chars so it doesn't dominate a 4k-context model's budget.
   * If `tools` is empty, returns null (nothing to teach).
   */
  export function buildDirective(tools: ToolSummary[]): string | null {
    if (!tools || tools.length === 0) return null

    const toolLines = tools
      .slice(0, 10) // avoid bloating on agents with 20+ tools
      .map((t) => {
        const params = t.paramsHint ? ` — params: ${t.paramsHint}` : ""
        return `  - ${t.name}: ${t.description}${params}`
      })
      .join("\n")

    return [
      "── TOOL USAGE (TEXT MODE) ──",
      "You cannot call functions directly. To use a tool, include EXACTLY one",
      "block per response in this format:",
      "",
      "<tool-call>",
      `{"name":"TOOL_NAME","args":{"PARAM":"VALUE"}}`,
      "</tool-call>",
      "",
      "Rules:",
      "  - One tool call per response. Wait for the result before the next.",
      '  - args MUST be a valid JSON object (double quotes, no trailing commas).',
      "  - No explanation inside the block — ONLY the JSON.",
      "  - Explain your reasoning outside the block.",
      "  - If no tool is needed, just answer the user directly without a block.",
      "",
      "Available tools:",
      toolLines,
    ].join("\n")
  }

  // ── Tool result formatting ──────────────────────────────

  /**
   * Format a tool result as a follow-up synthetic user turn.
   * Used by the agent loop to feed results back to the model so it can
   * continue reasoning on the next iteration.
   */
  export function formatToolResult(
    call: ParsedToolCall,
    result: { ok: boolean; output: string; error?: string },
  ): string {
    if (result.ok) {
      return [
        `<tool-result name="${call.name}">`,
        truncate(result.output, 2_000),
        `</tool-result>`,
      ].join("\n")
    }
    return [
      `<tool-result name="${call.name}" status="error">`,
      (result.error ?? "unknown error").slice(0, 500),
      `</tool-result>`,
    ].join("\n")
  }

  function truncate(s: string, max: number): string {
    if (s.length <= max) return s
    return s.slice(0, max) + `\n... [truncated ${s.length - max} chars]`
  }
}
