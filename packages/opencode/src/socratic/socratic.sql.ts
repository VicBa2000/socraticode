import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core"
import { Timestamps } from "../storage/schema.sql"

// User's pedagogical profile - one row per user (local tool = one user)
export const SocraticProfileTable = sqliteTable("socratic_profile", {
  id: integer().primaryKey({ autoIncrement: true }),
  global_level: integer().notNull().default(1),
  preferred_mode: text().notNull().default("learn"),
  preferred_language: text().notNull().default("es"),
  comprehension_speed: real().notNull().default(0.5),
  copy_tendency: real().notNull().default(0.0),
  total_sessions: integer().notNull().default(0),
  total_concepts_learned: integer().notNull().default(0),
  streak_days: integer().notNull().default(0),
  last_active_date: text(),
  calibration_completed: integer().notNull().default(0),
  user_override: integer().notNull().default(0),
  override_timestamp: integer(),
  override_sessions_count: integer().notNull().default(0),
  ...Timestamps,
})

// Level per knowledge domain (e.g., javascript=3, docker=1, sql=2)
export const DomainLevelTable = sqliteTable(
  "socratic_domain_level",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    domain: text().notNull(),
    level: integer().notNull().default(1),
    confidence: real().notNull().default(0.5),
    total_interactions: integer().notNull().default(0),
    suggested_adjustment: integer().notNull().default(0),
    ...Timestamps,
  },
  (table) => [uniqueIndex("domain_level_domain_idx").on(table.domain)],
)

// Topics the user is interested in
export const InterestTable = sqliteTable(
  "socratic_interest",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    topic: text().notNull(),
    frequency: integer().notNull().default(1),
    last_seen: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [uniqueIndex("interest_topic_idx").on(table.topic)],
)

// Error map - tracks which concepts the user struggles with
export const ErrorMapTable = sqliteTable(
  "socratic_error_map",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    topic: text().notNull(),
    domain: text().notNull(),
    fail_count: integer().notNull().default(1),
    last_hint_level: integer().notNull().default(0),
    resolved: integer().notNull().default(0),
    last_seen: integer()
      .notNull()
      .$default(() => Date.now()),
    next_review_at: integer(),
  },
  (table) => [uniqueIndex("error_map_topic_domain_idx").on(table.topic, table.domain)],
)

// Strengths - concepts the user has mastered
export const StrengthTable = sqliteTable(
  "socratic_strength",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    topic: text().notNull(),
    domain: text().notNull(),
    success_count: integer().notNull().default(1),
    last_seen: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [uniqueIndex("strength_topic_domain_idx").on(table.topic, table.domain)],
)

// Session tracking - one row per socratic session
export const SocraticSessionTable = sqliteTable(
  "socratic_session",
  {
    id: text().primaryKey(),
    started_at: integer()
      .notNull()
      .$default(() => Date.now()),
    ended_at: integer(),
    total_turns: integer().notNull().default(0),
    correct_count: integer().notNull().default(0),
    incorrect_count: integer().notNull().default(0),
    max_hint_level: integer().notNull().default(0),
    user_level_start: integer(),
    user_level_end: integer(),
    mode: text().notNull().default("learn"),
    topics: text(), // JSON array of topics explored
    concepts_learned: text(), // JSON array of concepts learned
  },
  (table) => [index("socratic_session_started_idx").on(table.started_at)],
)

// Anti-patterns personal library (Phase 11.5) - one row per error class
// the user has shown. Activated after 3 occurrences; deactivated after 5
// consecutive corrections.
export const AntipatternTable = sqliteTable(
  "socratic_antipattern",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    error_class: text().notNull(),
    label: text().notNull(),
    occurrence_count: integer().notNull().default(1),
    correct_streak: integer().notNull().default(0),
    first_seen: integer()
      .notNull()
      .$default(() => Date.now()),
    last_seen: integer()
      .notNull()
      .$default(() => Date.now()),
    active: integer().notNull().default(0),
  },
  (table) => [uniqueIndex("antipattern_error_class_idx").on(table.error_class)],
)

// Journal entries - one row per completed session, used for /journal rollups
export const JournalTable = sqliteTable(
  "socratic_journal",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    session_id: text().notNull(),
    entry_date: text().notNull(), // ISO date YYYY-MM-DD
    learned: text().notNull().default("[]"), // JSON array of topics
    practiced: text().notNull().default("[]"), // JSON array of topics
    struggled: text().notNull().default("[]"), // JSON array of topics
    total_turns: integer().notNull().default(0),
    comprehension_rate: real().notNull().default(0),
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("journal_date_idx").on(table.entry_date),
    index("journal_created_idx").on(table.created_at),
  ],
)

// Reasoning steps - each turn in a conversation
export const ReasoningStepTable = sqliteTable(
  "socratic_reasoning_step",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    session_id: text().notNull(),
    turn_index: integer().notNull(),
    topic: text(),
    correct: integer(), // 0 or 1
    hint_level: integer().notNull().default(0),
    user_level: integer().notNull(),
    accompanied_implementation: integer().notNull().default(0),
    user_excerpt: text(),
    agent_excerpt: text(),
    domain: text(),
    // "above" | "at" | "below" | null — model's read of whether the user
    // answered above, at, or below their current level. Used by the upgrade
    // weighted-avg filter (readiness='above' boosts weight, 'below' penalizes).
    readiness: text(),
    timestamp: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("reasoning_step_session_idx").on(table.session_id),
    index("reasoning_step_domain_idx").on(table.domain),
  ],
)
