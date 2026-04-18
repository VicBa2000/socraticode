import { describe, test, expect, beforeEach } from "bun:test"
import { Profile } from "../../src/socratic/profile"
import { SocraticDB } from "../../src/socratic/db"
import { resetSocraticDB } from "./_helpers"

beforeEach(() => {
  resetSocraticDB()
})

describe("Profile.load", () => {
  test("returns null when no profile", () => {
    expect(Profile.load()).toBe(null)
  })

  test("loads full snapshot with empty collections", () => {
    SocraticDB.ensureProfile()
    const s = Profile.load()!
    expect(s.globalLevel).toBe(1)
    expect(s.weaknesses).toEqual([])
    expect(s.strengths).toEqual([])
    expect(s.domainLevels).toEqual([])
    expect(s.antipatterns).toEqual([])
  })

  test("includes weaknesses and strengths", () => {
    SocraticDB.ensureProfile()
    SocraticDB.recordError("async", "paradigmas", 3)
    SocraticDB.recordStrength("closures", "fundamentos")
    const s = Profile.load()!
    expect(s.weaknesses.map((w) => w.topic)).toContain("async")
    expect(s.strengths.map((w) => w.topic)).toContain("closures")
  })
})

describe("Profile.updateStreak", () => {
  test("no-op when no profile", () => {
    // Does not throw
    Profile.updateStreak()
    expect(SocraticDB.getProfile()).toBeNull()
  })

  test("first session sets streak to 1", () => {
    SocraticDB.ensureProfile()
    Profile.updateStreak()
    const p = SocraticDB.getProfile()!
    expect(p.streak_days).toBe(1)
    expect(p.last_active_date).not.toBe(null)
  })

  test("same day does not increment", () => {
    SocraticDB.ensureProfile()
    Profile.updateStreak()
    Profile.updateStreak()
    expect(SocraticDB.getProfile()!.streak_days).toBe(1)
  })

  test("gap resets streak to 1", () => {
    SocraticDB.ensureProfile()
    // Simulate 5-day-old streak
    SocraticDB.updateProfile({
      streak_days: 7,
      last_active_date: "2020-01-01", // gap of years
    })
    Profile.updateStreak()
    expect(SocraticDB.getProfile()!.streak_days).toBe(1)
  })

  test("consecutive day extends streak", () => {
    SocraticDB.ensureProfile()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const y = yesterday.toISOString().slice(0, 10)
    SocraticDB.updateProfile({
      streak_days: 3,
      last_active_date: y,
    })
    Profile.updateStreak()
    expect(SocraticDB.getProfile()!.streak_days).toBe(4)
  })
})

describe("Profile.incrementSessionCount / addConceptsLearned", () => {
  test("incrementSessionCount adds 1", () => {
    SocraticDB.ensureProfile()
    Profile.incrementSessionCount()
    Profile.incrementSessionCount()
    expect(SocraticDB.getProfile()!.total_sessions).toBe(2)
  })

  test("addConceptsLearned accumulates", () => {
    SocraticDB.ensureProfile()
    Profile.addConceptsLearned(3)
    Profile.addConceptsLearned(2)
    expect(SocraticDB.getProfile()!.total_concepts_learned).toBe(5)
  })

  test("addConceptsLearned ignores zero/negative", () => {
    SocraticDB.ensureProfile()
    Profile.addConceptsLearned(0)
    Profile.addConceptsLearned(-5)
    expect(SocraticDB.getProfile()!.total_concepts_learned).toBe(0)
  })
})

describe("Profile.getDirectives", () => {
  function baseSnapshot() {
    return {
      globalLevel: 3 as const,
      mode: "learn" as const,
      comprehensionSpeed: 0.5,
      copyTendency: 0.0,
      totalSessions: 0,
      totalConceptsLearned: 0,
      streakDays: 0,
      lastActiveDate: null,
      calibrationCompleted: true,
      userOverride: false,
      weaknesses: [],
      strengths: [],
      domainLevels: [],
      antipatterns: [],
    }
  }

  test("neutral profile → no directives", () => {
    expect(Profile.getDirectives(baseSnapshot())).toEqual([])
  })

  test("low comprehension speed → simplify directive", () => {
    const s = { ...baseSnapshot(), comprehensionSpeed: 0.2 }
    const d = Profile.getDirectives(s)
    expect(d.some((x) => x.includes("LOW COMPREHENSION SPEED"))).toBe(true)
  })

  test("high comprehension speed → concise directive", () => {
    const s = { ...baseSnapshot(), comprehensionSpeed: 0.8 }
    const d = Profile.getDirectives(s)
    expect(d.some((x) => x.includes("HIGH COMPREHENSION SPEED"))).toBe(true)
  })

  test("high copy tendency → probing directive", () => {
    const s = { ...baseSnapshot(), copyTendency: 0.6 }
    const d = Profile.getDirectives(s)
    expect(d.some((x) => x.includes("HIGH COPY TENDENCY"))).toBe(true)
  })

  test("weaknesses surface as directive", () => {
    const s = {
      ...baseSnapshot(),
      weaknesses: [{ topic: "async", domain: "paradigmas", count: 3 }],
    }
    const d = Profile.getDirectives(s)
    expect(d.some((x) => x.includes("WEAK TOPICS") || x.includes("async"))).toBe(true)
  })

  test("7+ day streak triggers acknowledgment directive", () => {
    const s = { ...baseSnapshot(), streakDays: 10 }
    const d = Profile.getDirectives(s)
    expect(d.some((x) => x.includes("consecutive days"))).toBe(true)
  })
})

describe("Profile.formatSummary", () => {
  test("contains core fields", () => {
    const snap = {
      globalLevel: 3 as const,
      mode: "learn" as const,
      comprehensionSpeed: 0.6,
      copyTendency: 0.1,
      totalSessions: 10,
      totalConceptsLearned: 5,
      streakDays: 3,
      lastActiveDate: "2026-04-17",
      calibrationCompleted: true,
      userOverride: false,
      weaknesses: [],
      strengths: [],
      domainLevels: [],
      antipatterns: [],
    }
    const out = Profile.formatSummary(snap)
    expect(out).toContain("Pedagogical Profile")
    expect(out).toContain("Intermediate")
    expect(out).toContain("Total sessions: 10")
    expect(out).toContain("Concepts learned: 5")
    expect(out).toContain("Current streak: 3 days")
  })
})
