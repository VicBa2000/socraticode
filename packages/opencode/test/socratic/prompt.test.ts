import { describe, test, expect } from "bun:test"
import { SocraticPrompt } from "../../src/socratic/prompt"
import { Accompaniment } from "../../src/socratic/accompaniment"

function ctx(overrides: Partial<SocraticPrompt.PromptContext> = {}): SocraticPrompt.PromptContext {
  return {
    userLevel: 3,
    mode: "learn",
    hintLevel: 0,
    domain: null,
    comprehensionSpeed: 0.5,
    copyTendency: 0.0,
    weaknesses: [],
    strengths: [],
    accompanimentState: Accompaniment.createIdleState(),
    challengeActive: false,
    pressureDetected: false,
    consecutivePressure: 0,
    ...overrides,
  }
}

describe("SocraticPrompt.build — strong", () => {
  test("returns at least the 4 base sections for a neutral ctx", () => {
    const sections = SocraticPrompt.build(ctx())
    // base universal + level + mode + hint + metadata = 5 minimum
    expect(sections.length).toBeGreaterThanOrEqual(5)
  })

  test("includes HINT_META reminder when strong", () => {
    const str = SocraticPrompt.buildString(ctx())
    expect(str).toContain("HINT_META")
  })

  test("injects domain header when domain set", () => {
    const str = SocraticPrompt.buildString(ctx({ domain: "web" }))
    expect(str).toContain("CURRENT DOMAIN: Web")
  })

  test("injects challenge directive when active", () => {
    const str = SocraticPrompt.buildString(ctx({ challengeActive: true }))
    expect(str).toContain("CHALLENGE MODE")
  })

  test("injects pressure directive when detected", () => {
    const str = SocraticPrompt.buildString(
      ctx({ pressureDetected: true, consecutivePressure: 1 }),
    )
    expect(str.length).toBeGreaterThan(1000)
  })

  test("injects accompaniment directive when state non-idle", () => {
    let accomp = Accompaniment.startAccompaniment(["auth.ts"])
    accomp = Accompaniment.startModule(accomp)
    const str = SocraticPrompt.buildString(ctx({ accompanimentState: accomp }))
    expect(str).toContain("ACCOMPANIED IMPLEMENTATION")
  })

  test("profile directive only when signals present", () => {
    const neutral = SocraticPrompt.buildString(ctx())
    const slow = SocraticPrompt.buildString(ctx({ comprehensionSpeed: 0.1 }))
    expect(neutral).not.toContain("PEDAGOGICAL PROFILE")
    expect(slow).toContain("PEDAGOGICAL PROFILE")
  })
})

describe("SocraticPrompt.build — lite", () => {
  test("is substantially shorter than strong", () => {
    const strong = SocraticPrompt.buildString(ctx({ capability: "strong" }))
    const lite = SocraticPrompt.buildString(ctx({ capability: "lite" }))
    expect(lite.length).toBeLessThan(strong.length * 0.5)
  })

  test("does NOT include HINT_META reminder when lite", () => {
    const str = SocraticPrompt.buildString(ctx({ capability: "lite" }))
    expect(str).not.toContain("HINT_META")
  })

  test("still includes user level marker", () => {
    const str = SocraticPrompt.buildString(ctx({ userLevel: 1, capability: "lite" }))
    expect(str.toUpperCase()).toContain("NOVICE")
  })

  test("defaults to strong when capability omitted", () => {
    const def = SocraticPrompt.buildString(ctx())
    const strong = SocraticPrompt.buildString(ctx({ capability: "strong" }))
    expect(def).toBe(strong)
  })
})

describe("SocraticPrompt level differentiation", () => {
  test("each level produces a distinct section", () => {
    const sections = [1, 2, 3, 4, 5].map((lvl) =>
      SocraticPrompt.buildString(ctx({ userLevel: lvl as 1 | 2 | 3 | 4 | 5 })),
    )
    const unique = new Set(sections)
    expect(unique.size).toBe(5)
  })
})

describe("SocraticPrompt.createDefaultContext", () => {
  test("returns a sane default", () => {
    const d = SocraticPrompt.createDefaultContext()
    expect(d.userLevel).toBe(1)
    expect(d.mode).toBe("learn")
    expect(d.hintLevel).toBe(5)
  })
})
