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
    expect(Levels.getProfile(3).initialHintLevel).toBe(0)
    expect(Levels.getProfile(4).initialHintLevel).toBe(0)
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
