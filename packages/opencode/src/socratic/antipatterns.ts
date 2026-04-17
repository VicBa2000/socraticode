/**
 * Personal anti-pattern library for SocraticCode (Phase 11.5).
 *
 * Detects recurring specific error classes in the user's code/explanations
 * (e.g. loose equality, mutation where purity is expected, unhandled promise
 * rejections). After 3 occurrences the pattern is marked "active" and the
 * system prompt gets a "WATCH FOR" directive so the mentor probes for it.
 * 5 consecutive corrections deactivate it.
 */

import { SocraticDB } from "./db"

export namespace Antipatterns {
  export interface ErrorClass {
    id: string
    label: string
    /**
     * Heuristic detector. Returns true if the user's latest message exhibits
     * this error class. `topic` is the topic the turn is labelled with, used
     * to disambiguate context-dependent patterns.
     */
    test: (message: string, topic?: string | null) => boolean
  }

  export const ACTIVATION_THRESHOLD = 3
  export const DEACTIVATION_THRESHOLD = 5

  // ── Error class definitions ──────────────────────────────
  // Ordered from most specific to most general. detectErrorClass picks the
  // first match.

  export const ERROR_CLASSES: ErrorClass[] = [
    {
      id: "loose-equality",
      label: "Uses == / != instead of === / !==",
      test: (msg) => {
        // Match == or != NOT inside === or !== and not in arrow =>
        // Reject arrows by requiring no > immediately after.
        const re = /(^|[^=!<>])([!=]=)(?!=)([^=>]|$)/
        return re.test(stripStringsAndComments(msg))
      },
    },
    {
      id: "var-usage",
      label: "Uses `var` in modern JS/TS",
      test: (msg) => /\bvar\s+[A-Za-z_$]/.test(stripStringsAndComments(msg)),
    },
    {
      id: "unhandled-promise",
      label: "Promise chains without .catch or await without try/catch",
      test: (msg) => {
        const clean = stripStringsAndComments(msg)
        const hasThen = /\.then\s*\(/.test(clean)
        const hasCatch = /\.catch\s*\(/.test(clean)
        if (hasThen && !hasCatch) return true

        const hasAwait = /\bawait\s+/.test(clean)
        const hasTry = /\btry\s*\{/.test(clean)
        if (hasAwait && !hasTry) return true
        return false
      },
    },
    {
      id: "array-mutation-when-pure",
      label: "Mutates arrays when immutability/purity is the topic",
      test: (msg, topic) => {
        if (!topic) return false
        const pureTopics = [
          "immutability",
          "pure-functions",
          "functional-programming",
          "higher-order-functions",
          "react-state",
          "react-props",
        ]
        if (!pureTopics.includes(topic)) return false
        const clean = stripStringsAndComments(msg)
        return /\.(push|splice|shift|unshift|pop|reverse|sort)\s*\(/.test(clean)
      },
    },
    {
      id: "callback-nesting",
      label: "Deep callback nesting (callback hell)",
      test: (msg) => {
        const clean = stripStringsAndComments(msg)
        // 3+ function(...) { or (...) => { opens before any close
        const opens = clean.match(/(function\s*\([^)]*\)\s*\{|\([^)]*\)\s*=>\s*\{)/g)
        if (!opens || opens.length < 3) return false
        // Rough nesting: consecutive openings with few closings between
        let depth = 0
        let maxDepth = 0
        for (const ch of clean) {
          if (ch === "{") {
            depth++
            if (depth > maxDepth) maxDepth = depth
          } else if (ch === "}") {
            depth = Math.max(0, depth - 1)
          }
        }
        return maxDepth >= 4
      },
    },
  ]

  // ── Detection ────────────────────────────────────────────

  /**
   * Scan a message for known error classes.
   * Returns the first matching error class id, or null.
   */
  export function detectErrorClass(message: string, topic?: string | null): ErrorClass | null {
    if (!message || message.length < 5) return null
    for (const cls of ERROR_CLASSES) {
      try {
        if (cls.test(message, topic ?? null)) return cls
      } catch {
        // Bad regex / unexpected input — skip this class, don't crash.
      }
    }
    return null
  }

  // ── Recording ────────────────────────────────────────────

  /**
   * Record a fresh occurrence of this error class.
   * The DB layer handles activation when occurrence_count hits the threshold.
   */
  export function recordOccurrence(cls: ErrorClass): void {
    SocraticDB.recordAntipatternOccurrence(cls.id, cls.label, ACTIVATION_THRESHOLD)
  }

  /**
   * Record a correction (the user answered correctly on a topic where this
   * error class had been flagged). Deactivates after DEACTIVATION_THRESHOLD
   * consecutive corrections.
   */
  export function recordCorrection(errorClassId: string): void {
    SocraticDB.recordAntipatternCorrection(errorClassId, DEACTIVATION_THRESHOLD)
  }

  // ── System prompt directive ──────────────────────────────

  /**
   * Build the "WATCH FOR" section to inject into the system prompt when there
   * are active personal anti-patterns. Returns null when no patterns active.
   */
  export function buildDirective(): string | null {
    const active = SocraticDB.getActiveAntipatterns()
    if (active.length === 0) return null

    const lines: string[] = ["── WATCH FOR (personal anti-patterns) ──"]
    lines.push("This user has a recurring tendency toward these specific mistakes.")
    lines.push("When reviewing their code or explanations, actively probe for these:")
    for (const row of active) {
      lines.push(`  - ${row.label} (seen ${row.occurrence_count}x)`)
    }
    lines.push("If you spot one, call it out briefly and ask them to fix it before moving on.")
    return lines.join("\n")
  }

  // ── Utilities ────────────────────────────────────────────

  /**
   * Strip string literals and comments so regex heuristics don't false-match
   * inside docstrings or examples.
   */
  function stripStringsAndComments(s: string): string {
    return s
      .replace(/\/\/[^\n]*/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/"([^"\\]|\\.)*"/g, '""')
      .replace(/'([^'\\]|\\.)*'/g, "''")
      .replace(/`([^`\\]|\\.)*`/g, "``")
  }
}
