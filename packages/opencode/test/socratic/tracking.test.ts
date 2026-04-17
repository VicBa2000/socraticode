import { describe, test, expect, beforeEach } from "bun:test"
import { Tracking } from "../../src/socratic/tracking"
import { SocraticDB } from "../../src/socratic/db"
import { resetSocraticDB } from "./_helpers"

beforeEach(() => {
  resetSocraticDB()
})

function turn(overrides: Partial<Tracking.TurnRecord>): Tracking.TurnRecord {
  return {
    sessionId: "s",
    turnIndex: 0,
    topic: null,
    correct: null,
    hintLevel: 0,
    userLevel: 3,
    domain: null,
    userExcerpt: null,
    agentExcerpt: null,
    accompaniedImpl: false,
    ...overrides,
  }
}

describe("Tracking.startSession / recordTurn / endSession", () => {
  test("full lifecycle with correct + incorrect turns", () => {
    Tracking.startSession("s1", 3, "learn")
    Tracking.recordTurn(turn({ sessionId: "s1", turnIndex: 1, topic: "x", correct: true, hintLevel: 0 }))
    Tracking.recordTurn(turn({ sessionId: "s1", turnIndex: 2, topic: "y", correct: false, hintLevel: 3 }))
    Tracking.recordTurn(turn({ sessionId: "s1", turnIndex: 3, topic: "y", correct: true, hintLevel: 1 }))
    const summary = Tracking.endSession("s1")!
    expect(summary.totalTurns).toBe(3)
    expect(summary.correctCount).toBe(2)
    expect(summary.incorrectCount).toBe(1)
    expect(summary.comprehensionRate).toBeCloseTo(2 / 3, 2)
    expect(summary.maxHintLevel).toBe(3)
    expect(summary.topicsExplored).toContain("x")
    expect(summary.topicsExplored).toContain("y")
  })

  test("endSession returns null for unknown session", () => {
    expect(Tracking.endSession("nope")).toBe(null)
  })

  test("recordLevelChange shows in summary", () => {
    Tracking.startSession("s2", 2, "learn")
    Tracking.recordLevelChange("s2", 5, 2, 3, "correct answers")
    Tracking.recordTurn(turn({ sessionId: "s2", turnIndex: 1 }))
    const summary = Tracking.endSession("s2")!
    expect(summary.startLevel).toBe(2)
    expect(summary.endLevel).toBe(3)
    expect(summary.levelChanges.length).toBe(1)
  })
})

describe("Tracking.getTurnCount + getCurrentComprehensionRate", () => {
  test("counts in-memory turns", () => {
    Tracking.startSession("s3", 3, "learn")
    Tracking.recordTurn(turn({ sessionId: "s3", turnIndex: 1, correct: true }))
    Tracking.recordTurn(turn({ sessionId: "s3", turnIndex: 2, correct: false }))
    expect(Tracking.getTurnCount("s3")).toBe(2)
    expect(Tracking.getCurrentComprehensionRate("s3")).toBeCloseTo(0.5, 2)
    Tracking.endSession("s3")
  })

  test("zero for unknown session", () => {
    expect(Tracking.getTurnCount("none")).toBe(0)
    expect(Tracking.getCurrentComprehensionRate("none")).toBe(0)
  })
})

describe("Tracking.getErrorHistory / getPriorStrugglesMessage", () => {
  test("no history → null", () => {
    expect(Tracking.getErrorHistory("x", "web")).toBe(null)
    expect(Tracking.getPriorStrugglesMessage("x", "web")).toBe(null)
  })

  test("history surfaces after errors", () => {
    SocraticDB.recordError("closures", "fundamentos", 3)
    SocraticDB.recordError("closures", "fundamentos", 3)
    SocraticDB.recordError("closures", "fundamentos", 3)
    const msg = Tracking.getPriorStrugglesMessage("closures", "fundamentos")
    expect(msg).not.toBe(null)
    expect(msg!.toLowerCase()).toContain("trouble")
  })

  test("resolved errors don't trigger messages", () => {
    SocraticDB.recordError("x", "web", 1)
    SocraticDB.resolveError("x", "web")
    expect(Tracking.getPriorStrugglesMessage("x", "web")).toBe(null)
  })
})

describe("Tracking.formatSummary", () => {
  test("includes turns, comprehension percentage and level", () => {
    Tracking.startSession("f1", 3, "learn")
    Tracking.recordTurn(turn({ sessionId: "f1", turnIndex: 1, correct: true, topic: "x" }))
    const summary = Tracking.endSession("f1")!
    const out = Tracking.formatSummary(summary)
    expect(out).toContain("Session Summary")
    expect(out).toContain("Turns: 1")
    expect(out).toContain("Intermediate")
  })
})
