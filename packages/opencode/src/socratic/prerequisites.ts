/**
 * Prerequisite enforcement system for SocraticCode (Phase 11.2).
 *
 * Detects when a user is asking about an advanced topic without having
 * mastered the prerequisites, and inserts a pedagogical interruption so the
 * mentor verifies the base before building on shaky ground.
 *
 * Skipped for advanced users (level >= 4) — they can self-assess.
 */

import { SocraticDB } from "./db"
import { PrereqData } from "./prereq-data"
import type { Levels as LevelsNS } from "./levels"

export namespace Prerequisites {
  export interface Gap {
    targetTopic: string
    missingPrereq: string
    /** Full chain from target -> missing (ordered root-first). Useful for logging. */
    chain: string[]
  }

  const MAX_DEPTH = 2

  // ── Topic detection ──────────────────────────────────────

  /**
   * Detect the primary topic a user message refers to.
   * Returns the topic id (kebab-case) or null if no clear match.
   *
   * When multiple topics match, picks the one with the longest, most specific
   * keyword match — this favors "async/await" over the generic "async ".
   */
  export function detectTopic(message: string): string | null {
    const lower = message.toLowerCase()

    let best: { topic: string; score: number } | null = null

    for (const [topic, keywords] of Object.entries(PrereqData.TOPIC_KEYWORDS)) {
      for (const kw of keywords) {
        const matched = kw.length <= 3 ? matchWordBoundary(lower, kw) : lower.includes(kw)
        if (!matched) continue
        const score = kw.length
        if (!best || score > best.score) {
          best = { topic, score }
        }
      }
    }

    return best?.topic ?? null
  }

  function matchWordBoundary(haystack: string, needle: string): boolean {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(needle)}([^a-z0-9]|$)`, "i")
    return re.test(haystack)
  }

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  // ── Prerequisite resolution ──────────────────────────────

  /**
   * Return all prerequisites for a topic, up to MAX_DEPTH levels deep.
   * Order: closest (direct) prereqs first, then grandchildren, etc.
   * Cycles and duplicates are filtered.
   */
  export function getPrerequisites(topic: string, depth = MAX_DEPTH): string[] {
    const out: string[] = []
    const seen = new Set<string>([topic])
    let frontier: string[] = [topic]

    for (let d = 0; d < depth; d++) {
      const next: string[] = []
      for (const t of frontier) {
        const prereqs = PrereqData.GRAPH[t]
        if (!prereqs) continue
        for (const p of prereqs) {
          if (seen.has(p)) continue
          seen.add(p)
          out.push(p)
          next.push(p)
        }
      }
      if (next.length === 0) break
      frontier = next
    }

    return out
  }

  /**
   * Check if a topic is considered mastered.
   * Uses SocraticDB.hasTopicStrength with a minimum success count.
   */
  export function checkMastery(topic: string): boolean {
    try {
      return SocraticDB.hasTopicStrength(topic)
    } catch {
      return false
    }
  }

  /**
   * Find the first (nearest) unmastered prerequisite for a requested topic.
   * Returns null if all prereqs are mastered or the topic has none.
   *
   * "Nearest" = direct parent if it's unmastered; only recurses to grandchildren
   * if the direct parent is mastered. This keeps interruptions minimal.
   */
  export function findGap(requestedTopic: string): Gap | null {
    const direct = PrereqData.GRAPH[requestedTopic]
    if (!direct || direct.length === 0) return null

    for (const prereq of direct) {
      if (!checkMastery(prereq)) {
        return {
          targetTopic: requestedTopic,
          missingPrereq: prereq,
          chain: [requestedTopic, prereq],
        }
      }
    }

    // All direct prereqs mastered — peek one level deeper to catch fragile bases.
    for (const prereq of direct) {
      const grandparents = PrereqData.GRAPH[prereq]
      if (!grandparents) continue
      for (const gp of grandparents) {
        if (!checkMastery(gp)) {
          return {
            targetTopic: requestedTopic,
            missingPrereq: gp,
            chain: [requestedTopic, prereq, gp],
          }
        }
      }
    }

    return null
  }

  // ── Directive building ───────────────────────────────────

  /**
   * Build the system-prompt directive that tells the LLM to verify a
   * prerequisite before answering the user's original request.
   *
   * Kept short to avoid overwhelming the base prompt. The mentor keeps the
   * request "in memory" and returns to it after the check.
   */
  export function buildGapDirective(gap: Gap, userLevel: LevelsNS.UserLevel): string {
    const style =
      userLevel <= 2
        ? "Ask a concrete, low-stakes verification question with a short example if helpful."
        : "Ask a sharp check question — no hand-holding — that forces the user to demonstrate real understanding."

    return [
      "── PREREQUISITE GAP DETECTED ──",
      `User is asking about "${gap.targetTopic}" but has not demonstrated mastery of "${gap.missingPrereq}".`,
      `Before addressing the request, pause and verify "${gap.missingPrereq}" first.`,
      `${style}`,
      "Hold the original request in mind — once the prereq is confirmed (or filled in), continue with it naturally.",
      `When they answer correctly, tag metadata with topic="${gap.missingPrereq}" and correct=true so the system records the strength.`,
    ].join("\n")
  }

  /**
   * Whether the prerequisite check should run for this user level.
   * Experts/advanced users (>=4) self-assess and find enforcement patronizing.
   */
  export function shouldEnforce(userLevel: LevelsNS.UserLevel): boolean {
    return userLevel < 4
  }
}
