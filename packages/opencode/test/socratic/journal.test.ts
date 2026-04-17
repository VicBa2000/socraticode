import { describe, test, expect, beforeEach } from "bun:test"
import { Journal } from "../../src/socratic/journal"
import { SocraticDB } from "../../src/socratic/db"
import { resetSocraticDB } from "./_helpers"
import type { Tracking } from "../../src/socratic/tracking"

beforeEach(() => {
  resetSocraticDB()
})

function mkSummary(overrides: Partial<Tracking.SessionSummary> = {}): Tracking.SessionSummary {
  return {
    sessionId: "s",
    totalTurns: 0,
    correctCount: 0,
    incorrectCount: 0,
    unansweredCount: 0,
    comprehensionRate: 0,
    topicsExplored: [],
    maxHintLevel: 0,
    conceptsLearned: [],
    levelChanges: [],
    startLevel: 3,
    endLevel: 3,
    mode: "learn",
    durationMs: null,
    ...overrides,
  }
}

function seedSession(sessionId: string, steps: Array<{ topic: string; correct: 0 | 1; turn: number }>) {
  SocraticDB.createSession(sessionId, 3, "learn")
  for (const s of steps) {
    SocraticDB.addReasoningStep({
      session_id: sessionId,
      turn_index: s.turn,
      topic: s.topic,
      correct: s.correct,
      hint_level: 0,
      user_level: 3,
    })
  }
}

describe("Journal.buildEntry", () => {
  test("empty session → empty arrays", () => {
    seedSession("s1", [])
    const entry = Journal.buildEntry(mkSummary({ sessionId: "s1" }))
    expect(entry.learned).toEqual([])
    expect(entry.practiced).toEqual([])
    expect(entry.struggled).toEqual([])
  })

  test("classifies topics into learned / practiced / struggled", () => {
    seedSession("s2", [
      { topic: "closures", correct: 1, turn: 1 },
      { topic: "promises", correct: 0, turn: 2 },
      { topic: "hooks", correct: 1, turn: 3 },
    ])

    const entry = Journal.buildEntry(mkSummary({
      sessionId: "s2",
      totalTurns: 3,
      correctCount: 2,
      incorrectCount: 1,
      comprehensionRate: 0.67,
      topicsExplored: ["closures", "promises", "hooks"],
      conceptsLearned: ["closures"],
    }))

    expect(entry.learned).toContain("closures")
    expect(entry.struggled).toContain("promises")
    expect(entry.practiced).toContain("hooks")
    // learned topics NOT duplicated in practiced
    expect(entry.practiced).not.toContain("closures")
  })
})

describe("Journal.saveFromSummary", () => {
  test("no-op when summary is empty", () => {
    const result = Journal.saveFromSummary(mkSummary({ sessionId: "empty" }))
    expect(result).toBe(null)
    expect(Journal.getLatest(10)).toEqual([])
  })

  test("persists an entry when there are turns", () => {
    seedSession("s3", [{ topic: "x", correct: 1, turn: 1 }])
    Journal.saveFromSummary(mkSummary({
      sessionId: "s3",
      totalTurns: 1,
      correctCount: 1,
      comprehensionRate: 1.0,
      topicsExplored: ["x"],
    }))
    const entries = Journal.getLatest(10)
    expect(entries.length).toBe(1)
    expect(entries[0]!.totalTurns).toBe(1)
  })
})

describe("Journal.formatEntry", () => {
  test("includes date, turn count and percentage", () => {
    const entry = {
      id: 1,
      sessionId: "s",
      entryDate: "2026-04-17",
      learned: ["a"],
      practiced: ["b"],
      struggled: ["c"],
      totalTurns: 10,
      comprehensionRate: 0.8,
      createdAt: Date.now(),
    }
    const out = Journal.formatEntry(entry)
    expect(out).toContain("2026-04-17")
    expect(out).toContain("10 turns")
    expect(out).toContain("80%")
    expect(out).toContain("learned: a")
  })
})

describe("Journal.formatWeeklyRollup", () => {
  test("empty list has informative message", () => {
    expect(Journal.formatWeeklyRollup([])).toContain("No sessions")
  })

  test("aggregates unique topics across entries", () => {
    const entries = [
      {
        id: 1, sessionId: "a", entryDate: "2026-04-15",
        learned: ["x"], practiced: ["y"], struggled: [],
        totalTurns: 5, comprehensionRate: 0.8, createdAt: 0,
      },
      {
        id: 2, sessionId: "b", entryDate: "2026-04-16",
        learned: ["x", "z"], practiced: [], struggled: ["q"],
        totalTurns: 5, comprehensionRate: 0.6, createdAt: 0,
      },
    ]
    const out = Journal.formatWeeklyRollup(entries)
    expect(out).toContain("Learned (2)") // x, z unique
    expect(out).toContain("Avg comprehension: 70%") // weighted 0.8*5 + 0.6*5 / 10 = 0.7
  })
})

describe("Journal.daysAgo", () => {
  test("returns ms timestamp n days before now", () => {
    const now = Date.now()
    const d = Journal.daysAgo(3)
    const diff = now - d
    expect(diff).toBeGreaterThan(2.5 * 86400 * 1000)
    expect(diff).toBeLessThan(3.5 * 86400 * 1000)
  })
})
