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
