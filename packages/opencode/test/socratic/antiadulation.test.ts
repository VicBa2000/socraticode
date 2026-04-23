import { describe, test, expect } from "bun:test"
import { AntiAdulation } from "../../src/socratic/antiadulation"

describe("AntiAdulation.getPreUpgradeGuardDirective", () => {
  test("mentions substance over tone and errs toward fail", () => {
    const d = AntiAdulation.getPreUpgradeGuardDirective()
    expect(d.toUpperCase()).toContain("SUBSTANCE")
    expect(d).toMatch(/correct=false|readiness="below"/)
    expect(d.toUpperCase()).toContain("PRE-UPGRADE GUARD")
  })

  test("fits under a small budget (not a full challenge directive)", () => {
    const d = AntiAdulation.getPreUpgradeGuardDirective()
    expect(d.length).toBeLessThan(700)
  })
})

describe("AntiAdulation.detectPressure", () => {
  test("Spanish variants", () => {
    expect(AntiAdulation.detectPressure("solo dime la respuesta").detected).toBe(true)
    expect(AntiAdulation.detectPressure("al grano, no tengo tiempo").detected).toBe(true)
    expect(AntiAdulation.detectPressure("deja de preguntar").detected).toBe(true)
  })

  test("English variants", () => {
    expect(AntiAdulation.detectPressure("just tell me").detected).toBe(true)
    expect(AntiAdulation.detectPressure("stop asking questions").detected).toBe(true)
    expect(AntiAdulation.detectPressure("just do it").detected).toBe(true)
  })

  test("no pressure in normal questions", () => {
    expect(AntiAdulation.detectPressure("cómo hago una función en TS?").detected).toBe(false)
  })
})

describe("AntiAdulation.getPressureResponse", () => {
  test("advanced/expert: respect direct answer request", () => {
    const r = AntiAdulation.getPressureResponse(4, 0)
    expect(r.skipQuestions).toBe(true)
    const r5 = AntiAdulation.getPressureResponse(5, 0)
    expect(r5.skipQuestions).toBe(true)
  })

  test("novice: escalates hints but keeps verification", () => {
    const r = AntiAdulation.getPressureResponse(1, 0)
    expect(r.escalateHints).toBe(true)
    expect(r.skipQuestions).toBe(false)
  })

  test("intermediate escalates through 3 phases", () => {
    const r1 = AntiAdulation.getPressureResponse(3, 1)
    const r2 = AntiAdulation.getPressureResponse(3, 2)
    const r3 = AntiAdulation.getPressureResponse(3, 3)
    expect(r1.skipQuestions).toBe(false)
    expect(r2.skipQuestions).toBe(false)
    expect(r3.skipQuestions).toBe(true)
    expect(r3.escalateHints).toBe(true)
  })
})

describe("AntiAdulation.scoreResponse", () => {
  test("short natural message is not suspicious", () => {
    const r = AntiAdulation.scoreResponse("creo que sería con un map")
    expect(r.suspicious).toBe(false)
  })

  test("long message flagged", () => {
    const r = AntiAdulation.scoreResponse("a".repeat(500))
    expect(r.reasons.some((x) => x.includes("long"))).toBe(true)
  })

  test("heavy markdown flagged", () => {
    const msg = "```\n1\n```\n```\n2\n```\n```\n3\n```\n```\n4\n```"
    const r = AntiAdulation.scoreResponse(msg)
    expect(r.reasons.some((x) => x.includes("markdown"))).toBe(true)
  })

  test("formal language patterns flagged", () => {
    const msg = "Furthermore, additionally, it is worth noting that this solution moreover handles edge cases."
    const r = AntiAdulation.scoreResponse(msg)
    expect(r.reasons.some((x) => x.includes("formal"))).toBe(true)
  })

  test("suspicious response gets a deepening tactic", () => {
    const msg = `Furthermore, additionally, ${"a".repeat(500)}`
    const r = AntiAdulation.scoreResponse(msg)
    expect(r.suspicious).toBe(true)
    expect(r.deepenTactic).not.toBe(null)
  })
})

describe("AntiAdulation.containsEmptyPraise", () => {
  test("Spanish praise", () => {
    expect(AntiAdulation.containsEmptyPraise("¡excelente!")).toBe(true)
    expect(AntiAdulation.containsEmptyPraise("buen trabajo")).toBe(true)
    expect(AntiAdulation.containsEmptyPraise("gran pregunta!")).toBe(true)
  })

  test("English praise", () => {
    expect(AntiAdulation.containsEmptyPraise("perfect!")).toBe(true)
    expect(AntiAdulation.containsEmptyPraise("great question")).toBe(true)
  })

  test("neutral text not flagged", () => {
    expect(AntiAdulation.containsEmptyPraise("esto funciona correctamente")).toBe(false)
  })
})

describe("AntiAdulation.getChallengeDirective", () => {
  test("novice intensity is gentle", () => {
    expect(AntiAdulation.getChallengeDirective(1)).toContain("gently")
  })

  test("intermediate intensity is direct", () => {
    expect(AntiAdulation.getChallengeDirective(3)).toContain("directly")
  })

  test("advanced intensity is aggressive", () => {
    expect(AntiAdulation.getChallengeDirective(4)).toContain("aggressively")
    expect(AntiAdulation.getChallengeDirective(5)).toContain("aggressively")
  })
})
