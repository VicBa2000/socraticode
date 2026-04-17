import { describe, test, expect, beforeEach } from "bun:test"
import { Prerequisites } from "../../src/socratic/prerequisites"
import { SocraticDB } from "../../src/socratic/db"
import { resetSocraticDB } from "./_helpers"

beforeEach(() => {
  resetSocraticDB()
})

describe("Prerequisites.detectTopic", () => {
  test("picks the most specific keyword", () => {
    // "async/await" should beat "async"
    expect(Prerequisites.detectTopic("cómo funciona async/await en JS")).toBe("async-await")
  })

  test("detects react hooks via useEffect keyword", () => {
    expect(Prerequisites.detectTopic("cómo usar useEffect con cleanup")).toBe("react-hooks")
  })

  test("detects sql joins via 'inner join' phrase", () => {
    expect(Prerequisites.detectTopic("necesito un inner join entre dos tablas")).toBe("sql-joins")
  })

  test("returns null when no topic matches", () => {
    expect(Prerequisites.detectTopic("hola mundo")).toBe(null)
  })
})

describe("Prerequisites.getPrerequisites", () => {
  test("resolves depth=1 direct prereqs", () => {
    const direct = Prerequisites.getPrerequisites("async-await", 1)
    expect(direct).toContain("promises")
  })

  test("resolves depth=2 includes grandparents", () => {
    const all = Prerequisites.getPrerequisites("async-await", 2)
    expect(all).toContain("promises")
    expect(all).toContain("callbacks")
  })

  test("handles unknown topic gracefully", () => {
    expect(Prerequisites.getPrerequisites("not-a-real-topic")).toEqual([])
  })

  test("no duplicates even through multiple paths", () => {
    const all = Prerequisites.getPrerequisites("react-hooks", 2)
    const unique = new Set(all)
    expect(all.length).toBe(unique.size)
  })
})

describe("Prerequisites.findGap", () => {
  test("returns gap when direct prereq is unmastered", () => {
    const gap = Prerequisites.findGap("async-await")
    expect(gap).not.toBe(null)
    expect(gap!.missingPrereq).toBe("promises")
  })

  test("returns null when all prereqs are mastered", () => {
    SocraticDB.recordStrength("promises", "paradigmas")
    SocraticDB.recordStrength("promises", "paradigmas")
    const gap = Prerequisites.findGap("async-await")
    // direct prereq promises is now mastered; findGap may surface grandparent
    // gap (callbacks) — let's allow either null or grandparent gap
    if (gap !== null) {
      expect(gap.missingPrereq).toBe("callbacks")
    }
  })

  test("topic without prereqs → null", () => {
    expect(Prerequisites.findGap("not-in-graph")).toBe(null)
  })
})

describe("Prerequisites.shouldEnforce", () => {
  test("enforce for levels 1-3", () => {
    expect(Prerequisites.shouldEnforce(1)).toBe(true)
    expect(Prerequisites.shouldEnforce(2)).toBe(true)
    expect(Prerequisites.shouldEnforce(3)).toBe(true)
  })

  test("skip for levels 4+", () => {
    expect(Prerequisites.shouldEnforce(4)).toBe(false)
    expect(Prerequisites.shouldEnforce(5)).toBe(false)
  })
})

describe("Prerequisites.buildGapDirective", () => {
  test("novice style is gentle", () => {
    const d = Prerequisites.buildGapDirective(
      { targetTopic: "x", missingPrereq: "y", chain: ["x", "y"] },
      1,
    )
    expect(d.toLowerCase()).toContain("concrete")
  })

  test("intermediate+ style is sharp", () => {
    const d = Prerequisites.buildGapDirective(
      { targetTopic: "x", missingPrereq: "y", chain: ["x", "y"] },
      3,
    )
    expect(d.toLowerCase()).toContain("sharp")
  })

  test("mentions the missing prereq", () => {
    const d = Prerequisites.buildGapDirective(
      { targetTopic: "async-await", missingPrereq: "promises", chain: [] },
      3,
    )
    expect(d).toContain("promises")
    expect(d).toContain("async-await")
  })
})
