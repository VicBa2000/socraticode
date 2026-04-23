import { describe, test, expect } from "bun:test"
import { Levels } from "../../src/socratic/levels"

describe("Levels.clampLevel", () => {
  test("clamps below range to 1", () => {
    expect(Levels.clampLevel(0)).toBe(1)
    expect(Levels.clampLevel(-5)).toBe(1)
  })

  test("clamps above range to 5", () => {
    expect(Levels.clampLevel(6)).toBe(5)
    expect(Levels.clampLevel(99)).toBe(5)
  })

  test("rounds fractional levels", () => {
    expect(Levels.clampLevel(2.4)).toBe(2)
    expect(Levels.clampLevel(2.6)).toBe(3)
  })
})

describe("Levels.isValidLevel", () => {
  test("accepts integers 1..5", () => {
    for (let i = 1; i <= 5; i++) expect(Levels.isValidLevel(i)).toBe(true)
  })

  test("rejects out-of-range and non-integers", () => {
    expect(Levels.isValidLevel(0)).toBe(false)
    expect(Levels.isValidLevel(6)).toBe(false)
    expect(Levels.isValidLevel(2.5)).toBe(false)
  })
})

describe("Levels.getProfile", () => {
  test("each level has correct initialHintLevel", () => {
    expect(Levels.getProfile(1).initialHintLevel).toBe(5)
    expect(Levels.getProfile(2).initialHintLevel).toBe(4)
    expect(Levels.getProfile(3).initialHintLevel).toBe(2) // smoothed: analogy
    expect(Levels.getProfile(4).initialHintLevel).toBe(1) // smoothed: orientation
    expect(Levels.getProfile(5).initialHintLevel).toBe(0)
  })

  test("accompaniment ratio decreases monotonically", () => {
    const ratios = [1, 2, 3, 4, 5].map((l) => Levels.getProfile(l).accompanimentRatio)
    for (let i = 0; i < ratios.length - 1; i++) {
      expect(ratios[i]).toBeGreaterThanOrEqual(ratios[i + 1]!)
    }
  })
})

describe("Levels.evaluateAdjustment — downgrades", () => {
  const empty = {
    correctAnswers: 0,
    incorrectAnswers: 0,
    zeroKnowledgeSignals: 0,
    technicalTermsUsed: false,
    proposedSolutionWithoutHelp: false,
    requestedSlowDown: false,
    copyPasteDetected: false,
  }

  test("2+ zero-knowledge signals drops one level", () => {
    const r = Levels.evaluateAdjustment(3, { ...empty, zeroKnowledgeSignals: 2 })
    expect(r.changed).toBe(true)
    expect(r.newLevel).toBe(2)
  })

  test("slow-down request drops one level", () => {
    const r = Levels.evaluateAdjustment(4, { ...empty, requestedSlowDown: true })
    expect(r.changed).toBe(true)
    expect(r.newLevel).toBe(3)
  })

  test("3+ incorrect drops one level", () => {
    const r = Levels.evaluateAdjustment(3, { ...empty, incorrectAnswers: 3 })
    expect(r.changed).toBe(true)
    expect(r.newLevel).toBe(2)
  })

  test("never drops below 1", () => {
    const r = Levels.evaluateAdjustment(1, { ...empty, zeroKnowledgeSignals: 5 })
    expect(r.changed).toBe(false)
    expect(r.newLevel).toBe(1)
  })
})

describe("Levels.evaluateAdjustment — upgrades", () => {
  const base = {
    correctAnswers: 0,
    incorrectAnswers: 0,
    zeroKnowledgeSignals: 0,
    technicalTermsUsed: false,
    proposedSolutionWithoutHelp: false,
    requestedSlowDown: false,
    copyPasteDetected: false,
  }

  test("3+ correct + technical terms raises one level", () => {
    const r = Levels.evaluateAdjustment(2, {
      ...base,
      correctAnswers: 3,
      technicalTermsUsed: true,
    })
    expect(r.changed).toBe(true)
    expect(r.newLevel).toBe(3)
  })

  test("3+ correct + solution without help raises one level", () => {
    const r = Levels.evaluateAdjustment(3, {
      ...base,
      correctAnswers: 4,
      proposedSolutionWithoutHelp: true,
    })
    expect(r.changed).toBe(true)
    expect(r.newLevel).toBe(4)
  })

  test("copy-paste blocks upgrade", () => {
    const r = Levels.evaluateAdjustment(2, {
      ...base,
      correctAnswers: 5,
      technicalTermsUsed: true,
      copyPasteDetected: true,
    })
    expect(r.changed).toBe(false)
  })

  test("never raises above 5", () => {
    const r = Levels.evaluateAdjustment(5, {
      ...base,
      correctAnswers: 10,
      technicalTermsUsed: true,
    })
    expect(r.changed).toBe(false)
  })
})

describe("Levels.effectiveLevel", () => {
  test("no domain data uses global level", () => {
    expect(Levels.effectiveLevel(3, null, null)).toBe(3)
  })

  test("high confidence trusts domain level", () => {
    expect(Levels.effectiveLevel(2, 5, 0.9)).toBe(5)
  })

  test("low confidence leans global", () => {
    expect(Levels.effectiveLevel(3, 1, 0.1)).toBe(2) // 3*0.7+1*0.3 = 2.4 → 2
  })

  test("medium confidence blends", () => {
    expect(Levels.effectiveLevel(2, 4, 0.5)).toBe(3) // 2*0.4+4*0.6 = 3.2 → 3
  })
})

describe("Levels.adjustComprehensionSpeed", () => {
  test("correct raises by 0.02", () => {
    expect(Levels.adjustComprehensionSpeed(0.5, true)).toBeCloseTo(0.52, 5)
  })

  test("incorrect lowers by 0.02", () => {
    expect(Levels.adjustComprehensionSpeed(0.5, false)).toBeCloseTo(0.48, 5)
  })

  test("clamps to [0, 1]", () => {
    expect(Levels.adjustComprehensionSpeed(1.0, true)).toBe(1.0)
    expect(Levels.adjustComprehensionSpeed(0.0, false)).toBe(0.0)
  })
})

describe("Levels.updateCopyTendency (EMA α=0.1)", () => {
  test("copy signal pulls tendency up", () => {
    expect(Levels.updateCopyTendency(0.0, true)).toBeCloseTo(0.1, 5)
    expect(Levels.updateCopyTendency(0.5, true)).toBeCloseTo(0.55, 5)
  })

  test("non-copy signal pulls tendency down", () => {
    expect(Levels.updateCopyTendency(1.0, false)).toBeCloseTo(0.9, 5)
    expect(Levels.updateCopyTendency(0.5, false)).toBeCloseTo(0.45, 5)
  })
})

describe("Levels.updateConfidence", () => {
  test("grows monotonically with interactions", () => {
    const c1 = Levels.updateConfidence(0, 5)
    const c2 = Levels.updateConfidence(c1, 15)
    expect(c2).toBeGreaterThan(c1)
  })

  test("never exceeds 1.0", () => {
    const c = Levels.updateConfidence(0.99, 1000)
    expect(c).toBeLessThanOrEqual(1.0)
  })
})

describe("Levels.evaluateUpgradeFilters", () => {
  function mkTurns(n: number, overrides: Partial<Levels.TurnForFilter> = {}): Levels.TurnForFilter[] {
    return Array.from({ length: n }, (_, i) => ({
      hintLevel: i % 3, // 0,1,2,0,1,2,... all low-hint
      correct: true,
      topic: `topic_${i % 7}`,
      readiness: null,
      ...overrides,
    }))
  }

  test("blocks upgrade when not enough correct in window", () => {
    const r = Levels.evaluateUpgradeFilters(2, mkTurns(5)) // L2 needs 7 correct in 9
    expect(r.passed).toBe(false)
    expect(r.reason).toMatch(/only 5\/7/)
  })

  test("passes when healthy evidence: diverse, low-hint, enough correct", () => {
    const r = Levels.evaluateUpgradeFilters(2, mkTurns(9))
    expect(r.passed).toBe(true)
    expect(r.weightedAvg).toBeGreaterThanOrEqual(0.5)
  })

  test("blocks upgrade when all correct under hint=5 (scaffold obedience)", () => {
    const r = Levels.evaluateUpgradeFilters(2, mkTurns(9, { hintLevel: 5 }))
    expect(r.passed).toBe(false)
    expect(r.reason).toMatch(/weighted avg/)
  })

  test("blocks upgrade when all correct on the same topic", () => {
    const r = Levels.evaluateUpgradeFilters(2, mkTurns(9, { topic: "one-thing" }))
    expect(r.passed).toBe(false)
    expect(r.reason).toMatch(/topic diversity/)
  })

  test("blocks upgrade when low-hint count is too low (all hint=3)", () => {
    // hint=3 is above LOW_HINT_THRESHOLD (2) → no low-hint evidence
    const turns = mkTurns(9, { hintLevel: 3 })
    const r = Levels.evaluateUpgradeFilters(2, turns)
    expect(r.passed).toBe(false)
    // Either weighted avg (0.4 for all hint=3) or low-hint count triggers first.
    // hint=3 → weight=0.4 → avg=0.4 < 0.5 → weighted avg fires first
    expect(r.reason).toMatch(/weighted avg|low-hint count/)
  })

  test("readiness='above' adds +0.25 to the per-turn weight (capped at 1.0)", () => {
    // All correct at hint=3 (base weight=0.4) but readiness='above' → 0.65.
    // Topic diversity/low-hint filters are separate; this asserts the weight math.
    const turns = mkTurns(9, { hintLevel: 3, readiness: "above" })
    const r = Levels.evaluateUpgradeFilters(2, turns)
    expect(r.weightedAvg).toBeCloseTo(0.65, 2)
  })

  test("readiness='below' subtracts 0.25 from the per-turn weight", () => {
    // hint=1 (base weight=0.8) but readiness='below' (-0.25) → 0.55
    const turns = mkTurns(9, { hintLevel: 1, readiness: "below" })
    const r = Levels.evaluateUpgradeFilters(2, turns)
    expect(r.weightedAvg).toBeCloseTo(0.55, 2)
  })

  test("incorrect turns in window do not count toward correct", () => {
    // 9 turns but 4 incorrect → only 5 correct, below L2's 7 required
    const mixed: Levels.TurnForFilter[] = [
      ...mkTurns(5),
      ...mkTurns(4, { correct: false }),
    ]
    const r = Levels.evaluateUpgradeFilters(2, mixed)
    expect(r.passed).toBe(false)
    expect(r.correctInWindow).toBe(5)
  })

  test("window size varies by current level (L1 needs 10/12)", () => {
    const r = Levels.evaluateUpgradeFilters(1, mkTurns(9))
    expect(r.passed).toBe(false)
    expect(r.reason).toMatch(/only 9\/10/)
  })
})
