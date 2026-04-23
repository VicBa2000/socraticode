import { eq, and, isNull, isNotNull, or, lte, gte, asc, desc } from "drizzle-orm"
import { Database } from "../storage/db"
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
} from "./socratic.sql"

export namespace SocraticDB {
  // ── Profile ──────────────────────────────────────────────

  export function getProfile() {
    return Database.use((db) => {
      const rows = db.select().from(SocraticProfileTable).limit(1).all()
      return rows[0] ?? null
    })
  }

  export function ensureProfile() {
    return Database.use((db) => {
      const existing = db.select().from(SocraticProfileTable).limit(1).all()
      if (existing.length > 0) return existing[0]!

      const now = Date.now()
      db.insert(SocraticProfileTable)
        .values({ time_created: now, time_updated: now })
        .run()

      return db.select().from(SocraticProfileTable).limit(1).all()[0]!
    })
  }

  export function updateProfile(data: Partial<typeof SocraticProfileTable.$inferInsert>) {
    return Database.use((db) => {
      const profile = ensureProfile()
      db.update(SocraticProfileTable)
        .set({ ...data, time_updated: Date.now() })
        .where(eq(SocraticProfileTable.id, profile.id))
        .run()
    })
  }

  // ── Domain Levels ────────────────────────────────────────

  export function getDomainLevel(domain: string) {
    return Database.use((db) => {
      const rows = db
        .select()
        .from(DomainLevelTable)
        .where(eq(DomainLevelTable.domain, domain))
        .limit(1)
        .all()
      return rows[0] ?? null
    })
  }

  export function getAllDomainLevels() {
    return Database.use((db) => {
      return db.select().from(DomainLevelTable).all()
    })
  }

  export function setDomainLevel(domain: string, level: number) {
    return Database.use((db) => {
      const existing = db
        .select()
        .from(DomainLevelTable)
        .where(eq(DomainLevelTable.domain, domain))
        .limit(1)
        .all()

      const now = Date.now()
      if (existing.length > 0) {
        db.update(DomainLevelTable)
          .set({
            level,
            total_interactions: existing[0]!.total_interactions + 1,
            time_updated: now,
          })
          .where(eq(DomainLevelTable.domain, domain))
          .run()
      } else {
        db.insert(DomainLevelTable)
          .values({ domain, level, time_created: now, time_updated: now })
          .run()
      }
    })
  }

  // ── Error Map ────────────────────────────────────────────

  export function recordError(topic: string, domain: string, hintLevel: number) {
    return Database.use((db) => {
      const existing = db
        .select()
        .from(ErrorMapTable)
        .where(and(eq(ErrorMapTable.topic, topic), eq(ErrorMapTable.domain, domain)))
        .limit(1)
        .all()

      const now = Date.now()
      if (existing.length > 0) {
        db.update(ErrorMapTable)
          .set({
            fail_count: existing[0]!.fail_count + 1,
            last_hint_level: hintLevel,
            resolved: 0,
            last_seen: now,
          })
          .where(and(eq(ErrorMapTable.topic, topic), eq(ErrorMapTable.domain, domain)))
          .run()
      } else {
        db.insert(ErrorMapTable)
          .values({ topic, domain, last_hint_level: hintLevel, last_seen: now })
          .run()
      }
    })
  }

  export function resolveError(topic: string, domain: string) {
    return Database.use((db) => {
      db.update(ErrorMapTable)
        .set({ resolved: 1, last_seen: Date.now() })
        .where(and(eq(ErrorMapTable.topic, topic), eq(ErrorMapTable.domain, domain)))
        .run()
    })
  }

  export function getTopWeaknesses(limit = 10) {
    return Database.use((db) => {
      return db
        .select()
        .from(ErrorMapTable)
        .where(eq(ErrorMapTable.resolved, 0))
        .orderBy(ErrorMapTable.fail_count)
        .limit(limit)
        .all()
    })
  }

  export function getErrorRow(topic: string, domain: string) {
    return Database.use((db) => {
      const rows = db
        .select()
        .from(ErrorMapTable)
        .where(and(eq(ErrorMapTable.topic, topic), eq(ErrorMapTable.domain, domain)))
        .limit(1)
        .all()
      return rows[0] ?? null
    })
  }

  export function setNextReviewAt(topic: string, domain: string, nextReviewAt: number) {
    return Database.use((db) => {
      db.update(ErrorMapTable)
        .set({ next_review_at: nextReviewAt })
        .where(and(eq(ErrorMapTable.topic, topic), eq(ErrorMapTable.domain, domain)))
        .run()
    })
  }

  /**
   * Return unresolved weaknesses that are due (or missing a schedule), ordered
   * by urgency (oldest next_review_at first).
   */
  export function getReviewCandidates(limit = 10) {
    return Database.use((db) => {
      const now = Date.now()
      return db
        .select()
        .from(ErrorMapTable)
        .where(
          and(
            eq(ErrorMapTable.resolved, 0),
            or(isNull(ErrorMapTable.next_review_at), lte(ErrorMapTable.next_review_at, now)),
          ),
        )
        .orderBy(asc(ErrorMapTable.next_review_at))
        .limit(limit)
        .all()
    })
  }

  // ── Strengths ────────────────────────────────────────────

  export function recordStrength(topic: string, domain: string) {
    return Database.use((db) => {
      const existing = db
        .select()
        .from(StrengthTable)
        .where(and(eq(StrengthTable.topic, topic), eq(StrengthTable.domain, domain)))
        .limit(1)
        .all()

      const now = Date.now()
      if (existing.length > 0) {
        db.update(StrengthTable)
          .set({
            success_count: existing[0]!.success_count + 1,
            last_seen: now,
          })
          .where(and(eq(StrengthTable.topic, topic), eq(StrengthTable.domain, domain)))
          .run()
      } else {
        db.insert(StrengthTable).values({ topic, domain, last_seen: now }).run()
      }
    })
  }

  export function getTopStrengths(limit = 10) {
    return Database.use((db) => {
      return db
        .select()
        .from(StrengthTable)
        .orderBy(StrengthTable.success_count)
        .limit(limit)
        .all()
    })
  }

  /**
   * Check if a topic is mastered (any domain) with at least `minCount` successes.
   * Used by the prerequisite system to verify the user has dominated a topic
   * before tackling something that depends on it.
   */
  export function hasTopicStrength(topic: string, minCount = 2): boolean {
    return Database.use((db) => {
      const rows = db
        .select()
        .from(StrengthTable)
        .where(eq(StrengthTable.topic, topic))
        .all()
      return rows.some((r) => r.success_count >= minCount)
    })
  }

  // ── Interests ────────────────────────────────────────────

  export function recordInterest(topic: string) {
    return Database.use((db) => {
      const existing = db
        .select()
        .from(InterestTable)
        .where(eq(InterestTable.topic, topic))
        .limit(1)
        .all()

      const now = Date.now()
      if (existing.length > 0) {
        db.update(InterestTable)
          .set({
            frequency: existing[0]!.frequency + 1,
            last_seen: now,
          })
          .where(eq(InterestTable.topic, topic))
          .run()
      } else {
        db.insert(InterestTable).values({ topic, last_seen: now }).run()
      }
    })
  }

  // ── Sessions ─────────────────────────────────────────────

  export function createSession(id: string, userLevel: number, mode: string) {
    return Database.use((db) => {
      db.insert(SocraticSessionTable)
        .values({
          id,
          user_level_start: userLevel,
          mode,
          started_at: Date.now(),
        })
        .run()
    })
  }

  export function updateSession(id: string, data: Partial<typeof SocraticSessionTable.$inferInsert>) {
    return Database.use((db) => {
      db.update(SocraticSessionTable)
        .set(data)
        .where(eq(SocraticSessionTable.id, id))
        .run()
    })
  }

  export function getSession(id: string) {
    return Database.use((db) => {
      const rows = db
        .select()
        .from(SocraticSessionTable)
        .where(eq(SocraticSessionTable.id, id))
        .limit(1)
        .all()
      return rows[0] ?? null
    })
  }

  // ── Reasoning Steps ──────────────────────────────────────

  export function addReasoningStep(step: typeof ReasoningStepTable.$inferInsert) {
    return Database.use((db) => {
      db.insert(ReasoningStepTable).values(step).run()
    })
  }

  export function getSessionSteps(sessionId: string) {
    return Database.use((db) => {
      return db
        .select()
        .from(ReasoningStepTable)
        .where(eq(ReasoningStepTable.session_id, sessionId))
        .orderBy(ReasoningStepTable.turn_index)
        .all()
    })
  }

  /**
   * Return the most recent evaluated turns (correct IS NOT NULL) across all
   * sessions, newest first. Used by the upgrade filters to build a window of
   * evidence independent of session boundaries.
   */
  export function getRecentEvaluatedTurns(limit: number) {
    return Database.use((db) => {
      return db
        .select()
        .from(ReasoningStepTable)
        .where(isNotNull(ReasoningStepTable.correct))
        .orderBy(desc(ReasoningStepTable.timestamp))
        .limit(limit)
        .all()
    })
  }

  // ── Journal ──────────────────────────────────────────────

  export function insertJournalEntry(entry: typeof JournalTable.$inferInsert) {
    return Database.use((db) => {
      db.insert(JournalTable)
        .values({ ...entry, created_at: entry.created_at ?? Date.now() })
        .run()
    })
  }

  /**
   * Get journal entries within an inclusive timestamp range (ms).
   * Ordered newest first.
   */
  export function getJournalEntries(fromMs: number, toMs: number) {
    return Database.use((db) => {
      return db
        .select()
        .from(JournalTable)
        .where(and(gte(JournalTable.created_at, fromMs), lte(JournalTable.created_at, toMs)))
        .orderBy(desc(JournalTable.created_at))
        .all()
    })
  }

  export function getLatestJournalEntries(limit = 7) {
    return Database.use((db) => {
      return db
        .select()
        .from(JournalTable)
        .orderBy(desc(JournalTable.created_at))
        .limit(limit)
        .all()
    })
  }

  // ── Anti-patterns ────────────────────────────────────────

  export function getAntipattern(errorClass: string) {
    return Database.use((db) => {
      const rows = db
        .select()
        .from(AntipatternTable)
        .where(eq(AntipatternTable.error_class, errorClass))
        .limit(1)
        .all()
      return rows[0] ?? null
    })
  }

  /**
   * Increment occurrence count and refresh last_seen. Activates the pattern
   * once occurrence_count crosses the activation threshold (default 3).
   * Always resets correct_streak since this is a fresh failure.
   */
  export function recordAntipatternOccurrence(
    errorClass: string,
    label: string,
    activationThreshold = 3,
  ) {
    return Database.use((db) => {
      const existing = db
        .select()
        .from(AntipatternTable)
        .where(eq(AntipatternTable.error_class, errorClass))
        .limit(1)
        .all()

      const now = Date.now()
      if (existing.length > 0) {
        const row = existing[0]!
        const newCount = row.occurrence_count + 1
        const shouldActivate = newCount >= activationThreshold ? 1 : row.active
        db.update(AntipatternTable)
          .set({
            occurrence_count: newCount,
            correct_streak: 0,
            last_seen: now,
            active: shouldActivate,
          })
          .where(eq(AntipatternTable.error_class, errorClass))
          .run()
      } else {
        db.insert(AntipatternTable)
          .values({
            error_class: errorClass,
            label,
            occurrence_count: 1,
            correct_streak: 0,
            first_seen: now,
            last_seen: now,
            active: 1 >= activationThreshold ? 1 : 0,
          })
          .run()
      }
    })
  }

  /**
   * Record a corrective success. If correct_streak reaches deactivationThreshold,
   * the pattern is deactivated (but row stays for history).
   */
  export function recordAntipatternCorrection(
    errorClass: string,
    deactivationThreshold = 5,
  ) {
    return Database.use((db) => {
      const rows = db
        .select()
        .from(AntipatternTable)
        .where(eq(AntipatternTable.error_class, errorClass))
        .limit(1)
        .all()
      if (rows.length === 0) return
      const row = rows[0]!
      const newStreak = row.correct_streak + 1
      const stillActive = newStreak >= deactivationThreshold ? 0 : row.active
      db.update(AntipatternTable)
        .set({ correct_streak: newStreak, active: stillActive })
        .where(eq(AntipatternTable.error_class, errorClass))
        .run()
    })
  }

  export function getActiveAntipatterns() {
    return Database.use((db) => {
      return db
        .select()
        .from(AntipatternTable)
        .where(eq(AntipatternTable.active, 1))
        .orderBy(desc(AntipatternTable.last_seen))
        .all()
    })
  }

  export function getAllAntipatterns() {
    return Database.use((db) => {
      return db
        .select()
        .from(AntipatternTable)
        .orderBy(desc(AntipatternTable.occurrence_count))
        .all()
    })
  }
}
