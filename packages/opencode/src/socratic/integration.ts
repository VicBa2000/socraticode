/**
 * Integration module for SocraticCode.
 *
 * Bridge between the socratic modules and the OpenCode agent loop.
 * Provides functions to:
 *   - Build socratic system prompt sections for injection into LLM calls
 *   - Parse HINT_META from assistant responses
 *   - Manage per-session socratic state
 */

import { SocraticDB } from "./db"
import { Calibration } from "./calibration"
import { Levels, type Levels as LevelsNS } from "./levels"
import { Hints, type Hints as HintsNS } from "./hints"
import { SocraticPrompt } from "./prompt"
import { Accompaniment } from "./accompaniment"
import { Detector } from "./detector"
import { AntiAdulation } from "./antiadulation"
import { Interceptor } from "./interceptor"
import { Profile } from "./profile"
import { Tracking } from "./tracking"
import { Review } from "./review"
import { Prerequisites } from "./prerequisites"
import { Feynman } from "./feynman"
import { Journal } from "./journal"
import { Antipatterns } from "./antipatterns"
import { Capability } from "./capability"
import { TextTools } from "./text-tools"
import { Budget } from "./budget"
import { Prewarm } from "./prewarm"
import type { Taxonomy } from "./taxonomy"
import type { Modes as ModesNS } from "./modes"

export namespace SocraticIntegration {
  // ── Per-Session State (in-memory, not persisted) ─────────

  interface SessionState {
    hintState: HintsNS.HintState
    accompanimentState: Accompaniment.AccompanimentState
    consecutivePressure: number
    challengeActive: boolean
    lastMessageLength: number
    turnCount: number
    correctCount: number
    incorrectCount: number
    zeroKnowledgeCount: number
    currentDomain: Taxonomy.DomainKey | null
    activeReview: Review.ReviewCandidate | null
    reviewInjected: boolean
    pendingPrereqGap: Prerequisites.Gap | null
    prereqGapsSurfaced: Set<string>
    feynman: Feynman.FeynmanState
    lastUserMessage: string
    lastErrorClass: string | null
    /**
     * When set, the next buildSystemPrompt injects an anti-adulation
     * one-shot directive and clears this flag. Triggered when the upgrade
     * signals fire (regardless of whether the quality filters pass) — this
     * is the window where model optimism translates into false promotion.
     */
    preUpgradeGuardNextTurn: boolean
  }

  const sessionStates = new Map<string, SessionState>()

  function getSessionState(sessionID: string, userLevel: LevelsNS.UserLevel): SessionState {
    let state = sessionStates.get(sessionID)
    if (!state) {
      state = {
        hintState: Hints.createInitialState(userLevel),
        accompanimentState: Accompaniment.createIdleState(),
        consecutivePressure: 0,
        challengeActive: false,
        lastMessageLength: 0,
        turnCount: 0,
        correctCount: 0,
        incorrectCount: 0,
        zeroKnowledgeCount: 0,
        currentDomain: null,
        activeReview: null,
        reviewInjected: false,
        pendingPrereqGap: null,
        prereqGapsSurfaced: new Set<string>(),
        feynman: Feynman.createIdle(),
        lastUserMessage: "",
        lastErrorClass: null,
        preUpgradeGuardNextTurn: false,
      }
      sessionStates.set(sessionID, state)

      // Initialize tracking for this new session
      try {
        const profile = SocraticDB.getProfile()
        const mode = (profile?.preferred_mode as string) ?? "learn"
        Tracking.startSession(sessionID, userLevel, mode)
        Profile.updateStreak()
        Profile.incrementSessionCount()
        Calibration.incrementOverrideCounter()
      } catch {
        // Don't crash if tracking init fails
      }

      // Pick one spaced-repetition candidate for this session (max 1 per session)
      try {
        state.activeReview = Review.getReviewCandidate()
      } catch {
        state.activeReview = null
      }

      // Consume any /teach queued before this session existed.
      try {
        const queuedTopic = Feynman.consumeQueued()
        if (queuedTopic) {
          state.feynman = Feynman.createState(queuedTopic)
        }
      } catch {
        // Non-critical
      }
    }
    return state
  }

  /**
   * Clean up session state when a session ends.
   * Finalizes tracking and updates profile with concepts learned.
   */
  export function cleanupSession(sessionID: string): void {
    try {
      const summary = Tracking.endSession(sessionID)
      if (summary) {
        if (summary.conceptsLearned.length > 0) {
          Profile.addConceptsLearned(summary.conceptsLearned.length)
        }
        // Persist a journal entry so /journal can show progress over time.
        try {
          Journal.saveFromSummary(summary)
        } catch {
          // Non-critical
        }
      }
    } catch {
      // Non-critical
    }
    sessionStates.delete(sessionID)
  }

  // ── System Prompt Building ───────────────────────────────

  /**
   * Build the socratic system prompt sections for injection into the LLM call.
   * This is the main entry point called from the agent loop.
   *
   * Returns an array of prompt strings, or empty array if socratic system is disabled
   * (e.g., user hasn't calibrated yet and this isn't a calibration turn).
   */
  /**
   * Minimal tool descriptor for text-mode harness. Keep this tiny — it's all
   * we need to teach a small model how to invoke a tool. Callers pass
   * {name, description} pairs extracted from whatever tool registry they use.
   */
  export interface ToolDescriptor {
    name: string
    description: string
    paramsHint?: string
  }

  export function buildSystemPrompt(
    sessionID: string,
    modelID?: string,
    tools?: ToolDescriptor[],
  ): string[] {
    try {
      const profile = SocraticDB.getProfile()

      // If no profile yet, don't inject socratic prompts
      // (calibration will be handled separately)
      if (!profile || !profile.calibration_completed) {
        return []
      }

      const globalLevel = Levels.clampLevel(profile.global_level)
      const mode = (profile.preferred_mode as ModesNS.Mode) ?? "learn"
      const state = getSessionState(sessionID, globalLevel)
      const capability = Capability.detectCapability(modelID)

      // Feynman teach-mode fully replaces the adaptive mentor prompts with the
      // student persona. All other socratic injections are skipped while it's
      // active — role coherence matters more than perfect tracking.
      if (state.feynman.active) {
        return [Feynman.buildPrompt(state.feynman)]
      }

      // Get weaknesses and strengths
      const weaknesses = SocraticDB.getTopWeaknesses(5).map((w) => ({
        topic: w.topic,
        domain: w.domain,
      }))
      const strengths = SocraticDB.getTopStrengths(5).map((s) => ({
        topic: s.topic,
        domain: s.domain,
      }))

      // Build prompt context
      const ctx: SocraticPrompt.PromptContext = {
        userLevel: globalLevel,
        mode,
        hintLevel: state.hintState.currentLevel,
        domain: state.currentDomain,
        comprehensionSpeed: profile.comprehension_speed,
        copyTendency: profile.copy_tendency,
        weaknesses,
        strengths,
        accompanimentState: state.accompanimentState,
        challengeActive: state.challengeActive,
        pressureDetected: state.consecutivePressure > 0,
        consecutivePressure: state.consecutivePressure,
        capability,
      }

      const sections = SocraticPrompt.build(ctx)

      // Add profile-based directives
      try {
        const profileSnapshot = Profile.load()
        if (profileSnapshot) {
          const profileDirectives = Profile.getDirectives(profileSnapshot)
          if (profileDirectives.length > 0) {
            sections.push(
              "── PROFILE DIRECTIVES ──\n" + profileDirectives.join("\n"),
            )
          }
        }
      } catch {
        // Profile directives are non-critical
      }

      // Add progression context (anti-cycling)
      try {
        const progression = Tracking.buildProgressionContext(sessionID)
        if (progression && progression.totalTurns >= 2) {
          sections.push(progression.directive)
        }
      } catch {
        // Non-critical
      }

      // Add tool interception directive if applicable
      const toolDirective = Interceptor.getSessionDirective(globalLevel, mode)
      if (toolDirective) {
        sections.push(toolDirective)
      }

      // Pre-upgrade anti-adulation guard (one-shot). Clear the flag after
      // consuming it so the next turn doesn't re-inject unless a new upgrade
      // evaluation re-arms it.
      if (state.preUpgradeGuardNextTurn) {
        sections.push(AntiAdulation.getPreUpgradeGuardDirective())
        state.preUpgradeGuardNextTurn = false
      }

      // Spaced-repetition review: inject only on the first turn of the session.
      if (state.activeReview && !state.reviewInjected) {
        sections.push(Review.buildReviewPrompt(state.activeReview, globalLevel))
        state.reviewInjected = true
      }

      // Personal anti-patterns: add "WATCH FOR" if any are active.
      try {
        const antiDirective = Antipatterns.buildDirective()
        if (antiDirective) sections.push(antiDirective)
      } catch {
        // Non-critical
      }

      // Text-mode tool harness for small local models (Phase 12a/12d).
      // Auto-activates when capability=lite AND the model lacks native
      // tool-call support. Strong cloud flows are untouched — their tools
      // continue through the AI SDK native path.
      if (capability === "lite" && tools && tools.length > 0) {
        const info = Capability.getModelInfo(modelID)
        if (!info.nativeToolSupport) {
          const directive = TextTools.buildDirective(
            tools.map((t) => ({
              name: t.name,
              description: t.description,
              paramsHint: t.paramsHint,
            })),
          )
          if (directive) sections.push(directive)
        }
      }

      return sections
    } catch {
      // If DB isn't available yet, don't crash — just skip socratic prompts
      return []
    }
  }

  // ── Lite-tool-mode decision (Phase 12d) ──────────────────

  /**
   * Whether the active model needs the text-tool harness (small local
   * without native OpenAI-style tool_calls). When true, callers should:
   *   - Strip the AI SDK tool schemas (pass tools={} to the SDK)
   *   - Rely on the markdown tool list injected by buildSystemPrompt
   *   - Parse <tool-call> blocks from the response post-generation
   */
  export function shouldUseLiteToolMode(modelID: string | undefined): boolean {
    const info = Capability.getModelInfo(modelID)
    return info.tier === "lite" && !info.nativeToolSupport
  }

  // ── Context budget helper (Phase 12a) ────────────────────

  /**
   * Compute context budget for the current model and return a trim plan
   * for a conversation. Safe to call for any model — on strong cloud
   * models the budget is huge and this is effectively a no-op.
   *
   * Used by the agent loop before sending messages to the LLM.
   */
  export function planBudget(
    modelID: string | undefined,
    systemText: string,
    toolSchemaText: string,
    messages: Array<{ role: string; content: string; pinned?: boolean }>,
  ): {
    budget: Budget.BudgetResult
    trim: Budget.TrimResult<{ role: string; content: string; pinned?: boolean }>
    warning: string | null
  } {
    const info = Capability.getModelInfo(modelID)
    const budget = Budget.computeBudget({
      contextTokens: info.contextTokens,
      systemTokens: Budget.estimateTokens(systemText),
      toolSchemaTokens: Budget.estimateTokens(toolSchemaText),
    })
    const trim = Budget.trimHistory(messages, Math.max(0, budget.availableForHistory))
    return { budget, trim, warning: Budget.warningFor(trim) }
  }

  // ── Prewarm helper (Phase 12b) ───────────────────────────

  /**
   * Fire-and-forget pre-warm of the active Ollama model at TUI startup.
   * Reads the config directly so it can run before the server boots.
   *
   * Silently no-ops for cloud models. Never throws.
   */
  export async function prewarmActiveModel(opts: {
    baseURL: string
    modelID: string
    apiKey?: string
  }): Promise<Prewarm.PrewarmResult> {
    return Prewarm.prewarm(opts)
  }

  // ── Pre-LLM: Analyze User Message ───────────────────────

  /**
   * Analyze a user message before the LLM processes it.
   * Updates session state with detected signals.
   * Returns any additional system prompt sections needed.
   */
  export function analyzeUserMessage(
    sessionID: string,
    messageText: string,
  ): string[] {
    try {
      const profile = SocraticDB.getProfile()
      if (!profile || !profile.calibration_completed) return []

      const globalLevel = Levels.clampLevel(profile.global_level)
      const state = getSessionState(sessionID, globalLevel)

      // In Feynman mode, just record the explanation turn and skip the
      // calibration/pressure/copy detectors — they'd misfire on a teacher.
      if (state.feynman.active) {
        Feynman.recordTurn(state.feynman, messageText)
        state.lastMessageLength = messageText.length
        state.lastUserMessage = messageText
        state.turnCount++
        return []
      }

      // Keep the raw message so processResponseMeta can run antipattern
      // heuristics when the LLM flags the turn as incorrect.
      state.lastUserMessage = messageText

      // Analyze the message
      const analysis = Calibration.analyzeTurn(
        messageText,
        state.lastMessageLength,
        globalLevel,
      )

      // Update session state
      state.lastMessageLength = messageText.length
      state.turnCount++

      if (analysis.domain) {
        state.currentDomain = analysis.domain
      }

      if (analysis.zeroKnowledgeCount > 0) {
        state.zeroKnowledgeCount += analysis.zeroKnowledgeCount
        state.hintState = Hints.processResponse(state.hintState, false, true)
      }

      if (analysis.slowDownRequested) {
        state.hintState = Hints.processResponse(state.hintState, false, false)
        state.hintState = Hints.processResponse(state.hintState, false, false)
      }

      // Pressure detection
      const pressure = AntiAdulation.detectPressure(messageText)
      if (pressure.detected) {
        state.consecutivePressure++
      } else {
        state.consecutivePressure = 0
      }

      // Copy-paste detection
      if (analysis.copyPasteDetected) {
        const newTendency = Levels.updateCopyTendency(profile.copy_tendency, true)
        SocraticDB.updateProfile({ copy_tendency: newTendency })
      }

      const extra: string[] = []

      // If copy suspected, add deepening directive
      const copyScore = AntiAdulation.scoreResponse(messageText)
      if (copyScore.suspicious && copyScore.deepenTactic) {
        extra.push(
          `SUSPECTED COPIED RESPONSE DETECTED.\n${copyScore.deepenTactic}`,
        )
      }

      // Check for prior struggles with detected domain
      if (analysis.domain) {
        try {
          const priorMsg = Tracking.getPriorStrugglesMessage(analysis.domain, analysis.domain)
          if (priorMsg) {
            extra.push(priorMsg)
          }
        } catch {
          // Non-critical
        }
      }

      // Prerequisite gap enforcement — skipped for advanced/expert users.
      if (Prerequisites.shouldEnforce(globalLevel)) {
        try {
          const topic = Prerequisites.detectTopic(messageText)
          if (topic) {
            const gap = Prerequisites.findGap(topic)
            if (gap) {
              const gapKey = `${gap.targetTopic}->${gap.missingPrereq}`
              if (!state.prereqGapsSurfaced.has(gapKey)) {
                state.prereqGapsSurfaced.add(gapKey)
                state.pendingPrereqGap = gap
                extra.push(Prerequisites.buildGapDirective(gap, globalLevel))
              }
            }
          }
        } catch {
          // Non-critical
        }
      }

      return extra
    } catch {
      return []
    }
  }

  // ── Post-LLM: Parse Metadata ─────────────────────────────

  export interface HintMeta {
    correct: boolean | null
    topic: string
    domain: string
    level: string
    /**
     * Model's read of whether the user performed above, at, or below their
     * current level this turn. Optional — omitted or null if the model cannot
     * judge. Feeds into the upgrade weighted-avg filter.
     */
    readiness?: "above" | "at" | "below" | null
  }

  const HINT_META_REGEX = /\[HINT_META:\{.*?\}\]\s*$/

  /**
   * Extract and strip HINT_META from an assistant response.
   * Returns the cleaned text and parsed metadata.
   */
  export function parseHintMeta(text: string): {
    cleanText: string
    meta: HintMeta | null
  } {
    const match = text.match(HINT_META_REGEX)
    if (!match) {
      return { cleanText: text, meta: null }
    }

    const cleanText = text.slice(0, match.index).trimEnd()
    try {
      const jsonStr = match[0].replace("[HINT_META:", "").replace("]", "")
      const meta = JSON.parse(jsonStr) as HintMeta
      return { cleanText, meta }
    } catch {
      return { cleanText, meta: null }
    }
  }

  /**
   * Process metadata from an assistant response.
   * Updates hint state, records errors/strengths, etc.
   */
  export function processResponseMeta(
    sessionID: string,
    meta: HintMeta,
  ): void {
    try {
      const profile = SocraticDB.getProfile()
      if (!profile) return

      const globalLevel = Levels.clampLevel(profile.global_level)
      const state = getSessionState(sessionID, globalLevel)

      // Update hint state
      if (meta.correct !== null) {
        state.hintState = Hints.processResponse(state.hintState, meta.correct, false)

        if (meta.correct) {
          state.correctCount++
          if (meta.topic && meta.domain) {
            SocraticDB.recordStrength(meta.topic, meta.domain)
          }
          // If there was a pending anti-pattern flag, count this success as a
          // correction toward deactivating that pattern.
          if (state.lastErrorClass) {
            try {
              Antipatterns.recordCorrection(state.lastErrorClass)
            } catch {
              // Non-critical
            }
            state.lastErrorClass = null
          }
          // If the user correctly answered the active spaced-repetition review,
          // mark that weakness resolved and close the review for this session.
          if (
            state.activeReview &&
            meta.topic &&
            meta.topic.toLowerCase() === state.activeReview.topic.toLowerCase()
          ) {
            Review.markResolved(state.activeReview.topic, state.activeReview.domain)
            state.activeReview = null
          }
          // Update comprehension speed
          SocraticDB.updateProfile({
            comprehension_speed: Levels.adjustComprehensionSpeed(
              profile.comprehension_speed,
              true,
            ),
          })
        } else {
          state.incorrectCount++
          if (meta.topic && meta.domain) {
            SocraticDB.recordError(meta.topic, meta.domain, state.hintState.currentLevel)
            Review.refreshSchedule(meta.topic, meta.domain)
          }
          // Scan the last user message for known error classes. If one matches,
          // record it — this may activate the antipattern after 3 occurrences.
          try {
            const cls = Antipatterns.detectErrorClass(state.lastUserMessage, meta.topic)
            if (cls) {
              Antipatterns.recordOccurrence(cls)
              state.lastErrorClass = cls.id
            }
          } catch {
            // Non-critical
          }
          SocraticDB.updateProfile({
            comprehension_speed: Levels.adjustComprehensionSpeed(
              profile.comprehension_speed,
              false,
            ),
          })
        }
      }

      // Record interest
      if (meta.topic) {
        SocraticDB.recordInterest(meta.topic)
      }

      // Record turn in tracking
      try {
        const readiness =
          meta.readiness === "above" || meta.readiness === "at" || meta.readiness === "below"
            ? meta.readiness
            : null
        Tracking.recordTurn({
          sessionId: sessionID,
          turnIndex: state.turnCount,
          topic: meta.topic || null,
          correct: meta.correct,
          hintLevel: state.hintState.currentLevel,
          userLevel: globalLevel,
          domain: (meta.domain as Taxonomy.DomainKey) || state.currentDomain,
          userExcerpt: null, // Filled by caller if available
          agentExcerpt: null, // Filled by caller if available
          accompaniedImpl: state.accompanimentState.phase !== "idle",
          readiness,
        })
      } catch {
        // Non-critical
      }

      // Check if level adjustment is needed (every 5 turns)
      if (state.turnCount % 5 === 0 && state.turnCount > 0) {
        const signals: Levels.AdjustmentSignals = {
          correctAnswers: state.correctCount,
          incorrectAnswers: state.incorrectCount,
          zeroKnowledgeSignals: state.zeroKnowledgeCount,
          technicalTermsUsed: false,
          proposedSolutionWithoutHelp: false,
          requestedSlowDown: false,
          copyPasteDetected: profile.copy_tendency > 0.5,
        }

        // Only adjust if no manual override is active
        if (!Calibration.isOverrideActive()) {
          const adjustment = Calibration.applyContinuousCalibration(signals, state.currentDomain)
          if (adjustment.changed && adjustment.reason) {
            Tracking.recordLevelChange(
              sessionID,
              state.turnCount,
              globalLevel,
              adjustment.newLevel,
              adjustment.reason,
            )
          }
          // Arm the one-shot anti-adulation guard whenever an upgrade is
          // being considered. Three triggers, ORed:
          //  (a) signals accumulated enough correct answers to be near the
          //      threshold — even if technicalTermsUsed is false and the
          //      simple path short-circuits before the filters fire.
          //  (b) the filter actually blocked an upgrade (we're close).
          //  (c) the upgrade actually committed — next turn gets a stricter
          //      re-grade right after level change.
          // Downgrades do not arm — we only guard against falsely lenient
          // promotions.
          const signalsNearThreshold =
            signals.correctAnswers >= 3 &&
            globalLevel < 5 &&
            !signals.copyPasteDetected
          const blockedUpgrade = adjustment.reason?.includes("upgrade blocked") ?? false
          const successfulUpgrade = adjustment.changed && adjustment.newLevel > globalLevel
          if (signalsNearThreshold || blockedUpgrade || successfulUpgrade) {
            state.preUpgradeGuardNextTurn = true
          }
        }

        // Reset counters after evaluation
        state.correctCount = 0
        state.incorrectCount = 0
        state.zeroKnowledgeCount = 0
      }
    } catch {
      // Silently fail — don't crash the agent loop
    }
  }

  // ── Calibration Check ────────────────────────────────────

  /**
   * Check if initial calibration is needed.
   * If so, return the calibration prompt to show the user.
   */
  export function getCalibrationPromptIfNeeded(): string | null {
    try {
      if (!Calibration.isCalibrated()) {
        return Calibration.getCalibrationPrompt()
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Try to parse a calibration response and complete calibration.
   * Returns true if calibration was completed.
   */
  export function tryCompleteCalibration(message: string): boolean {
    try {
      if (Calibration.isCalibrated()) return false

      const level = Calibration.parseCalibrationResponse(message)
      if (level === null) return false

      Calibration.completeInitialCalibration(level)
      return true
    } catch {
      return false
    }
  }

  // ── Feynman Teach Mode ───────────────────────────────────

  /**
   * Start Feynman teach-mode on a topic.
   * If a session already exists, activates immediately; otherwise queues it
   * so the next session to be created picks it up.
   */
  export function startTeach(sessionID: string | undefined, topic: string): void {
    if (sessionID && sessionStates.has(sessionID)) {
      const state = sessionStates.get(sessionID)!
      state.feynman = Feynman.createState(topic)
    } else {
      Feynman.queueTeach(topic)
    }
  }

  /**
   * End Feynman teach-mode and return the session summary.
   * Returns null if teach-mode wasn't active.
   */
  export function endTeach(sessionID: string | undefined): string | null {
    if (!sessionID) {
      // No session yet — just drop any queued teach.
      if (Feynman.hasQueued()) {
        Feynman.consumeQueued()
        return "Queued teach-mode cancelled."
      }
      return null
    }
    const state = sessionStates.get(sessionID)
    if (!state || !state.feynman.active) return null

    const profile = SocraticDB.getProfile()
    const level = Levels.clampLevel(profile?.global_level ?? 3)
    const summary = Feynman.summarize(state.feynman, level)
    state.feynman = Feynman.createIdle()
    return summary
  }

  export function isTeachActive(sessionID: string | undefined): boolean {
    if (!sessionID) return Feynman.hasQueued()
    const state = sessionStates.get(sessionID)
    return !!(state && state.feynman.active)
  }

  // ── Utilities ────────────────────────────────────────────

  /**
   * Get the current effective level for display in the UI.
   */
  export function getCurrentLevel(sessionID: string): {
    level: LevelsNS.UserLevel
    name: string
    mode: ModesNS.Mode
  } | null {
    try {
      const profile = SocraticDB.getProfile()
      if (!profile || !profile.calibration_completed) return null

      const level = Levels.clampLevel(profile.global_level)
      const levelProfile = Levels.getProfile(level)
      return {
        level,
        name: levelProfile.label,
        mode: (profile.preferred_mode as ModesNS.Mode) ?? "learn",
      }
    } catch {
      return null
    }
  }
}
