import { describe, test, expect } from "bun:test"
import { Modes } from "../../src/socratic/modes"

describe("Modes.parseMode", () => {
  test("English values", () => {
    expect(Modes.parseMode("learn")).toBe("learn")
    expect(Modes.parseMode("productive")).toBe("productive")
    expect(Modes.parseMode("prod")).toBe("productive")
  })

  test("Spanish values", () => {
    expect(Modes.parseMode("aprender")).toBe("learn")
    expect(Modes.parseMode("aprendizaje")).toBe("learn")
    expect(Modes.parseMode("productivo")).toBe("productive")
  })

  test("case and whitespace tolerant", () => {
    expect(Modes.parseMode("  LEARN  ")).toBe("learn")
    expect(Modes.parseMode("Productive")).toBe("productive")
  })

  test("unknown values return null", () => {
    expect(Modes.parseMode("hybrid")).toBe(null)
    expect(Modes.parseMode("")).toBe(null)
  })
})

describe("Modes.getDirective — strong variant", () => {
  test("every level+mode combo has a non-empty directive", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      for (const mode of ["learn", "productive"] as const) {
        const d = Modes.getDirective(level, mode)
        expect(d.directive.length).toBeGreaterThan(20)
        expect(d.level).toBe(level)
        expect(d.mode).toBe(mode)
      }
    }
  })

  test("defaults to strong when capability omitted", () => {
    const def = Modes.getDirective(3, "learn")
    const strong = Modes.getDirective(3, "learn", "strong")
    expect(def.directive).toBe(strong.directive)
  })
})

describe("Modes.getDirective — lite variant", () => {
  test("lite variants exist for all 10 level+mode combos", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      for (const mode of ["learn", "productive"] as const) {
        const d = Modes.getDirective(level, mode, "lite")
        expect(d.directive.length).toBeGreaterThan(10)
      }
    }
  })

  test("lite is shorter than strong for every combo", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      for (const mode of ["learn", "productive"] as const) {
        const strong = Modes.getDirective(level, mode, "strong")
        const lite = Modes.getDirective(level, mode, "lite")
        expect(lite.directive.length).toBeLessThan(strong.directive.length)
      }
    }
  })
})
