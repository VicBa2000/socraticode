import { describe, test, expect, beforeEach } from "bun:test"
import { Antipatterns } from "../../src/socratic/antipatterns"
import { SocraticDB } from "../../src/socratic/db"
import { resetSocraticDB } from "./_helpers"

beforeEach(() => {
  resetSocraticDB()
})

describe("Antipatterns.detectErrorClass", () => {
  test("detects loose equality (==)", () => {
    const c = Antipatterns.detectErrorClass("if (x == 5) return;")
    expect(c?.id).toBe("loose-equality")
  })

  test("detects var usage", () => {
    const c = Antipatterns.detectErrorClass("var x = 5;")
    expect(c?.id).toBe("var-usage")
  })

  test("detects unhandled promise .then without .catch", () => {
    const c = Antipatterns.detectErrorClass("fetch('/x').then(r => r.json())")
    expect(c?.id).toBe("unhandled-promise")
  })

  test("detects await without try/catch", () => {
    const c = Antipatterns.detectErrorClass("async function f() { await fetch('/x'); return 1; }")
    expect(c?.id).toBe("unhandled-promise")
  })

  test("detects array mutation in pure context", () => {
    const c = Antipatterns.detectErrorClass("state.push(x)", "react-state")
    expect(c?.id).toBe("array-mutation-when-pure")
  })

  test("does NOT flag array mutation outside pure topics", () => {
    const c = Antipatterns.detectErrorClass("state.push(x)", "loops")
    expect(c?.id).not.toBe("array-mutation-when-pure")
  })

  test("ignores strict equality (===)", () => {
    const c = Antipatterns.detectErrorClass("if (x === 5) return;")
    expect(c).toBe(null)
  })

  test("ignores arrow functions (=>) as false positive for loose-equality", () => {
    const c = Antipatterns.detectErrorClass("const f = (x) => x + 1")
    expect(c?.id).not.toBe("loose-equality")
  })

  test("short messages return null", () => {
    expect(Antipatterns.detectErrorClass("hi")).toBe(null)
    expect(Antipatterns.detectErrorClass("")).toBe(null)
  })
})

describe("Antipatterns.recordOccurrence / activation", () => {
  test("3 occurrences activates the antipattern", () => {
    const cls = Antipatterns.ERROR_CLASSES.find((c) => c.id === "var-usage")!
    Antipatterns.recordOccurrence(cls)
    Antipatterns.recordOccurrence(cls)
    // Not yet active on 2
    let row = SocraticDB.getAntipattern("var-usage")!
    expect(row.active).toBe(0)
    Antipatterns.recordOccurrence(cls)
    row = SocraticDB.getAntipattern("var-usage")!
    expect(row.active).toBe(1)
    expect(row.occurrence_count).toBe(3)
  })
})

describe("Antipatterns.recordCorrection / deactivation", () => {
  test("5 corrections deactivate the antipattern", () => {
    const cls = Antipatterns.ERROR_CLASSES.find((c) => c.id === "loose-equality")!
    for (let i = 0; i < 3; i++) Antipatterns.recordOccurrence(cls)
    expect(SocraticDB.getAntipattern("loose-equality")!.active).toBe(1)
    for (let i = 0; i < 5; i++) Antipatterns.recordCorrection("loose-equality")
    expect(SocraticDB.getAntipattern("loose-equality")!.active).toBe(0)
  })

  test("correction resets streak on re-occurrence", () => {
    const cls = Antipatterns.ERROR_CLASSES.find((c) => c.id === "var-usage")!
    for (let i = 0; i < 3; i++) Antipatterns.recordOccurrence(cls)
    Antipatterns.recordCorrection("var-usage")
    Antipatterns.recordOccurrence(cls)
    const row = SocraticDB.getAntipattern("var-usage")!
    expect(row.correct_streak).toBe(0)
  })
})

describe("Antipatterns.buildDirective", () => {
  test("null when no active patterns", () => {
    expect(Antipatterns.buildDirective()).toBe(null)
  })

  test("includes labels when active patterns exist", () => {
    const cls = Antipatterns.ERROR_CLASSES.find((c) => c.id === "var-usage")!
    for (let i = 0; i < 3; i++) Antipatterns.recordOccurrence(cls)
    const d = Antipatterns.buildDirective()
    expect(d).not.toBe(null)
    expect(d!.toLowerCase()).toContain("var")
    expect(d!).toContain("WATCH FOR")
  })
})
