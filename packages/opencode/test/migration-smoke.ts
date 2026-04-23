/**
 * Smoke test: apply all socratic migrations on a fresh on-disk SQLite file
 * and verify the readiness column exists. Run with:
 *   OPENCODE_DB=C:/tmp/mig-test.db bun test/migration-smoke.ts
 */
import { Database } from "bun:sqlite"
import { readdirSync, readFileSync, existsSync, unlinkSync } from "fs"
import path from "path"

import os from "os"
const dbPath =
  process.env["OPENCODE_DB"] ?? path.join(os.tmpdir(), `mig-smoke-${Date.now()}-${process.pid}.db`)
for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  try {
    if (existsSync(p)) unlinkSync(p)
  } catch {
    // Prior run may have left a busy handle; the unique path above dodges it.
  }
}

const db = new Database(dbPath)
db.run("PRAGMA journal_mode = WAL")

const migrationDir = path.resolve(import.meta.dir, "../migration")
const dirs = readdirSync(migrationDir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort()

let applied = 0
for (const name of dirs) {
  const file = path.join(migrationDir, name, "migration.sql")
  if (!existsSync(file)) continue
  const sql = readFileSync(file, "utf-8")
  // statement-breakpoint is the drizzle separator
  const statements = sql.split("--> statement-breakpoint")
  for (const stmt of statements) {
    const trimmed = stmt.trim()
    if (!trimmed) continue
    try {
      db.run(trimmed)
    } catch (e) {
      console.error(`FAIL in ${name}:`, (e as Error).message)
      console.error(`SQL: ${trimmed.slice(0, 200)}`)
      process.exit(1)
    }
  }
  applied++
}

console.log(`Applied ${applied} migrations to fresh DB at ${dbPath}`)

// Verify readiness column exists on socratic_reasoning_step
const cols = db.query("PRAGMA table_info(socratic_reasoning_step)").all() as Array<{
  name: string
  type: string
}>
const colNames = cols.map((c) => c.name)
console.log("socratic_reasoning_step columns:", colNames.join(", "))

if (!colNames.includes("readiness")) {
  console.error("FAIL: readiness column missing")
  process.exit(1)
}

// Verify we can insert a row with readiness set
db.run(`INSERT INTO socratic_reasoning_step
  (session_id, turn_index, topic, correct, hint_level, user_level,
   accompanied_implementation, domain, readiness, timestamp)
  VALUES ('smoke-session', 0, 't1', 1, 2, 3, 0, 'lenguajes', 'above', ${Date.now()})`)

const row = db
  .query("SELECT readiness FROM socratic_reasoning_step WHERE session_id = 'smoke-session'")
  .get() as { readiness: string } | undefined

if (row?.readiness !== "above") {
  console.error(`FAIL: readiness round-trip expected 'above', got ${JSON.stringify(row)}`)
  process.exit(1)
}

// Verify we can insert with readiness=NULL (back-compat)
db.run(`INSERT INTO socratic_reasoning_step
  (session_id, turn_index, topic, correct, hint_level, user_level,
   accompanied_implementation, domain, timestamp)
  VALUES ('smoke-session', 1, 't2', 0, 3, 3, 0, 'web', ${Date.now()})`)

const nullRow = db
  .query("SELECT readiness FROM socratic_reasoning_step WHERE session_id = 'smoke-session' AND turn_index = 1")
  .get() as { readiness: string | null } | undefined

if (nullRow?.readiness !== null) {
  console.error(`FAIL: null readiness expected, got ${JSON.stringify(nullRow)}`)
  process.exit(1)
}

console.log("OK: readiness round-trip + NULL back-compat verified")

db.close()
for (const p of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) {
  if (existsSync(p)) unlinkSync(p)
}

console.log("OK: migration smoke test passed")
