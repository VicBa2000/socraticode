import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { SocraticIntegration } from "../../src/socratic/integration"
import { Calibration } from "../../src/socratic/calibration"
import { resetSocraticDB, seedTurns } from "./_helpers"

// Track sessions opened by each test so the per-process in-memory
// sessionStates Map doesn't grow across the file (bun:test shares module
// state, and uncleared state slows downstream tests — especially regex-heavy
// ones like antipatterns).
const openedSessions: string[] = []

function openSession(id: string) {
  openedSessions.push(id)
  return id
}

beforeEach(() => {
  resetSocraticDB()
})

afterEach(() => {
  for (const id of openedSessions.splice(0)) {
    try {
      SocraticIntegration.cleanupSession(id)
    } catch {
      // Non-critical
    }
  }
})

/**
 * Smoke tests that exercise the glue between processResponseMeta and
 * buildSystemPrompt — the pieces that unit tests touch in isolation but that
 * only real end-to-end calls would otherwise verify.
 */
describe("SocraticIntegration.buildSystemPrompt — pre-upgrade guard wiring", () => {
  test("no guard injected by default", () => {
    Calibration.completeInitialCalibration(2)
    const sections = SocraticIntegration.buildSystemPrompt(openSession("s-no-guard"))
    const joined = sections.join("\n\n")
    expect(joined).not.toContain("PRE-UPGRADE GUARD")
  })

  test("guard arms after a successful upgrade evaluation and fires on the next prompt build", () => {
    Calibration.completeInitialCalibration(2)
    // Seed enough healthy evidence for L2→L3 upgrade to pass all 3 filters.
    seedTurns({ count: 9, userLevel: 2 })

    // Get the session state to reach turnCount=5 (the evaluation point).
    // We need to invoke processResponseMeta 5 times so turnCount % 5 === 0.
    // Signals are accumulated via correctCount on each correct meta.
    for (let i = 0; i < 5; i++) {
      SocraticIntegration.analyzeUserMessage(openSession("s-up"), `question ${i}`)
      SocraticIntegration.processResponseMeta(openSession("s-up"), {
        correct: true,
        topic: `t${i}`,
        domain: "lenguajes",
        level: "2",
        readiness: "at",
      })
    }

    // Now build the prompt — the guard should have been armed by the eval at turn 5.
    const sections = SocraticIntegration.buildSystemPrompt(openSession("s-up"))
    const joined = sections.join("\n\n")
    expect(joined).toContain("PRE-UPGRADE GUARD")
  })

  test("guard is one-shot — cleared after a single buildSystemPrompt call", () => {
    Calibration.completeInitialCalibration(2)
    seedTurns({ count: 9, userLevel: 2 })

    for (let i = 0; i < 5; i++) {
      SocraticIntegration.analyzeUserMessage(openSession("s-oneshot"), `q${i}`)
      SocraticIntegration.processResponseMeta(openSession("s-oneshot"), {
        correct: true,
        topic: `t${i}`,
        domain: "lenguajes",
        level: "2",
      })
    }

    const firstBuild = SocraticIntegration.buildSystemPrompt(openSession("s-oneshot")).join("\n\n")
    const secondBuild = SocraticIntegration.buildSystemPrompt(openSession("s-oneshot")).join("\n\n")
    expect(firstBuild).toContain("PRE-UPGRADE GUARD")
    expect(secondBuild).not.toContain("PRE-UPGRADE GUARD")
  })

  test("guard also arms when upgrade is blocked by filters (not only on pass)", () => {
    Calibration.completeInitialCalibration(2)
    // All correct under hint=5 → weighted avg filter blocks.
    seedTurns({ count: 9, userLevel: 2, hintLevel: 5 })

    for (let i = 0; i < 5; i++) {
      SocraticIntegration.analyzeUserMessage(openSession("s-blocked"), `q${i}`)
      SocraticIntegration.processResponseMeta(openSession("s-blocked"), {
        correct: true,
        topic: `t${i}`,
        domain: "lenguajes",
        level: "2",
      })
    }

    const sections = SocraticIntegration.buildSystemPrompt(openSession("s-blocked")).join("\n\n")
    expect(sections).toContain("PRE-UPGRADE GUARD")
  })
})

describe("SocraticIntegration.parseHintMeta — readiness round-trip", () => {
  test("parses HINT_META with readiness field", () => {
    const text =
      'Answer body.\n[HINT_META:{"correct":true,"topic":"closures","domain":"lenguajes","level":"3","readiness":"above"}]'
    const { cleanText, meta } = SocraticIntegration.parseHintMeta(text)
    expect(cleanText).toBe("Answer body.")
    expect(meta).not.toBeNull()
    expect(meta!.readiness).toBe("above")
    expect(meta!.correct).toBe(true)
    expect(meta!.topic).toBe("closures")
  })

  test("parses HINT_META without readiness (back-compat)", () => {
    const text =
      'body.\n[HINT_META:{"correct":false,"topic":"t","domain":"lenguajes","level":"2"}]'
    const { meta } = SocraticIntegration.parseHintMeta(text)
    expect(meta).not.toBeNull()
    expect(meta!.readiness).toBeUndefined()
    expect(meta!.correct).toBe(false)
  })
})
