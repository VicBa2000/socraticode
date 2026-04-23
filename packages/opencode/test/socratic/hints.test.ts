import { describe, test, expect } from "bun:test"
import { Hints } from "../../src/socratic/hints"

describe("Hints.getInitialHintLevel", () => {
  test("novice starts at scaffolding (5)", () => {
    expect(Hints.getInitialHintLevel(1)).toBe(5)
  })

  test("basic starts at explain+verify (4)", () => {
    expect(Hints.getInitialHintLevel(2)).toBe(4)
  })

  test("intermediate starts at analogy (2) — smoothed to avoid cold socratic friction", () => {
    expect(Hints.getInitialHintLevel(3)).toBe(2)
  })

  test("advanced starts at orientation (1) — category pointer, not solution", () => {
    expect(Hints.getInitialHintLevel(4)).toBe(1)
  })

  test("expert starts at pure socratic (0)", () => {
    expect(Hints.getInitialHintLevel(5)).toBe(0)
  })
})

describe("Hints.clampHint", () => {
  test("clamps to [0, 5]", () => {
    expect(Hints.clampHint(-3)).toBe(0)
    expect(Hints.clampHint(99)).toBe(5)
    expect(Hints.clampHint(3.4)).toBe(3)
  })
})

describe("Hints.processResponse — escalation", () => {
  test("first failure does not escalate (threshold is 2)", () => {
    const s0 = Hints.createInitialState(5) // starts at 0
    const s1 = Hints.processResponse(s0, false, false)
    expect(s1.currentLevel).toBe(0)
    expect(s1.consecutiveFailures).toBe(1)
  })

  test("second consecutive failure escalates by 1 and resets fail counter", () => {
    let s = Hints.createInitialState(5) // starts at 0
    s = Hints.processResponse(s, false, false)
    s = Hints.processResponse(s, false, false)
    expect(s.currentLevel).toBe(1)
    expect(s.consecutiveFailures).toBe(0)
    expect(s.totalEscalations).toBe(1)
  })

  test("does not escalate beyond 5", () => {
    let s = Hints.createInitialState(1) // starts at 5
    s = Hints.processResponse(s, false, false)
    s = Hints.processResponse(s, false, false)
    expect(s.currentLevel).toBe(5)
  })
})

describe("Hints.processResponse — de-escalation", () => {
  test("from 5 drops to 3 on correct", () => {
    let s = Hints.createInitialState(1) // level 5
    s = Hints.processResponse(s, true, false)
    expect(s.currentLevel).toBe(3)
  })

  test("from 3 drops to 1 on correct", () => {
    let s = Hints.createInitialState(1)
    s = Hints.processResponse(s, true, false) // 5 → 3
    s = Hints.processResponse(s, true, false) // 3 → 1
    expect(s.currentLevel).toBe(1)
  })

  test("from 1 drops to 0 on correct", () => {
    let s = Hints.createInitialState(1)
    s = Hints.processResponse(s, true, false) // 5 → 3
    s = Hints.processResponse(s, true, false) // 3 → 1
    s = Hints.processResponse(s, true, false) // 1 → 0
    expect(s.currentLevel).toBe(0)
  })

  test("0 stays at 0 on correct", () => {
    let s = Hints.createInitialState(5) // starts at 0
    s = Hints.processResponse(s, true, false)
    expect(s.currentLevel).toBe(0)
  })
})

describe("Hints.processResponse — zero-knowledge jumps to 5", () => {
  test("jumps to scaffolding regardless of current level", () => {
    let s = Hints.createInitialState(5) // starts at 0
    s = Hints.processResponse(s, false, true)
    expect(s.currentLevel).toBe(5)
    expect(s.zeroKnowledgeActive).toBe(true)
  })
})

describe("Hints.getDirective (strong vs lite)", () => {
  test("strong directive is substantially longer than lite", () => {
    const strong = Hints.getDirective(5, "strong")
    const lite = Hints.getDirective(5, "lite")
    expect(strong.instruction.length).toBeGreaterThan(lite.instruction.length)
  })

  test("defaults to strong when capability omitted", () => {
    const def = Hints.getDirective(5)
    const strong = Hints.getDirective(5, "strong")
    expect(def.instruction).toBe(strong.instruction)
  })

  test("all 6 hint levels have a directive in both variants", () => {
    for (const cap of ["strong", "lite"] as const) {
      for (let lvl = 0; lvl <= 5; lvl++) {
        const d = Hints.getDirective(lvl as 0 | 1 | 2 | 3 | 4 | 5, cap)
        expect(d.instruction.length).toBeGreaterThan(10)
      }
    }
  })
})
