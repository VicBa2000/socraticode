import { describe, test, expect } from "bun:test"
import { Feynman } from "../../src/socratic/feynman"

describe("Feynman queue", () => {
  test("queueTeach / hasQueued / consumeQueued round-trip", () => {
    // Ensure clean
    Feynman.consumeQueued()
    expect(Feynman.hasQueued()).toBe(false)

    Feynman.queueTeach("closures")
    expect(Feynman.hasQueued()).toBe(true)

    const t = Feynman.consumeQueued()
    expect(t).toBe("closures")
    expect(Feynman.hasQueued()).toBe(false)
  })

  test("queueTeach trims whitespace and handles empty", () => {
    Feynman.queueTeach("  react hooks  ")
    expect(Feynman.consumeQueued()).toBe("react hooks")

    Feynman.queueTeach("")
    expect(Feynman.consumeQueued()).toBe("unspecified topic")
  })
})

describe("Feynman.createState / createIdle", () => {
  test("createState starts active with turnCount=0", () => {
    const s = Feynman.createState("closures")
    expect(s.active).toBe(true)
    expect(s.topic).toBe("closures")
    expect(s.turnCount).toBe(0)
  })

  test("createIdle is inactive", () => {
    const s = Feynman.createIdle()
    expect(s.active).toBe(false)
    expect(s.topic).toBe("")
  })
})

describe("Feynman.recordTurn", () => {
  test("increments counter and stores trimmed excerpt", () => {
    const s = Feynman.createState("promises")
    Feynman.recordTurn(s, "un promise es un valor futuro que resolverá")
    expect(s.turnCount).toBe(1)
    expect(s.userExcerpts.length).toBe(1)
    expect(s.userExcerpts[0]).toContain("promise")
  })

  test("truncates excerpt to 200 chars", () => {
    const s = Feynman.createState("x")
    Feynman.recordTurn(s, "a".repeat(500))
    expect(s.userExcerpts[0]!.length).toBeLessThanOrEqual(200)
  })

  test("ignores whitespace-only messages in excerpts", () => {
    const s = Feynman.createState("x")
    Feynman.recordTurn(s, "   \n  ")
    expect(s.turnCount).toBe(1)
    expect(s.userExcerpts.length).toBe(0)
  })
})

describe("Feynman.buildPrompt", () => {
  test("mentions role inversion and the topic", () => {
    const s = Feynman.createState("monads")
    const p = Feynman.buildPrompt(s)
    expect(p).toContain("FEYNMAN TEACH MODE")
    expect(p).toContain("monads")
    expect(p.toLowerCase()).toContain("role inversion")
  })

  test("includes HINT_META with the topic", () => {
    const s = Feynman.createState("closures")
    const p = Feynman.buildPrompt(s)
    expect(p).toContain('[HINT_META:{"correct":null,"topic":"closures"')
  })
})

describe("Feynman.summarize", () => {
  test("zero turns → empty-session hint", () => {
    const s = Feynman.createState("x")
    const out = Feynman.summarize(s, 3)
    expect(out.toLowerCase()).toContain("no explanation")
  })

  test("short session → encouraging hint", () => {
    const s = Feynman.createState("x")
    Feynman.recordTurn(s, "a")
    Feynman.recordTurn(s, "b")
    const out = Feynman.summarize(s, 3)
    expect(out.toLowerCase()).toContain("short session")
  })

  test("solid run → advanced tip for advanced user", () => {
    const s = Feynman.createState("x")
    for (let i = 0; i < 5; i++) Feynman.recordTurn(s, `turn ${i}`)
    const out = Feynman.summarize(s, 4)
    expect(out.toLowerCase()).toContain("solid")
  })
})
