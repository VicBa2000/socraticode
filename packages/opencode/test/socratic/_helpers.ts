import { Database } from "../../src/storage/db"
import {
  SocraticProfileTable,
  DomainLevelTable,
  InterestTable,
  ErrorMapTable,
  StrengthTable,
  SocraticSessionTable,
  ReasoningStepTable,
  JournalTable,
  AntipatternTable,
} from "../../src/socratic/socratic.sql"
import { SocraticDB } from "../../src/socratic/db"

/**
 * Wipe all socratic tables between tests. Call from beforeEach to guarantee
 * a clean slate without relying on process isolation (bun:test shares
 * process+DB across tests within the same file).
 */
export function resetSocraticDB() {
  Database.use((db) => {
    db.delete(ReasoningStepTable).run()
    db.delete(SocraticSessionTable).run()
    db.delete(StrengthTable).run()
    db.delete(ErrorMapTable).run()
    db.delete(InterestTable).run()
    db.delete(DomainLevelTable).run()
    db.delete(JournalTable).run()
    db.delete(AntipatternTable).run()
    db.delete(SocraticProfileTable).run()
  })
}

/**
 * Seed `count` evaluated turns into the reasoning_step table. Each turn is
 * correct=true by default. Intended for tests that need upgrade filters to
 * have enough evidence to pass.
 *
 * Varies topic and hint level per turn so topic-diversity and depth-diversity
 * filters pass out of the box. Callers override opts to test failure paths.
 */
export function seedTurns(opts: {
  count: number
  correct?: boolean | null
  hintLevel?: number | ((i: number) => number)
  topic?: string | ((i: number) => string)
  userLevel?: number
  domain?: string
  sessionId?: string
  readiness?: "above" | "at" | "below" | null
}) {
  const {
    count,
    correct = true,
    hintLevel = (i) => i % 3, // 0,1,2,0,1,2,... → all low-hint
    topic = (i) => `topic_${i % 7}`,
    userLevel = 2,
    domain = "lenguajes",
    sessionId = "test-session",
    readiness = null,
  } = opts
  const hintFn = typeof hintLevel === "function" ? hintLevel : () => hintLevel
  const topicFn = typeof topic === "function" ? topic : () => topic
  // Ensure a matching session row exists — the session_id has no FK but the
  // helper is cleaner this way.
  const existing = SocraticDB.getSession(sessionId)
  if (!existing) {
    SocraticDB.createSession(sessionId, userLevel, "learn")
  }
  const baseTime = Date.now() - count * 1000
  for (let i = 0; i < count; i++) {
    SocraticDB.addReasoningStep({
      session_id: sessionId,
      turn_index: i,
      topic: topicFn(i),
      correct: correct === null ? null : correct ? 1 : 0,
      hint_level: hintFn(i),
      user_level: userLevel,
      accompanied_implementation: 0,
      user_excerpt: null,
      agent_excerpt: null,
      domain,
      readiness,
      timestamp: baseTime + i * 1000,
    })
  }
}
