/**
 * Compact tool-schema descriptor for SocraticCode (Phase 12b).
 *
 * The AI SDK ships every registered tool as a full JSON Schema payload in
 * the system prompt. For strong cloud models that's fine — they parse
 * schemas natively. For local 7-14B models it's a tax: it bloats the
 * context and the model rarely honors the schema anyway.
 *
 * This module produces a ~50-80% smaller markdown description of the same
 * tools, suitable for pairing with the text-mode tool harness (text-tools.ts).
 *
 * Used only when:
 *   - Capability tier is "lite" AND
 *   - nativeToolSupport is false (per Capability.getModelInfo)
 */

import { TextTools } from "./text-tools"

export namespace ToolSchemaMarkdown {
  export interface ToolDefinition {
    name: string
    description?: string
    /**
     * Optional JSON-Schema-like object. We only read `properties` and
     * `required`; anything else is ignored. Passing a full JSON Schema
     * directly works.
     */
    parameters?: {
      properties?: Record<string, { type?: string; description?: string }>
      required?: string[]
    }
  }

  /**
   * Convert a single tool to a one-line paramsHint string.
   * Example output: "path: string (required), line?: number"
   */
  export function paramsHint(def: ToolDefinition): string | undefined {
    const props = def.parameters?.properties
    if (!props) return undefined
    const required = new Set(def.parameters?.required ?? [])
    const parts: string[] = []
    for (const [name, spec] of Object.entries(props)) {
      const type = spec.type ?? "any"
      const optional = required.has(name) ? "" : "?"
      parts.push(`${name}${optional}: ${type}`)
    }
    return parts.join(", ") || undefined
  }

  /**
   * Convert an array of tool definitions to the ToolSummary shape expected
   * by TextTools.buildDirective.
   */
  export function toSummaries(defs: ToolDefinition[]): TextTools.ToolSummary[] {
    return defs.map((d) => ({
      name: d.name,
      description: d.description ?? "",
      paramsHint: paramsHint(d),
    }))
  }

  /**
   * Full markdown rendering. Useful when injected standalone (e.g., in the
   * system prompt's "Available tools:" section when NOT using text-mode).
   */
  export function render(defs: ToolDefinition[]): string {
    if (!defs.length) return ""
    const lines: string[] = ["Available tools:"]
    for (const d of defs) {
      const hint = paramsHint(d)
      lines.push(`  - ${d.name}: ${d.description ?? ""}${hint ? ` (${hint})` : ""}`)
    }
    return lines.join("\n")
  }

  /**
   * Estimate savings vs JSON Schema. Crude: JSON Schema for a 3-param tool
   * is ~150 tokens; markdown line is ~15. ~10x for simple tools.
   */
  export function estimateCharCount(defs: ToolDefinition[]): number {
    return render(defs).length
  }
}
