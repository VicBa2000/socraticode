/**
 * Spaced repetition system for SocraticCode (Phase 11.1).
 *
 * Implements a Leitner-style schedule: weaknesses surface again 1/3/7/14 days
 * after they were last seen, based on fail_count. When the user answers the
 * review micro-question correctly, the weakness is marked resolved.
 *
 * One review candidate per session, injected into the system prompt only on
 * the first turn of a session (when state is freshly created).
 */

import { SocraticDB } from "./db"
import { Levels, type Levels as LevelsNS } from "./levels"

export namespace Review {
  export interface ReviewCandidate {
    topic: string
    domain: string
    failCount: number
    lastSeen: number
    daysSince: number
  }

  const DAY_MS = 24 * 60 * 60 * 1000

  /**
   * Leitner intervals in days indexed by fail_count (1-based).
   * fail_count 1 -> 1 day, 2 -> 3 days, 3 -> 7 days, 4+ -> 14 days.
   */
  function intervalDays(failCount: number): number {
    if (failCount <= 1) return 1
    if (failCount === 2) return 3
    if (failCount === 3) return 7
    return 14
  }

  /**
   * Compute the next review timestamp (epoch ms) for a weakness.
   */
  export function scheduleNextReview(failCount: number, lastSeen: number): number {
    return lastSeen + intervalDays(failCount) * DAY_MS
  }

  /**
   * Pick the most urgent weakness that is due for review.
   * Returns null if no candidate exists.
   *
   * Urgency = most days past its next_review_at. If next_review_at is null
   * (legacy row), fall back to last_seen + interval.
   */
  export function getReviewCandidate(): ReviewCandidate | null {
    const now = Date.now()
    const rows = SocraticDB.getReviewCandidates(10)
    if (rows.length === 0) return null

    let best: {
      row: (typeof rows)[number]
      due: number
    } | null = null

    for (const row of rows) {
      const due = row.next_review_at ?? scheduleNextReview(row.fail_count, row.last_seen)
      if (due > now) continue
      if (!best || due < best.due) {
        best = { row, due }
      }
    }

    if (!best) return null

    return {
      topic: best.row.topic,
      domain: best.row.domain,
      failCount: best.row.fail_count,
      lastSeen: best.row.last_seen,
      daysSince: Math.max(1, Math.floor((now - best.row.last_seen) / DAY_MS)),
    }
  }

  /**
   * Build the review prompt section injected into the system prompt.
   * Stays short so it doesn't overpower the main conversation.
   */
  export function buildReviewPrompt(
    candidate: ReviewCandidate,
    userLevel: LevelsNS.UserLevel,
  ): string {
    const style =
      userLevel <= 2
        ? "Ask a gentle, concrete check question with a short example."
        : userLevel === 3
          ? "Ask a focused check question that forces them to justify, not just recall."
          : "Ask a sharp edge-case or trade-off question that exposes shallow understanding."

    return [
      "── SPACED REVIEW ──",
      `The user struggled with "${candidate.topic}" (domain: ${candidate.domain}) about ${candidate.daysSince} day(s) ago.`,
      "Before answering their new request, surface a brief spaced-repetition check on that topic.",
      `Open the turn with one line acknowledging the prior difficulty, then: ${style}`,
      "Keep the review under 3 lines. Wait for their answer before continuing with the new request.",
      `If they answer correctly, tag the metadata with topic="${candidate.topic}" and correct=true so the system can mark it resolved.`,
    ].join("\n")
  }

  /**
   * Mark a weakness as resolved after a successful review answer.
   * Also bumps next_review_at far into the future so it won't trigger again soon.
   */
  export function markResolved(topic: string, domain: string): void {
    SocraticDB.resolveError(topic, domain)
  }

  /**
   * Called after recording/updating an error. Refreshes next_review_at
   * based on the current fail_count and last_seen.
   */
  export function refreshSchedule(topic: string, domain: string): void {
    const row = SocraticDB.getErrorRow(topic, domain)
    if (!row) return
    const next = scheduleNextReview(row.fail_count, row.last_seen)
    SocraticDB.setNextReviewAt(topic, domain, next)
  }
}
