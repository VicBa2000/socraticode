/**
 * Pedagogical journal for SocraticCode (Phase 11.4).
 *
 * At the end of each session, distills the SessionSummary into three bullets
 * (learned / practiced / struggled) and persists them as a journal entry.
 * Provides read commands for daily, weekly and monthly rollups.
 *
 * The entry is generated heuristically from tracking data — no LLM call —
 * so session cleanup stays synchronous and deterministic.
 */

import { SocraticDB } from "./db"
import type { Tracking } from "./tracking"

export namespace Journal {
  export interface JournalEntry {
    id: number
    sessionId: string
    entryDate: string // YYYY-MM-DD
    learned: string[]
    practiced: string[]
    struggled: string[]
    totalTurns: number
    comprehensionRate: number
    createdAt: number
  }

  const DAY_MS = 24 * 60 * 60 * 1000

  // ── Entry generation ─────────────────────────────────────

  /**
   * Build a journal entry from a SessionSummary. Heuristic:
   *   - learned: conceptsLearned (error->strength transitions during session)
   *   - practiced: topicsExplored minus learned minus struggled
   *   - struggled: topics where the user answered incorrectly during the session
   *     (computed from reasoning steps — more reliable than weakness delta)
   */
  export function buildEntry(summary: Tracking.SessionSummary): Omit<JournalEntry, "id"> {
    const steps = SocraticDB.getSessionSteps(summary.sessionId)

    const struggledSet = new Set<string>()
    const practicedSet = new Set<string>()
    for (const step of steps) {
      if (!step.topic) continue
      if (step.correct === 0) struggledSet.add(step.topic)
      else if (step.correct === 1) practicedSet.add(step.topic)
    }

    const learnedSet = new Set(summary.conceptsLearned)

    // Don't double-count: a topic counted as learned isn't also practiced.
    // A topic that both succeeded and failed stays in struggled.
    for (const t of learnedSet) practicedSet.delete(t)
    for (const t of struggledSet) practicedSet.delete(t)

    const createdAt = Date.now()
    return {
      sessionId: summary.sessionId,
      entryDate: formatDate(createdAt),
      learned: Array.from(learnedSet),
      practiced: Array.from(practicedSet),
      struggled: Array.from(struggledSet),
      totalTurns: summary.totalTurns,
      comprehensionRate: summary.comprehensionRate,
      createdAt,
    }
  }

  /**
   * Generate and persist a journal entry for a finished session.
   * No-op if the summary has no meaningful data (0 turns, no topics).
   */
  export function saveFromSummary(summary: Tracking.SessionSummary): JournalEntry | null {
    if (summary.totalTurns === 0 && summary.topicsExplored.length === 0) {
      return null
    }

    const entry = buildEntry(summary)
    SocraticDB.insertJournalEntry({
      session_id: entry.sessionId,
      entry_date: entry.entryDate,
      learned: JSON.stringify(entry.learned),
      practiced: JSON.stringify(entry.practiced),
      struggled: JSON.stringify(entry.struggled),
      total_turns: entry.totalTurns,
      comprehension_rate: entry.comprehensionRate,
      created_at: entry.createdAt,
    })
    return { id: -1, ...entry }
  }

  // ── Read ─────────────────────────────────────────────────

  export function getLatest(limit = 7): JournalEntry[] {
    return SocraticDB.getLatestJournalEntries(limit).map(rowToEntry)
  }

  export function getRange(fromMs: number, toMs: number): JournalEntry[] {
    return SocraticDB.getJournalEntries(fromMs, toMs).map(rowToEntry)
  }

  function rowToEntry(row: {
    id: number
    session_id: string
    entry_date: string
    learned: string
    practiced: string
    struggled: string
    total_turns: number
    comprehension_rate: number
    created_at: number
  }): JournalEntry {
    return {
      id: row.id,
      sessionId: row.session_id,
      entryDate: row.entry_date,
      learned: safeParseArray(row.learned),
      practiced: safeParseArray(row.practiced),
      struggled: safeParseArray(row.struggled),
      totalTurns: row.total_turns,
      comprehensionRate: row.comprehension_rate,
      createdAt: row.created_at,
    }
  }

  function safeParseArray(s: string): string[] {
    try {
      const v = JSON.parse(s)
      return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
    } catch {
      return []
    }
  }

  // ── Formatting ───────────────────────────────────────────

  /**
   * One-entry block: "2026-04-17 · 12 turns · 83% · learned: X / practiced: Y / struggled: Z"
   */
  export function formatEntry(entry: JournalEntry): string {
    const lines: string[] = []
    const pct = Math.round(entry.comprehensionRate * 100)
    lines.push(`${entry.entryDate} · ${entry.totalTurns} turns · ${pct}%`)
    if (entry.learned.length > 0) lines.push(`  learned: ${entry.learned.join(", ")}`)
    if (entry.practiced.length > 0) lines.push(`  practiced: ${entry.practiced.join(", ")}`)
    if (entry.struggled.length > 0) lines.push(`  struggled: ${entry.struggled.join(", ")}`)
    return lines.join("\n")
  }

  export function formatLatest(entries: JournalEntry[]): string {
    if (entries.length === 0) {
      return "No journal entries yet. Finish a session to see your first entry."
    }
    return entries.map(formatEntry).join("\n\n")
  }

  /**
   * Weekly rollup: aggregates last 7 days. Shows unique topics per bucket,
   * total turns and overall comprehension.
   */
  export function formatWeeklyRollup(entries: JournalEntry[]): string {
    if (entries.length === 0) {
      return "No sessions in the last 7 days."
    }

    const learned = new Set<string>()
    const practiced = new Set<string>()
    const struggled = new Set<string>()
    let totalTurns = 0
    let weightedComp = 0

    for (const e of entries) {
      e.learned.forEach((t) => learned.add(t))
      e.practiced.forEach((t) => practiced.add(t))
      e.struggled.forEach((t) => struggled.add(t))
      totalTurns += e.totalTurns
      weightedComp += e.comprehensionRate * e.totalTurns
    }

    const avgComp = totalTurns > 0 ? Math.round((weightedComp / totalTurns) * 100) : 0

    const lines: string[] = []
    lines.push("═══ WEEKLY ROLLUP (7 days) ═══")
    lines.push("")
    lines.push(`Sessions: ${entries.length} · Turns: ${totalTurns} · Avg comprehension: ${avgComp}%`)
    lines.push("")
    if (learned.size > 0) lines.push(`Learned (${learned.size}): ${Array.from(learned).join(", ")}`)
    if (practiced.size > 0) lines.push(`Practiced (${practiced.size}): ${Array.from(practiced).join(", ")}`)
    if (struggled.size > 0) lines.push(`Still struggling (${struggled.size}): ${Array.from(struggled).join(", ")}`)
    return lines.join("\n")
  }

  /**
   * Monthly rollup: weekly rollup + ASCII bar chart of turns per day (last 30 days).
   */
  export function formatMonthlyRollup(entries: JournalEntry[]): string {
    if (entries.length === 0) {
      return "No sessions in the last 30 days."
    }

    const weekly = formatWeeklyRollup(entries).replace("═══ WEEKLY ROLLUP (7 days) ═══", "═══ MONTHLY ROLLUP (30 days) ═══")

    // Bucket turns by day
    const byDay = new Map<string, number>()
    for (const e of entries) {
      byDay.set(e.entryDate, (byDay.get(e.entryDate) ?? 0) + e.totalTurns)
    }

    const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]))
    if (days.length === 0) return weekly

    const maxTurns = Math.max(...days.map((d) => d[1]))
    const barWidth = 20

    const chart: string[] = []
    chart.push("")
    chart.push("── Turns per day ──")
    for (const [date, turns] of days) {
      const filled = Math.max(1, Math.round((turns / maxTurns) * barWidth))
      const bar = "█".repeat(filled) + "░".repeat(barWidth - filled)
      chart.push(`${date}  ${bar}  ${turns}`)
    }

    return weekly + "\n" + chart.join("\n")
  }

  // ── Helpers ──────────────────────────────────────────────

  function formatDate(ms: number): string {
    const d = new Date(ms)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    return `${y}-${m}-${day}`
  }

  export function daysAgo(n: number): number {
    return Date.now() - n * DAY_MS
  }
}
