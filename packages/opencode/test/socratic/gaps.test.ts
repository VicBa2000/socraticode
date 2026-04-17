import { describe, test, expect } from "bun:test"
import { Gaps } from "../../src/socratic/gaps"

describe("Gaps.GAP_MARKER", () => {
  test("is three underscores", () => {
    expect(Gaps.GAP_MARKER).toBe("___")
  })
})

describe("Gaps.countGaps", () => {
  test("zero when no gaps", () => {
    expect(Gaps.countGaps("function foo() {}")).toBe(0)
  })

  test("counts every ___ occurrence", () => {
    expect(Gaps.countGaps("const x = ___; const y = ___;")).toBe(2)
    expect(Gaps.countGaps("___ ___ ___")).toBe(3)
  })

  test("does not confuse with fewer underscores", () => {
    expect(Gaps.countGaps("const __x = 1")).toBe(0)
  })
})

describe("Gaps.normalizeAnswer", () => {
  test("trims whitespace", () => {
    expect(Gaps.normalizeAnswer("  hello  ")).toBe("hello")
  })

  test("lowercases", () => {
    expect(Gaps.normalizeAnswer("HELLO")).toBe("hello")
  })

  test("strips quotes and semicolons", () => {
    expect(Gaps.normalizeAnswer("'hello';")).toBe("hello")
    expect(Gaps.normalizeAnswer('"hello"')).toBe("hello")
    expect(Gaps.normalizeAnswer("`hello`")).toBe("hello")
  })

  test("equal after normalization", () => {
    expect(Gaps.normalizeAnswer("401")).toBe(Gaps.normalizeAnswer("'401';"))
  })
})

describe("Gaps.getGapDirective", () => {
  test("returns a directive mentioning the marker", () => {
    const d = Gaps.getGapDirective()
    expect(d).toContain(Gaps.GAP_MARKER)
    expect(d).toContain("GAPPED CODE")
  })

  test("includes rules about what not to replace", () => {
    const d = Gaps.getGapDirective()
    expect(d.toLowerCase()).toContain("do not replace")
  })
})
