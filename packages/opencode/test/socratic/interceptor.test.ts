import { describe, test, expect } from "bun:test"
import { Interceptor } from "../../src/socratic/interceptor"

describe("Interceptor.getSessionDirective — L1 HARD block", () => {
  test("L1 learn: surfaces numeric limits and 4-phase protocol", () => {
    const d = Interceptor.getSessionDirective(1, "learn")
    expect(d).not.toBeNull()
    const text = d!
    expect(text).toContain("LEVEL 1 HARD LIMITS")
    expect(text).toContain("MAX 30 lines")
    expect(text).toContain("MAX 1 file")
    expect(text.toUpperCase()).toContain("RESTATE")
    expect(text.toUpperCase()).toContain("PLAN")
    expect(text.toUpperCase()).toContain("TEACH")
    expect(text.toUpperCase()).toContain("ASK")
    expect(text).toMatch(/Write\s*\/\s*Edit|Write \/ Edit/)
  })

  test("L1 productive: same HARD limits (mode-independent at L1)", () => {
    const d = Interceptor.getSessionDirective(1, "productive")
    expect(d).toContain("LEVEL 1 HARD LIMITS")
  })

  test("L1 block includes GOOD vs BAD comprehension question examples", () => {
    const d = Interceptor.getSessionDirective(1, "learn")!
    expect(d).toContain("GOOD")
    expect(d).toContain("BAD")
  })

  test("L1 block handles user override explicitly (avoid infinite loop)", () => {
    const d = Interceptor.getSessionDirective(1, "learn")!
    expect(d.toLowerCase()).toMatch(/override|just write it|already know/)
  })

  test("L2 keeps its own softer rule (no HARD limits leak)", () => {
    const d = Interceptor.getSessionDirective(2, "learn")
    expect(d).not.toBeNull()
    expect(d).not.toContain("LEVEL 1 HARD LIMITS")
    expect(d).toContain("Basic")
  })

  test("L3 learn returns gapped-code rule", () => {
    const d = Interceptor.getSessionDirective(3, "learn")
    expect(d).not.toBeNull()
    expect(d).toContain("___")
  })

  test("L4 / L5 return null (no directive)", () => {
    expect(Interceptor.getSessionDirective(4, "learn")).toBeNull()
    expect(Interceptor.getSessionDirective(4, "productive")).toBeNull()
    expect(Interceptor.getSessionDirective(5, "learn")).toBeNull()
    expect(Interceptor.getSessionDirective(5, "productive")).toBeNull()
  })
})

describe("Interceptor.intercept — per-tool decision", () => {
  test("novice (L1) write → allow_with_explanation + explainLines + verifyAfter", () => {
    const d = Interceptor.intercept("write", 1, "learn")
    expect(d.action).toBe("allow_with_explanation")
    expect(d.explainLines).toBe(true)
    expect(d.verifyAfter).toBe(true)
  })

  test("intermediate + learn → transform_to_gaps", () => {
    const d = Interceptor.intercept("write", 3, "learn")
    expect(d.action).toBe("transform_to_gaps")
  })

  test("non-code tool (e.g. bash) → allow", () => {
    const d = Interceptor.intercept("bash", 1, "learn")
    expect(d.action).toBe("allow")
    expect(d.directive).toBeNull()
  })
})
