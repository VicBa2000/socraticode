/**
 * Session Tracking for SocraticCode.
 *
 * Records each conversation turn and computes session summaries:
 * - Per-turn records: topic, correct/incorrect, hintLevel, domain, excerpts
 * - Session summaries: comprehension rate, topics explored, concepts learned
 * - Error map queries: "last time you struggled with closures..."
 * - Level change tracking within a session
 */

import { SocraticDB } from "./db"
import { Levels, type Levels as LevelsNS } from "./levels"
import type { Hints as HintsNS } from "./hints"
import type { Taxonomy } from "./taxonomy"

export namespace Tracking {
  // ── Types ─────────────────────────────────────────────────

  export interface TurnRecord {
    sessionId: string
    turnIndex: number
    topic: string | null
    correct: boolean | null
    hintLevel: HintsNS.HintLevel
    userLevel: LevelsNS.UserLevel
    domain: Taxonomy.DomainKey | null
    userExcerpt: string | null
    agentExcerpt: string | null
    accompaniedImpl: boolean
    readiness?: LevelsNS.Readiness
  }

  export interface SessionSummary {
    sessionId: string
    totalTurns: number
    correctCount: number
    incorrectCount: number
    unansweredCount: number
    comprehensionRate: number // 0.0 - 1.0
    topicsExplored: string[]
    maxHintLevel: HintsNS.HintLevel
    conceptsLearned: string[] // topics that went from error to strength
    levelChanges: LevelChange[]
    startLevel: LevelsNS.UserLevel
    endLevel: LevelsNS.UserLevel
    mode: string
    durationMs: number | null
  }

  export interface LevelChange {
    turnIndex: number
    fromLevel: LevelsNS.UserLevel
    toLevel: LevelsNS.UserLevel
    reason: string
  }

  export interface ErrorHistory {
    topic: string
    domain: string
    failCount: number
    lastHintLevel: number
    resolved: boolean
    lastSeen: number
  }

  // ── Per-Session State (in-memory) ─────────────────────────

  interface SessionTrackingState {
    turns: TurnRecord[]
    levelChanges: LevelChange[]
    startLevel: LevelsNS.UserLevel
    topicsSeen: Set<string>
    initialErrors: Set<string> // "topic:domain" keys at session start
  }

  const sessionTracking = new Map<string, SessionTrackingState>()

  // ── Session Lifecycle ─────────────────────────────────────

  /**
   * Initialize tracking for a new session.
   * Call at the start of a socratic session.
   */
  export function startSession(
    sessionId: string,
    userLevel: LevelsNS.UserLevel,
    mode: string,
  ): void {
    // Record initial error topics so we can detect concepts learned later
    const currentErrors = SocraticDB.getTopWeaknesses(50)
    const initialErrors = new Set(
      currentErrors.map((e) => `${e.topic}:${e.domain}`),
    )

    sessionTracking.set(sessionId, {
      turns: [],
      levelChanges: [],
      startLevel: userLevel,
      topicsSeen: new Set(),
      initialErrors,
    })

    // Persist session start in DB
    SocraticDB.createSession(sessionId, userLevel, mode)
  }

  /**
   * Record a single conversation turn.
   */
  export function recordTurn(record: TurnRecord): void {
    const state = sessionTracking.get(record.sessionId)
    if (!state) return

    state.turns.push(record)

    if (record.topic) {
      state.topicsSeen.add(record.topic)
    }

    // Persist as reasoning step in DB
    SocraticDB.addReasoningStep({
      session_id: record.sessionId,
      turn_index: record.turnIndex,
      topic: record.topic,
      correct: record.correct === null ? null : record.correct ? 1 : 0,
      hint_level: record.hintLevel,
      user_level: record.userLevel,
      accompanied_implementation: record.accompaniedImpl ? 1 : 0,
      user_excerpt: record.userExcerpt
        ? truncate(record.userExcerpt, 200)
        : null,
      agent_excerpt: record.agentExcerpt
        ? truncate(record.agentExcerpt, 200)
        : null,
      domain: record.domain,
      readiness: record.readiness ?? null,
      timestamp: Date.now(),
    })
  }

  /**
   * Record a level change that occurred during the session.
   */
  export function recordLevelChange(
    sessionId: string,
    turnIndex: number,
    fromLevel: LevelsNS.UserLevel,
    toLevel: LevelsNS.UserLevel,
    reason: string,
  ): void {
    const state = sessionTracking.get(sessionId)
    if (!state) return

    state.levelChanges.push({ turnIndex, fromLevel, toLevel, reason })
  }

  /**
   * End a session and compute the summary.
   * Returns the summary and persists it to DB.
   */
  export function endSession(sessionId: string): SessionSummary | null {
    const state = sessionTracking.get(sessionId)
    if (!state) return null

    const summary = computeSummary(sessionId, state)

    // Persist session summary to DB
    SocraticDB.updateSession(sessionId, {
      ended_at: Date.now(),
      total_turns: summary.totalTurns,
      correct_count: summary.correctCount,
      incorrect_count: summary.incorrectCount,
      max_hint_level: summary.maxHintLevel,
      user_level_end: summary.endLevel,
      topics: JSON.stringify(summary.topicsExplored),
      concepts_learned: JSON.stringify(summary.conceptsLearned),
    })

    // Cleanup in-memory state
    sessionTracking.delete(sessionId)

    return summary
  }

  // ── Summary Computation ───────────────────────────────────

  function computeSummary(
    sessionId: string,
    state: SessionTrackingState,
  ): SessionSummary {
    const turns = state.turns
    let correctCount = 0
    let incorrectCount = 0
    let unansweredCount = 0
    let maxHintLevel: HintsNS.HintLevel = 0

    for (const turn of turns) {
      if (turn.correct === true) correctCount++
      else if (turn.correct === false) incorrectCount++
      else unansweredCount++

      if (turn.hintLevel > maxHintLevel) {
        maxHintLevel = turn.hintLevel as HintsNS.HintLevel
      }
    }

    const answered = correctCount + incorrectCount
    const comprehensionRate = answered > 0 ? correctCount / answered : 0

    // Detect concepts learned: topics that were in initialErrors but are now resolved
    const conceptsLearned: string[] = []
    const currentErrors = SocraticDB.getTopWeaknesses(50)
    const currentErrorKeys = new Set(
      currentErrors.map((e) => `${e.topic}:${e.domain}`),
    )

    for (const errorKey of state.initialErrors) {
      if (!currentErrorKeys.has(errorKey)) {
        // This error was resolved during the session
        const topic = errorKey.split(":")[0]!
        conceptsLearned.push(topic)
      }
    }

    // Determine end level
    const lastLevelChange = state.levelChanges.at(-1)
    const endLevel = lastLevelChange
      ? lastLevelChange.toLevel
      : state.startLevel

    // Get session DB record for duration and mode
    const dbSession = SocraticDB.getSession(sessionId)
    const durationMs = dbSession?.started_at
      ? Date.now() - dbSession.started_at
      : null

    return {
      sessionId,
      totalTurns: turns.length,
      correctCount,
      incorrectCount,
      unansweredCount,
      comprehensionRate,
      topicsExplored: Array.from(state.topicsSeen),
      maxHintLevel,
      conceptsLearned,
      levelChanges: state.levelChanges,
      startLevel: state.startLevel,
      endLevel,
      mode: dbSession?.mode ?? "learn",
      durationMs,
    }
  }

  // ── Error History Queries ─────────────────────────────────

  /**
   * Get the error history for a specific topic and domain.
   * Useful for "the last time we talked about closures, you struggled..."
   */
  export function getErrorHistory(
    topic: string,
    domain: string,
  ): ErrorHistory | null {
    const weaknesses = SocraticDB.getTopWeaknesses(100)
    const match = weaknesses.find(
      (w) => w.topic === topic && w.domain === domain,
    )
    if (!match) return null

    return {
      topic: match.topic,
      domain: match.domain,
      failCount: match.fail_count,
      lastHintLevel: match.last_hint_level,
      resolved: match.resolved === 1,
      lastSeen: match.last_seen,
    }
  }

  /**
   * Check if the user has struggled with a topic before.
   * Returns a contextual message if so, null otherwise.
   */
  export function getPriorStrugglesMessage(
    topic: string,
    domain: string,
  ): string | null {
    const history = getErrorHistory(topic, domain)
    if (!history || history.resolved) return null

    if (history.failCount >= 3) {
      return (
        `This topic (${topic}) has given you trouble before — ${history.failCount} prior attempts. ` +
        "I will explain with more detail and step by step."
      )
    }

    if (history.failCount >= 1) {
      return (
        `Last time we worked with ${topic}, you needed some extra help. ` +
        "Just a reminder in case you want me to go deeper."
      )
    }

    return null
  }

  // ── Session Summary Formatting ────────────────────────────

  /**
   * Format a session summary for display (e.g., /progress command).
   */
  export function formatSummary(summary: SessionSummary): string {
    const lines: string[] = []

    lines.push("═══ Session Summary ═══")
    lines.push("")
    lines.push(`Turns: ${summary.totalTurns}`)
    lines.push(
      `Comprehension: ${summary.correctCount}/${summary.correctCount + summary.incorrectCount} ` +
        `(${Math.round(summary.comprehensionRate * 100)}%)`,
    )
    lines.push(`Max hint level: ${summary.maxHintLevel}/5`)

    if (summary.topicsExplored.length > 0) {
      lines.push(`Topics explored: ${summary.topicsExplored.join(", ")}`)
    }

    if (summary.conceptsLearned.length > 0) {
      lines.push(
        `Concepts learned: ${summary.conceptsLearned.join(", ")}`,
      )
    }

    if (summary.levelChanges.length > 0) {
      lines.push("")
      lines.push("── Level changes ──")
      for (const change of summary.levelChanges) {
        const fromName = Levels.getProfile(change.fromLevel).label
        const toName = Levels.getProfile(change.toLevel).label
        lines.push(
          `  Turn ${change.turnIndex}: ${fromName} → ${toName} (${change.reason})`,
        )
      }
    }

    if (summary.durationMs !== null) {
      const mins = Math.round(summary.durationMs / 60_000)
      lines.push(`\nDuration: ${mins} minute${mins !== 1 ? "s" : ""}`)
    }

    lines.push(
      `\nLevel: ${Levels.getProfile(summary.startLevel).label} → ${Levels.getProfile(summary.endLevel).label}`,
    )

    return lines.join("\n")
  }

  // ── Current Session Info ──────────────────────────────────

  /**
   * Get the current turn count for a session.
   */
  export function getTurnCount(sessionId: string): number {
    const state = sessionTracking.get(sessionId)
    return state?.turns.length ?? 0
  }

  /**
   * Get current session comprehension rate.
   */
  export function getCurrentComprehensionRate(sessionId: string): number {
    const state = sessionTracking.get(sessionId)
    if (!state || state.turns.length === 0) return 0

    let correct = 0
    let answered = 0
    for (const turn of state.turns) {
      if (turn.correct !== null) {
        answered++
        if (turn.correct) correct++
      }
    }

    return answered > 0 ? correct / answered : 0
  }

  // ── Progression Context ────────────────────────────────────

  export type TopicStatus = "dominated" | "in_progress" | "struggling"

  export interface TopicProgression {
    topic: string
    status: TopicStatus
    consecutiveCorrect: number
    consecutiveIncorrect: number
    totalAttempts: number
    lastTurnIndex: number
  }

  export interface ProgressionContext {
    topics: TopicProgression[]
    trajectory: string[] // visual markers: "✓ topic" or "✗ topic"
    totalTurns: number
    directive: string // injectable prompt section
  }

  /**
   * Analyze session turns and build a progression map.
   * Classifies each topic as DOMINATED, IN_PROGRESS, or STRUGGLING.
   * Returns a directive string to inject into the system prompt.
   */
  export function buildProgressionContext(sessionId: string): ProgressionContext | null {
    const state = sessionTracking.get(sessionId)
    if (!state || state.turns.length === 0) return null

    // Build topic stats from turns
    const topicMap = new Map<string, {
      results: boolean[] // chronological: true=correct, false=incorrect
      lastTurnIndex: number
    }>()

    for (const turn of state.turns) {
      if (!turn.topic || turn.correct === null) continue
      let entry = topicMap.get(turn.topic)
      if (!entry) {
        entry = { results: [], lastTurnIndex: 0 }
        topicMap.set(turn.topic, entry)
      }
      entry.results.push(turn.correct)
      entry.lastTurnIndex = turn.turnIndex
    }

    // Classify each topic
    const topics: TopicProgression[] = []
    for (const [topic, data] of topicMap) {
      const results = data.results
      let consecutiveCorrect = 0
      let consecutiveIncorrect = 0

      // Count consecutive from the end
      for (let i = results.length - 1; i >= 0; i--) {
        if (results[i]) {
          if (consecutiveIncorrect > 0) break
          consecutiveCorrect++
        } else {
          if (consecutiveCorrect > 0) break
          consecutiveIncorrect++
        }
      }

      let status: TopicStatus
      if (consecutiveCorrect >= 2) {
        status = "dominated"
      } else if (consecutiveIncorrect >= 2) {
        status = "struggling"
      } else {
        status = "in_progress"
      }

      topics.push({
        topic,
        status,
        consecutiveCorrect,
        consecutiveIncorrect,
        totalAttempts: results.length,
        lastTurnIndex: data.lastTurnIndex,
      })
    }

    // Build visual trajectory (last 10 turns with topic)
    const trajectory: string[] = []
    const recentTurns = state.turns.filter((t) => t.topic && t.correct !== null).slice(-10)
    for (const turn of recentTurns) {
      const marker = turn.correct ? "✓" : "✗"
      trajectory.push(`${marker} ${turn.topic}`)
    }

    // Build directive for system prompt injection
    const dominated = topics.filter((t) => t.status === "dominated")
    const inProgress = topics.filter((t) => t.status === "in_progress")
    const struggling = topics.filter((t) => t.status === "struggling")

    const lines: string[] = []
    lines.push("── PROGRESSION MAP FOR THIS SESSION ──")

    if (dominated.length > 0) {
      lines.push(`DOMINATED (DO NOT repeat, already understood): ${dominated.map((t) => t.topic).join(", ")}`)
    }
    if (inProgress.length > 0) {
      lines.push(`IN PROGRESS (advance, qualitatively different questions): ${inProgress.map((t) => t.topic).join(", ")}`)
    }
    if (struggling.length > 0) {
      lines.push(`STRUGGLING (simplify, more support): ${struggling.map((t) => t.topic).join(", ")}`)
    }

    if (trajectory.length > 0) {
      lines.push(`Recent trajectory: ${trajectory.join(" → ")}`)
    }

    lines.push("")
    lines.push("PROGRESSION INSTRUCTIONS:")
    lines.push("- DOMINATED topics: DO NOT ask about them again. Only mention them to connect with new concepts.")
    lines.push("- IN PROGRESS topics: advance to the next step. If you already asked about the concept, WRITE THE CODE and continue.")
    lines.push("- STRUGGLING topics: simplify, use analogies, give more direct support.")
    lines.push("- ANTI-CYCLING RULE: if you've already asked 2+ questions on the same topic without advancing, STOP asking and advance by writing code with explanation.")

    return {
      topics,
      trajectory,
      totalTurns: state.turns.length,
      directive: lines.join("\n"),
    }
  }

  // ── Helpers ───────────────────────────────────────────────

  function truncate(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text
    return text.slice(0, maxLen - 3) + "..."
  }
}
