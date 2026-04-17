/**
 * Gapped code generator for SocraticCode.
 *
 * Generates code with strategic blanks (___) for intermediate users
 * in learn mode. The gaps target key concepts that the user should
 * understand, not trivial syntax.
 *
 * Used by the interceptor when level=3 and mode=learn.
 */

export namespace Gaps {
  export const GAP_MARKER = "___"

  export interface GapResult {
    code: string
    gapCount: number
    hints: string[]
  }

  /**
   * Generate a directive for the LLM to produce gapped code.
   * Rather than transforming code ourselves (which would require understanding it),
   * we instruct the LLM to write code with strategic gaps.
   */
  export function getGapDirective(): string {
    return [
      "GAPPED CODE — MODE ACTIVE:",
      `When you write code, replace key values with "${GAP_MARKER}" (three underscores).`,
      "",
      "RULES for choosing what to replace:",
      "1. Replace values that require UNDERSTANDING, not memorization:",
      "   - HTTP status codes (401, 403, 500)",
      "   - Array/string indices that require logic",
      "   - Key configuration variables",
      "   - Important logical conditions",
      "2. DO NOT replace:",
      "   - Variable or function names",
      "   - Imports or requires",
      "   - Syntactic structure (braces, parentheses)",
      "   - Trivial things that add no learning value",
      "3. Maximum 3-5 gaps per code block.",
      "4. After the code, add hints in question form:",
      '   "Hint: Which HTTP status indicates \'unauthorized\'?"',
      "",
      "EXAMPLE:",
      "```javascript",
      "function authenticate(req, res, next) {",
      "  const token = req.headers.authorization?.split(' ')[___];",
      "  if (!token) {",
      `    return res.status(${GAP_MARKER}).json({ error: '${GAP_MARKER}' });`,
      "  }",
      "  // ... rest",
      "}",
      "```",
      'Hints: Which position in the split has the token? Which HTTP status indicates "unauthorized"?',
    ].join("\n")
  }

  /**
   * Count the number of gaps in a code string.
   * Useful for tracking and validation.
   */
  export function countGaps(code: string): number {
    const matches = code.match(/___/g)
    return matches ? matches.length : 0
  }

  /**
   * Check if a user's answer fills a gap correctly.
   * Simple string comparison — the actual validation is done by the LLM
   * via the hint system. This is just a utility for quick checks.
   */
  export function normalizeAnswer(answer: string): string {
    return answer.trim().toLowerCase().replace(/['"`;]/g, "")
  }
}
