/**
 * User-scenario tests for SocraticCode (Phase 8.3).
 *
 * These tests verify the system builds the EXPECTED prompt directives for
 * representative user profiles (novice/basic/intermediate/advanced/expert and
 * learn/productive mode crossings). They exercise the public contract of the
 * prompt assembler — no LLM calls, no DB reads — so they run fast and stay
 * deterministic.
 */

import { describe, test, expect } from "bun:test"
import { SocraticPrompt } from "../../src/socratic/prompt"
import { Modes } from "../../src/socratic/modes"
import { Accompaniment } from "../../src/socratic/accompaniment"
import { Levels } from "../../src/socratic/levels"
import { Prerequisites } from "../../src/socratic/prerequisites"

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

describe("Scenario: NOVICE (level 1) asking for JWT without knowing what it is", () => {
  test("system prompt sets teacher role and scaffolding hints", () => {
    const prompt = SocraticPrompt.buildString(
      ctx({ userLevel: 1, hintLevel: 5, domain: "backend" }),
    )
    expect(prompt).toContain("NOVICE")
    expect(prompt.toUpperCase()).toContain("SCAFFOLDING")
    expect(prompt).toContain("CURRENT DOMAIN: Backend")
  })

  test("level 1 starts accompanied (ratio = 1.0)", () => {
    expect(Levels.getProfile(1).accompanimentRatio).toBe(1.0)
    expect(Accompaniment.shouldAccompany(1, "learn")).toBe(true)
  })
})

describe("Scenario: INTERMEDIATE (level 3) asking for a CRUD", () => {
  test("learn mode hints at gapped code", () => {
    const d = Modes.getDirective(3, "learn")
    expect(d.directive.toLowerCase()).toContain("blank")
  })

  test("productive mode writes code directly (no blanks)", () => {
    const d = Modes.getDirective(3, "productive")
    expect(d.directive.toLowerCase()).toContain("directly")
    expect(d.directive.toLowerCase()).toContain("no gapped")
  })
})

describe("Scenario: ADVANCED (level 4) implementing auth", () => {
  test("challenges architecture decisions, not trivia", () => {
    const prompt = SocraticPrompt.buildString(ctx({ userLevel: 4 }))
    expect(prompt.toLowerCase()).toContain("architecture")
    expect(prompt.toLowerCase()).toContain("edge cases")
  })

  test("advanced user does NOT get prerequisite enforcement", () => {
    expect(Prerequisites.shouldEnforce(4)).toBe(false)
    expect(Prerequisites.shouldEnforce(5)).toBe(false)
  })
})

describe("Scenario: EXPERT (level 5) using as code assistant", () => {
  test("productive mode matches silent-colleague behavior", () => {
    const d = Modes.getDirective(5, "productive")
    expect(d.directive.toLowerCase()).toContain("security vulnerability")
    expect(d.role).toBe("Pure code assistant")
  })

  test("accompaniment ratio is 0", () => {
    expect(Levels.getProfile(5).accompanimentRatio).toBe(0.0)
    expect(Accompaniment.shouldAccompany(5, "learn")).toBe(false)
    expect(Accompaniment.shouldAccompany(5, "productive")).toBe(false)
  })
})

describe("Scenario: MIXED — advanced in JS but novice in Docker", () => {
  test("effectiveLevel blends when domain confidence is high", () => {
    // Global 4 (advanced), domain docker mapped to 1 (novice) with high confidence
    const eff = Levels.effectiveLevel(4, 1, 0.9)
    expect(eff).toBe(1)
  })

  test("effectiveLevel leans global when domain confidence is low", () => {
    const eff = Levels.effectiveLevel(4, 1, 0.1)
    // 4*0.7 + 1*0.3 = 3.1 → 3
    expect(eff).toBe(3)
  })
})

describe("Scenario: FRUSTRATED user demanding direct answers", () => {
  test("novice gets gentle explanation even under pressure", () => {
    const str = SocraticPrompt.buildString(
      ctx({ userLevel: 1, pressureDetected: true, consecutivePressure: 1 }),
    )
    expect(str.toLowerCase()).toContain("understand the frustration")
  })

  test("advanced/expert gets direct answer without pedagogical questions", () => {
    const str = SocraticPrompt.buildString(
      ctx({ userLevel: 4, pressureDetected: true, consecutivePressure: 1 }),
    )
    expect(str.toLowerCase()).toContain("respect")
    expect(str.toLowerCase()).toContain("concisely")
  })
})

describe("Scenario: COPY-SUSPECTED response from intermediate", () => {
  test("profile with high copy tendency triggers probing directive", () => {
    const str = SocraticPrompt.buildString(
      ctx({ userLevel: 3, copyTendency: 0.7 }),
    )
    expect(str.toLowerCase()).toContain("probing")
  })
})

describe("Scenario: LEVEL CHANGE mid-conversation", () => {
  test("evaluateAdjustment downgrades after 2+ zero-knowledge signals", () => {
    const r = Levels.evaluateAdjustment(3, {
      correctAnswers: 0,
      incorrectAnswers: 0,
      zeroKnowledgeSignals: 2,
      technicalTermsUsed: false,
      proposedSolutionWithoutHelp: false,
      requestedSlowDown: false,
      copyPasteDetected: false,
    })
    expect(r.changed).toBe(true)
    expect(r.newLevel).toBe(2)
  })

  test("evaluateAdjustment upgrades on mastery signals", () => {
    const r = Levels.evaluateAdjustment(2, {
      correctAnswers: 3,
      incorrectAnswers: 0,
      zeroKnowledgeSignals: 0,
      technicalTermsUsed: true,
      proposedSolutionWithoutHelp: true,
      requestedSlowDown: false,
      copyPasteDetected: false,
    })
    expect(r.changed).toBe(true)
    expect(r.newLevel).toBe(3)
  })
})

describe("Scenario: LITE MODE for small local model", () => {
  test("every level × mode combination has a lite variant", () => {
    for (const level of [1, 2, 3, 4, 5] as const) {
      for (const mode of ["learn", "productive"] as const) {
        const str = SocraticPrompt.buildString(
          ctx({ userLevel: level, mode, capability: "lite" }),
        )
        expect(str.length).toBeGreaterThan(100)
        expect(str).not.toContain("HINT_META")
      }
    }
  })

  test("lite prompt stays under ~1.5kb even with full signals", () => {
    const str = SocraticPrompt.buildString(
      ctx({
        userLevel: 3,
        mode: "learn",
        hintLevel: 5,
        capability: "lite",
        domain: "web",
        challengeActive: false,
        comprehensionSpeed: 0.3,
      }),
    )
    expect(str.length).toBeLessThan(1500)
  })
})
