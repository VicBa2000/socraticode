import { describe, test, expect } from "bun:test"
import { Detector } from "../../src/socratic/detector"

describe("Detector.detectZeroKnowledge", () => {
  test("catches Spanish 'no sé'", () => {
    expect(Detector.hasZeroKnowledge("no sé qué es eso")).toBe(true)
    expect(Detector.hasZeroKnowledge("no se de esto")).toBe(true)
  })

  test("catches English variants", () => {
    expect(Detector.hasZeroKnowledge("I don't know")).toBe(true)
    expect(Detector.hasZeroKnowledge("no idea what that is")).toBe(true)
    expect(Detector.hasZeroKnowledge("first time using this")).toBe(true)
    expect(Detector.hasZeroKnowledge("I'm lost")).toBe(true)
  })

  test("catches 'nunca he usado'", () => {
    expect(Detector.hasZeroKnowledge("nunca he trabajado con esto")).toBe(true)
  })

  test("ignores normal messages", () => {
    expect(Detector.hasZeroKnowledge("quiero crear una API REST")).toBe(false)
    expect(Detector.hasZeroKnowledge("el código ya funciona")).toBe(false)
  })

  test("counts multiple distinct patterns", () => {
    const count = Detector.detectZeroKnowledge("no sé nada, estoy perdido y es mi primera vez")
    expect(count).toBeGreaterThanOrEqual(2)
  })
})

describe("Detector.detectSlowDownRequest", () => {
  test("Spanish", () => {
    expect(Detector.detectSlowDownRequest("puedes ir más lento por favor")).toBe(true)
    expect(Detector.detectSlowDownRequest("explica paso a paso")).toBe(true)
    expect(Detector.detectSlowDownRequest("repite eso")).toBe(true)
  })

  test("English", () => {
    expect(Detector.detectSlowDownRequest("can you slow down")).toBe(true)
    expect(Detector.detectSlowDownRequest("explain step by step")).toBe(true)
    expect(Detector.detectSlowDownRequest("I'm confused")).toBe(true)
  })

  test("ignores normal messages", () => {
    expect(Detector.detectSlowDownRequest("gracias, entendí")).toBe(false)
  })
})

describe("Detector.detectCopyPaste", () => {
  test("long code block from novice is suspicious", () => {
    const message = "```js\n" + Array(20).fill("console.log('x');").join("\n") + "\n```"
    const r = Detector.detectCopyPaste(message, 1, 30)
    expect(r.isCopy).toBe(true)
    expect(r.reasons.length).toBeGreaterThan(0)
  })

  test("multiple code blocks flagged", () => {
    const message = "```js\na\n```\n```js\nb\n```\n```js\nc\n```"
    const r = Detector.detectCopyPaste(message, 3, 20)
    expect(r.reasons.some((x) => x.includes("multiple"))).toBe(true)
  })

  test("short messages from any level are not copy", () => {
    const r = Detector.detectCopyPaste("tengo dudas", 2, 100)
    expect(r.isCopy).toBe(false)
  })

  test("sophisticated patterns from novice bump score", () => {
    const message = `
\`\`\`ts
interface User { id: string }
class A extends B implements C {
  async run() { await Promise.all([]) }
}
\`\`\`
    `.trim()
    const r = Detector.detectCopyPaste(message, 1, 20)
    expect(r.reasons.some((x) => x.includes("advanced patterns"))).toBe(true)
  })

  test("5x length jump from previous triggers reason", () => {
    const message = "a".repeat(500)
    const r = Detector.detectCopyPaste(message, 3, 50)
    expect(r.reasons.some((x) => x.includes("length"))).toBe(true)
  })
})

describe("Detector.countTechnicalTerms", () => {
  test("counts distinct technical terms", () => {
    const message = "I use memoization and dependency injection with middleware"
    expect(Detector.countTechnicalTerms(message)).toBeGreaterThanOrEqual(2)
  })

  test("hasTechnicalVocabulary requires >= 2", () => {
    expect(Detector.hasTechnicalVocabulary("explain polymorphism")).toBe(false)
    expect(Detector.hasTechnicalVocabulary("polymorphism and inheritance in OOP")).toBe(true)
  })

  test("ignores non-technical text", () => {
    expect(Detector.countTechnicalTerms("hola mundo")).toBe(0)
  })
})
