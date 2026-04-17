import { describe, test, expect } from "bun:test"
import { Taxonomy } from "../../src/socratic/taxonomy"

describe("Taxonomy.DOMAINS", () => {
  test("7 domains expected", () => {
    expect(Taxonomy.ALL_DOMAINS.length).toBe(7)
  })

  test("each domain has a label and keywords", () => {
    for (const key of Taxonomy.ALL_DOMAINS) {
      const d = Taxonomy.DOMAINS[key]
      expect(typeof d.label).toBe("string")
      expect(d.keywords.length).toBeGreaterThan(0)
    }
  })
})

describe("Taxonomy.detectPrimaryDomain", () => {
  test("JS/TS questions → lenguajes", () => {
    expect(Taxonomy.detectPrimaryDomain("cómo uso typescript con decorators")).toBe("lenguajes")
  })

  test("React questions → web", () => {
    expect(Taxonomy.detectPrimaryDomain("explica useState y useEffect en React")).toBe("web")
  })

  test("SQL/Postgres → backend", () => {
    expect(Taxonomy.detectPrimaryDomain("cómo escribir una query SQL con joins en postgres")).toBe("backend")
  })

  test("Git commands → infraestructura", () => {
    expect(Taxonomy.detectPrimaryDomain("cómo hago rebase en git")).toBe("infraestructura")
  })

  test("Design patterns → avanzado", () => {
    expect(Taxonomy.detectPrimaryDomain("explica arquitectura hexagonal y domain driven design")).toBe("avanzado")
  })

  test("Short non-technical text returns null", () => {
    expect(Taxonomy.detectPrimaryDomain("hola")).toBe(null)
  })
})

describe("Taxonomy.detectDomains", () => {
  test("returns sorted by score (best first)", () => {
    // Message touches both 'lenguajes' (typescript, generics) and 'paradigmas' (async, promise)
    const domains = Taxonomy.detectDomains("typescript generics with async await and promise")
    expect(domains.length).toBeGreaterThanOrEqual(2)
    expect(domains[0]).toBeOneOf(["lenguajes", "paradigmas"])
  })

  test("empty message returns empty array", () => {
    expect(Taxonomy.detectDomains("")).toEqual([])
  })

  test("short keywords use word-boundary matching", () => {
    // "db" should match backend but not be triggered by arbitrary substring
    expect(Taxonomy.detectDomains("debug")).not.toContain("backend")
  })
})
