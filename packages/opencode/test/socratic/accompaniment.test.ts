import { describe, test, expect } from "bun:test"
import { Accompaniment } from "../../src/socratic/accompaniment"

describe("Accompaniment.createIdleState", () => {
  test("starts idle with no modules", () => {
    const s = Accompaniment.createIdleState()
    expect(s.phase).toBe("idle")
    expect(s.totalModules).toBe(0)
    expect(s.currentModule).toBe(0)
  })
})

describe("Accompaniment state transitions", () => {
  test("startAccompaniment → contexto phase", () => {
    const s = Accompaniment.startAccompaniment(["a", "b"])
    expect(s.phase).toBe("contexto")
    expect(s.totalModules).toBe(2)
    expect(s.moduleNames).toEqual(["a", "b"])
  })

  test("advanceToPlanning → plan phase", () => {
    let s = Accompaniment.startAccompaniment(["a"])
    s = Accompaniment.advanceToPlanning(s)
    expect(s.phase).toBe("plan")
    expect(s.conceptExplained).toBe(true)
  })

  test("startModule sets current module name", () => {
    let s = Accompaniment.startAccompaniment(["a", "b"])
    s = Accompaniment.startModule(s)
    expect(s.phase).toBe("modulo")
    expect(s.currentModuleName).toBe("a")
  })

  test("verificationPassed advances module or goes to resumen", () => {
    let s = Accompaniment.startAccompaniment(["a", "b"])
    s = Accompaniment.startModule(s)
    s = Accompaniment.verificationPassed(s)
    expect(s.currentModule).toBe(1)
    expect(s.currentModuleName).toBe("b")
    s = Accompaniment.verificationPassed(s)
    expect(s.phase).toBe("resumen")
  })

  test("verificationFailed increments failed counter", () => {
    let s = Accompaniment.startAccompaniment(["a"])
    s = Accompaniment.startModule(s)
    s = Accompaniment.askVerification(s)
    s = Accompaniment.verificationFailed(s)
    expect(s.failedVerifications).toBe(1)
  })
})

describe("Accompaniment.getPhaseDirective", () => {
  test("idle returns null", () => {
    const s = Accompaniment.createIdleState()
    expect(Accompaniment.getPhaseDirective(s, 3)).toBe(null)
  })

  test("each non-idle phase yields a directive string", () => {
    const modules = ["auth.ts", "routes.ts"]
    let s = Accompaniment.startAccompaniment(modules)
    for (const phase of [
      "contexto",
      "plan",
      "modulo",
      "modulo_verificacion",
      "resumen",
      "verificacion_final",
    ] as const) {
      s = { ...s, phase }
      const d = Accompaniment.getPhaseDirective(s, 3)
      expect(typeof d).toBe("string")
      expect(d!.length).toBeGreaterThan(10)
    }
  })

  test("lite variant is shorter than strong for every phase", () => {
    let s = Accompaniment.startAccompaniment(["a", "b"])
    s = Accompaniment.startModule(s)
    for (const phase of [
      "contexto",
      "plan",
      "modulo",
      "modulo_verificacion",
      "resumen",
      "verificacion_final",
    ] as const) {
      const state = { ...s, phase }
      const strong = Accompaniment.getPhaseDirective(state, 3, "strong")!
      const lite = Accompaniment.getPhaseDirective(state, 3, "lite")!
      expect(lite.length).toBeLessThan(strong.length)
    }
  })

  test("module directive differs by user level (novice verbose, advanced terse)", () => {
    let s = Accompaniment.startAccompaniment(["auth"])
    s = Accompaniment.startModule(s)
    const novice = Accompaniment.getPhaseDirective(s, 1, "strong")!
    const advanced = Accompaniment.getPhaseDirective(s, 4, "strong")!
    expect(novice.length).toBeGreaterThan(advanced.length)
  })
})

describe("Accompaniment.shouldAccompany", () => {
  test("novice always accompanied in learn mode", () => {
    expect(Accompaniment.shouldAccompany(1, "learn")).toBe(true)
  })

  test("expert never accompanied", () => {
    expect(Accompaniment.shouldAccompany(5, "learn")).toBe(false)
    expect(Accompaniment.shouldAccompany(5, "productive")).toBe(false)
  })

  test("productive mode reduces accompaniment", () => {
    expect(Accompaniment.shouldAccompany(3, "learn")).toBe(true)
    expect(Accompaniment.shouldAccompany(3, "productive")).toBe(false)
  })
})
