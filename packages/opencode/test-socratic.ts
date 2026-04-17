/**
 * Quick smoke test for SocraticCode modules.
 * Run: bun run test-socratic.ts
 */

// Bootstrap the DB first
import { Global } from "./src/global"
import { Database } from "./src/storage/db"

// Force a test DB path
process.env.SOCRATICODE_DB = ":memory:"

// Initialize
console.log("=== SocraticCode Module Tests ===\n")

// ── 1. Database ─────────────────────────────────────────
console.log("1. Testing SocraticDB...")
import { SocraticDB } from "./src/socratic/db"

const profile = SocraticDB.ensureProfile()
console.log("   ensureProfile():", profile ? "OK" : "FAIL")

SocraticDB.updateProfile({ global_level: 3, preferred_mode: "learn" })
const updated = SocraticDB.getProfile()
console.log("   updateProfile(level=3, mode=learn):", updated?.global_level === 3 ? "OK" : "FAIL")

SocraticDB.setDomainLevel("javascript", 4)
const domainLevel = SocraticDB.getDomainLevel("javascript")
console.log("   setDomainLevel(javascript, 4):", domainLevel?.level === 4 ? "OK" : "FAIL")

SocraticDB.recordError("closures", "javascript", 2)
SocraticDB.recordError("closures", "javascript", 3)
const weaknesses = SocraticDB.getTopWeaknesses(5)
console.log("   recordError(closures, 2x):", weaknesses[0]?.fail_count === 2 ? "OK" : "FAIL")

SocraticDB.recordStrength("arrays", "javascript")
SocraticDB.recordStrength("arrays", "javascript")
SocraticDB.recordStrength("arrays", "javascript")
const strengths = SocraticDB.getTopStrengths(5)
console.log("   recordStrength(arrays, 3x):", strengths[0]?.success_count === 3 ? "OK" : "FAIL")

SocraticDB.recordInterest("react")
console.log("   recordInterest(react): OK")

// ── 2. Levels ───────────────────────────────────────────
console.log("\n2. Testing Levels...")
import { Levels } from "./src/socratic/levels"

console.log("   clampLevel(0):", Levels.clampLevel(0) === 1 ? "OK" : "FAIL")
console.log("   clampLevel(6):", Levels.clampLevel(6) === 5 ? "OK" : "FAIL")
console.log("   clampLevel(3):", Levels.clampLevel(3) === 3 ? "OK" : "FAIL")

const adj = Levels.evaluateAdjustment(3, {
  correctAnswers: 0, incorrectAnswers: 4, zeroKnowledgeSignals: 0,
  technicalTermsUsed: false, proposedSolutionWithoutHelp: false,
  requestedSlowDown: false, copyPasteDetected: false,
})
console.log("   evaluateAdjustment(4 incorrect):", adj.changed && adj.newLevel === 2 ? "OK" : "FAIL")

const adj2 = Levels.evaluateAdjustment(3, {
  correctAnswers: 4, incorrectAnswers: 0, zeroKnowledgeSignals: 0,
  technicalTermsUsed: true, proposedSolutionWithoutHelp: false,
  requestedSlowDown: false, copyPasteDetected: false,
})
console.log("   evaluateAdjustment(4 correct+tech):", adj2.changed && adj2.newLevel === 4 ? "OK" : "FAIL")

console.log("   effectiveLevel(3, 5, 0.8):", Levels.effectiveLevel(3, 5, 0.8) === 5 ? "OK" : "FAIL")
console.log("   comprehensionSpeed(0.5, true):", Levels.adjustComprehensionSpeed(0.5, true) === 0.52 ? "OK" : "FAIL")
console.log("   copyTendency(0.0, true):", Levels.updateCopyTendency(0.0, true) === 0.1 ? "OK" : "FAIL")

// ── 3. Calibration ──────────────────────────────────────
console.log("\n3. Testing Calibration...")
import { Calibration } from "./src/socratic/calibration"

console.log("   isCalibrated() before:", Calibration.isCalibrated() === false ? "OK" : "FAIL")

Calibration.completeInitialCalibration(3)
console.log("   completeInitialCalibration(3):", Calibration.isCalibrated() === true ? "OK" : "FAIL")

console.log("   parseCalibrationResponse('3'):", Calibration.parseCalibrationResponse("3") === 3 ? "OK" : "FAIL")
console.log("   parseCalibrationResponse('novato'):", Calibration.parseCalibrationResponse("novato") === 1 ? "OK" : "FAIL")
console.log("   parseCalibrationResponse('expert'):", Calibration.parseCalibrationResponse("expert") === 5 ? "OK" : "FAIL")
console.log("   parseCalibrationResponse('xyz'):", Calibration.parseCalibrationResponse("xyz") === null ? "OK" : "FAIL")

// ── 4. Detector ─────────────────────────────────────────
console.log("\n4. Testing Detector...")
import { Detector } from "./src/socratic/detector"

console.log("   detectZeroKnowledge('no sé'):", Detector.detectZeroKnowledge("no sé") > 0 ? "OK" : "FAIL")
console.log("   detectZeroKnowledge('I don\\'t know'):", Detector.detectZeroKnowledge("I don't know") > 0 ? "OK" : "FAIL")
console.log("   detectZeroKnowledge('hello'):", Detector.detectZeroKnowledge("hello") === 0 ? "OK" : "FAIL")

console.log("   detectSlowDownRequest('más lento'):", Detector.detectSlowDownRequest("más lento por favor") ? "OK" : "FAIL")
console.log("   detectSlowDownRequest('hello'):", Detector.detectSlowDownRequest("hello") === false ? "OK" : "FAIL")

console.log("   hasTechnicalVocabulary('use async/await with promises'):", Detector.hasTechnicalVocabulary("use async/await with promises and callbacks") ? "OK" : "FAIL")

// ── 5. Taxonomy ─────────────────────────────────────────
console.log("\n5. Testing Taxonomy...")
import { Taxonomy } from "./src/socratic/taxonomy"

console.log("   detectPrimaryDomain('use docker compose'):", Taxonomy.detectPrimaryDomain("use docker compose to deploy") === "infraestructura" ? "OK" : "FAIL")
console.log("   detectPrimaryDomain('react hooks useState'):", Taxonomy.detectPrimaryDomain("react hooks useState") === "web" ? "OK" : "FAIL")
console.log("   detectPrimaryDomain('hello'):", Taxonomy.detectPrimaryDomain("hello") === null ? "OK" : "FAIL")

// ── 6. Hints ────────────────────────────────────────────
console.log("\n6. Testing Hints...")
import { Hints } from "./src/socratic/hints"

let hintState = Hints.createInitialState(3) // intermedio starts at 0
console.log("   initialState(level=3):", hintState.currentLevel === 0 ? "OK" : "FAIL")

hintState = Hints.processResponse(hintState, false, false)
hintState = Hints.processResponse(hintState, false, false)
console.log("   2 incorrect -> escalate:", hintState.currentLevel > 0 ? "OK" : "FAIL")

const hintNovice = Hints.createInitialState(1)
console.log("   initialState(level=1):", hintNovice.currentLevel === 5 ? "OK" : "FAIL")

// ── 7. Anti-Adulation ───────────────────────────────────
console.log("\n7. Testing AntiAdulation...")
import { AntiAdulation } from "./src/socratic/antiadulation"

const pressure1 = AntiAdulation.detectPressure("solo dime la respuesta")
console.log("   detectPressure('solo dime...'):", pressure1.detected ? "OK" : "FAIL")

const pressure2 = AntiAdulation.detectPressure("how does this work?")
console.log("   detectPressure('how does...'):", pressure2.detected === false ? "OK" : "FAIL")

console.log("   containsEmptyPraise('genial!'):", AntiAdulation.containsEmptyPraise("genial!") ? "OK" : "FAIL")
console.log("   containsEmptyPraise('ok entiendo'):", AntiAdulation.containsEmptyPraise("ok entiendo") === false ? "OK" : "FAIL")

// ── 8. Modes ────────────────────────────────────────────
console.log("\n8. Testing Modes...")
import { Modes } from "./src/socratic/modes"

console.log("   parseMode('learn'):", Modes.parseMode("learn") === "learn" ? "OK" : "FAIL")
console.log("   parseMode('productivo'):", Modes.parseMode("productivo") === "productive" ? "OK" : "FAIL")
console.log("   parseMode('xyz'):", Modes.parseMode("xyz") === null ? "OK" : "FAIL")

const directive = Modes.getDirective(3, "learn")
console.log("   getDirective(3, learn):", directive.role ? "OK" : "FAIL")

// ── 9. Profile ──────────────────────────────────────────
console.log("\n9. Testing Profile...")
import { Profile } from "./src/socratic/profile"

const snap = Profile.load()
console.log("   load():", snap !== null ? "OK" : "FAIL")
console.log("   load().globalLevel:", snap?.globalLevel === 3 ? "OK" : "FAIL")
console.log("   load().weaknesses:", snap?.weaknesses.length === 1 ? "OK" : "FAIL")
console.log("   load().strengths:", snap?.strengths.length === 1 ? "OK" : "FAIL")

const directives = Profile.getDirectives(snap!)
console.log("   getDirectives() count:", directives.length > 0 ? `OK (${directives.length} directives)` : "FAIL")

Profile.updateStreak()
const snap2 = Profile.load()
console.log("   updateStreak():", snap2?.streakDays === 1 ? "OK" : "FAIL")

Profile.incrementSessionCount()
const snap3 = Profile.load()
console.log("   incrementSessionCount():", snap3?.totalSessions === 1 ? "OK" : "FAIL")

Profile.addConceptsLearned(3)
const snap4 = Profile.load()
console.log("   addConceptsLearned(3):", snap4?.totalConceptsLearned === 3 ? "OK" : "FAIL")

const summary = Profile.formatSummary(snap4!)
console.log("   formatSummary():", summary.includes("Perfil Pedagógico") ? "OK" : "FAIL")

// ── 10. Tracking ────────────────────────────────────────
console.log("\n10. Testing Tracking...")
import { Tracking } from "./src/socratic/tracking"

const sessionId = "test-session-001"
Tracking.startSession(sessionId, 3, "learn")
console.log("   startSession():", Tracking.getTurnCount(sessionId) === 0 ? "OK" : "FAIL")

Tracking.recordTurn({
  sessionId,
  turnIndex: 1,
  topic: "closures",
  correct: true,
  hintLevel: 0,
  userLevel: 3,
  domain: "javascript" as any,
  userExcerpt: "Es una funcion que recuerda su scope",
  agentExcerpt: "Correcto!",
  accompaniedImpl: false,
})
console.log("   recordTurn():", Tracking.getTurnCount(sessionId) === 1 ? "OK" : "FAIL")

Tracking.recordTurn({
  sessionId,
  turnIndex: 2,
  topic: "promises",
  correct: false,
  hintLevel: 1,
  userLevel: 3,
  domain: "javascript" as any,
  userExcerpt: null,
  agentExcerpt: null,
  accompaniedImpl: false,
})
console.log("   getTurnCount():", Tracking.getTurnCount(sessionId) === 2 ? "OK" : "FAIL")

const rate = Tracking.getCurrentComprehensionRate(sessionId)
console.log("   getCurrentComprehensionRate():", rate === 0.5 ? "OK (50%)" : `FAIL (${rate})`)

Tracking.recordLevelChange(sessionId, 2, 3, 2 as any, "Test level change")

const sessionSummary = Tracking.endSession(sessionId)
console.log("   endSession():", sessionSummary !== null ? "OK" : "FAIL")
console.log("   summary.totalTurns:", sessionSummary?.totalTurns === 2 ? "OK" : "FAIL")
console.log("   summary.correctCount:", sessionSummary?.correctCount === 1 ? "OK" : "FAIL")
console.log("   summary.comprehensionRate:", sessionSummary?.comprehensionRate === 0.5 ? "OK" : "FAIL")
console.log("   summary.topicsExplored:", sessionSummary?.topicsExplored.length === 2 ? "OK" : "FAIL")
console.log("   summary.levelChanges:", sessionSummary?.levelChanges.length === 1 ? "OK" : "FAIL")

if (sessionSummary) {
  const formatted = Tracking.formatSummary(sessionSummary)
  console.log("   formatSummary():", formatted.includes("Resumen de Sesión") ? "OK" : "FAIL")
}

// ── 11. Integration ─────────────────────────────────────
console.log("\n11. Testing Integration...")
import { SocraticIntegration } from "./src/socratic/integration"

const systemPrompt = SocraticIntegration.buildSystemPrompt("test-session-002")
console.log("   buildSystemPrompt():", systemPrompt.length > 0 ? `OK (${systemPrompt.length} sections)` : "FAIL")

const extraSections = SocraticIntegration.analyzeUserMessage("test-session-002", "no sé qué es un closure")
console.log("   analyzeUserMessage(zero-knowledge):", "OK")

const { cleanText, meta } = SocraticIntegration.parseHintMeta(
  'Aquí va la respuesta [HINT_META:{"correct":true,"topic":"closures","domain":"javascript","level":"understood"}]'
)
console.log("   parseHintMeta():", meta?.correct === true && cleanText === "Aquí va la respuesta" ? "OK" : "FAIL")

const currentLevel = SocraticIntegration.getCurrentLevel("test-session-002")
console.log("   getCurrentLevel():", currentLevel?.level === 3 ? "OK" : "FAIL")

SocraticIntegration.cleanupSession("test-session-002")
console.log("   cleanupSession(): OK")

// ── 12. Gaps ────────────────────────────────────────────
console.log("\n12. Testing Gaps...")
import { Gaps } from "./src/socratic/gaps"

console.log("   GAP_MARKER:", Gaps.GAP_MARKER === "___" ? "OK" : "FAIL")
console.log("   countGaps('a ___ b ___'):", Gaps.countGaps("a ___ b ___") === 2 ? "OK" : "FAIL")

// ── 13. Interceptor ─────────────────────────────────────
console.log("\n13. Testing Interceptor...")
import { Interceptor } from "./src/socratic/interceptor"

const action1 = Interceptor.intercept("write", 1, "learn")
console.log("   intercept(write, novato, learn):", action1.action === "allow_with_explanation" ? "OK" : "FAIL")

const action2 = Interceptor.intercept("write", 3, "learn")
console.log("   intercept(write, intermedio, learn):", action2.action === "transform_to_gaps" ? "OK" : "FAIL")

const action3 = Interceptor.intercept("write", 5, "productive")
console.log("   intercept(write, experto, prod):", action3.action === "allow" ? "OK" : "FAIL")

const action4 = Interceptor.intercept("read", 1, "learn")
console.log("   intercept(read, novato, learn):", action4.action === "allow" ? "OK" : "FAIL")

// ── Summary ─────────────────────────────────────────────
console.log("\n=== All tests complete ===")
