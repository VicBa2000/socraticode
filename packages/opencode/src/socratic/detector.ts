/**
 * Detector for zero-knowledge signals and copy-paste behavior.
 *
 * Analyzes user messages to detect:
 * - Zero-knowledge signals: "no sé", "ni idea", "no entiendo", etc.
 * - Slow-down requests: "más lento", "no tan rápido", etc.
 * - Copy-paste indicators: sudden complexity jumps, formatting artifacts
 * - Technical vocabulary usage for level assessment
 *
 * Regex patterns for user input (ES/EN) live inline in this file — they're
 * part of the bilingual detection surface. The TECHNICAL_TERMS list lives
 * in data/technical-terms.json so contributors can extend the vocabulary.
 */

import technicalTermsJson from "./data/technical-terms.json"

export namespace Detector {
  // ── Zero-Knowledge Detection ─────────────────────────────

  const ZERO_KNOWLEDGE_PATTERNS = [
    // Spanish
    /\bno\s+s[eé]\b/i,
    /\bni\s+idea\b/i,
    /\bno\s+entiendo\b/i,
    /\bno\s+conozco\b/i,
    /\bno\s+tengo\s+idea\b/i,
    /\bqu[eé]\s+es\s+eso\b/i,
    /\bnunca\s+(he\s+)?(usado|visto|trabajado|escuchado)\b/i,
    /\bno\s+he\s+(usado|visto|trabajado|escuchado)\b/i,
    /\bno\s+me\s+suena\b/i,
    /\bestoy\s+perdid[oa]\b/i,
    /\bdesde\s+cero\b/i,
    /\bempezar\s+desde\b/i,
    /\bno\s+tengo\s+experiencia\b/i,
    /\bsoy\s+nuev[oa]\b/i,
    /\bprimera\s+vez\b/i,
    // English
    /\bi\s+don'?t\s+know\b/i,
    /\bno\s+idea\b/i,
    /\bi\s+don'?t\s+understand\b/i,
    /\bnever\s+(used|seen|worked|heard)\b/i,
    /\bi'?m\s+lost\b/i,
    /\bfrom\s+scratch\b/i,
    /\bno\s+experience\b/i,
    /\bi'?m\s+new\s+to\b/i,
    /\bfirst\s+time\b/i,
    /\bwhat\s+is\s+that\b/i,
    /\bwhat'?s\s+that\b/i,
  ]

  /**
   * Detect zero-knowledge signals in a user message.
   * Returns the number of distinct signals found.
   */
  export function detectZeroKnowledge(message: string): number {
    let count = 0
    for (const pattern of ZERO_KNOWLEDGE_PATTERNS) {
      if (pattern.test(message)) count++
    }
    return count
  }

  export function hasZeroKnowledge(message: string): boolean {
    return detectZeroKnowledge(message) > 0
  }

  // ── Slow-Down Request Detection ──────────────────────────

  const SLOW_DOWN_PATTERNS = [
    // Spanish
    /\bm[aá]s\s+lento\b/i,
    /\bm[aá]s\s+despacio\b/i,
    /\bno\s+tan\s+r[aá]pido\b/i,
    /\bpara\b.*\bexplica\b/i,
    /\bvamos\s+m[aá]s\s+lento\b/i,
    /\bpaso\s+a\s+paso\b/i,
    /\bexplica\s+mejor\b/i,
    /\bno\s+entend[ií]\b/i,
    /\brepite\b/i,
    /\bme\s+perd[ií]\b/i,
    // English
    /\bslow\s+down\b/i,
    /\bnot\s+so\s+fast\b/i,
    /\bstep\s+by\s+step\b/i,
    /\bexplain\s+(again|better|more)\b/i,
    /\bwait\b.*\bexplain\b/i,
    /\bi'?m\s+confused\b/i,
    /\bcan\s+you\s+repeat\b/i,
  ]

  export function detectSlowDownRequest(message: string): boolean {
    return SLOW_DOWN_PATTERNS.some((p) => p.test(message))
  }

  // ── Copy-Paste Detection ─────────────────────────────────

  export interface CopyPasteResult {
    isCopy: boolean
    confidence: number
    reasons: string[]
  }

  /**
   * Detect if a user message likely contains copy-pasted code.
   *
   * Heuristics:
   * 1. Very long code blocks (>15 lines) in a "new topic" context
   * 2. Multiple code blocks in one message
   * 3. Sudden sophistication jump (complex patterns from a novice)
   * 4. Formatting artifacts (tabs mixed with spaces, unusual indentation)
   */
  export function detectCopyPaste(
    message: string,
    userLevel: number,
    previousMessageLength: number,
  ): CopyPasteResult {
    const reasons: string[] = []
    let score = 0

    // Extract code blocks
    const codeBlocks = message.match(/```[\s\S]*?```/g) ?? []
    const totalCodeLines = codeBlocks.reduce((sum, block) => {
      return sum + block.split("\n").length
    }, 0)

    // Heuristic 1: Very long code block from low-level user
    if (totalCodeLines > 15 && userLevel <= 2) {
      score += 0.4
      reasons.push("long code block for novice level")
    }

    // Heuristic 2: Multiple code blocks
    if (codeBlocks.length >= 3) {
      score += 0.2
      reasons.push("multiple code blocks in one message")
    }

    // Heuristic 3: Message length jump (>5x previous)
    if (previousMessageLength > 0 && message.length > previousMessageLength * 5) {
      score += 0.2
      reasons.push("large jump in message length")
    }

    // Heuristic 4: Sophisticated patterns from novice
    if (userLevel <= 2) {
      const sophisticatedPatterns = [
        /\bawait\b.*\bPromise\.all\b/,
        /\bgeneric\b.*<.*>/,
        /\binterface\b.*\{[\s\S]*\}/,
        /\bclass\b.*\bextends\b.*\bimplements\b/,
        /\btry\b.*\bcatch\b.*\bfinally\b/,
        /\breduce\b.*=>\s*\{/,
      ]
      const sophisticatedCount = sophisticatedPatterns.filter((p) => p.test(message)).length
      if (sophisticatedCount >= 2) {
        score += 0.3
        reasons.push("advanced patterns for declared level")
      }
    }

    return {
      isCopy: score >= 0.4,
      confidence: Math.min(1.0, score),
      reasons,
    }
  }

  // ── Technical Vocabulary Detection ───────────────────────

  const TECHNICAL_TERMS: readonly string[] = technicalTermsJson.terms

  /**
   * Count how many technical terms appear in a message.
   * Used as a signal for level assessment.
   */
  export function countTechnicalTerms(message: string): number {
    const lower = message.toLowerCase()
    let count = 0
    for (const term of TECHNICAL_TERMS) {
      if (lower.includes(term)) count++
    }
    return count
  }

  export function hasTechnicalVocabulary(message: string): boolean {
    return countTechnicalTerms(message) >= 2
  }
}
