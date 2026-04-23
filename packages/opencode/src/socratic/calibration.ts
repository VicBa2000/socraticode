/**
 * Calibration system for SocraticCode.
 *
 * Handles:
 * - Initial calibration: user selects their global level on first use
 * - Domain calibration: when a new domain is detected, calibrate for it
 * - Continuous calibration: adjust levels based on ongoing signals
 */

import { SocraticDB } from "./db"
import { Levels, type Levels as LevelsNS } from "./levels"
import { Detector } from "./detector"
import { Taxonomy } from "./taxonomy"

export namespace Calibration {
  // ── Types ────────────────────────────────────────────────

  export interface CalibrationState {
    isCalibrated: boolean
    globalLevel: LevelsNS.UserLevel
    currentDomain: Taxonomy.DomainKey | null
    domainLevel: LevelsNS.UserLevel | null
    effectiveLevel: LevelsNS.UserLevel
    mode: "learn" | "productive"
  }

  export interface TurnAnalysis {
    zeroKnowledgeCount: number
    slowDownRequested: boolean
    copyPasteDetected: boolean
    technicalTermsUsed: boolean
    domain: Taxonomy.DomainKey | null
  }

  // ── Initial Calibration ──────────────────────────────────

  /**
   * Check if the user has completed initial calibration.
   */
  export function isCalibrated(): boolean {
    const profile = SocraticDB.getProfile()
    return profile !== null && profile.calibration_completed === 1
  }

  /**
   * Complete initial calibration with user's chosen level.
   */
  export function completeInitialCalibration(level: LevelsNS.UserLevel): void {
    SocraticDB.ensureProfile()
    SocraticDB.updateProfile({
      global_level: level,
      calibration_completed: 1,
    })
  }

  /**
   * Get the welcome message for initial calibration.
   * This is shown before the user's first interaction.
   */
  export function getCalibrationPrompt(): string {
    return [
      "Welcome to SocraticCode! 🎓",
      "",
      "To adapt my teaching style, I need to know your programming experience level.",
      "",
      "Pick the one that best describes you:",
      "",
      "  1. **Novice** — I'm just starting to program. I need detailed explanations.",
      "  2. **Basic** — I know the fundamentals but need frequent guidance.",
      "  3. **Intermediate** — I program regularly. I can solve problems with some help.",
      "  4. **Advanced** — I have solid experience. I prefer code review and challenges.",
      "  5. **Expert** — I master multiple technologies. I just need a silent colleague.",
      "",
      'Reply with the number (1-5) or the level name.',
    ].join("\n")
  }

  /**
   * Parse the user's calibration response.
   * Returns the level if valid, null otherwise.
   */
  export function parseCalibrationResponse(message: string): LevelsNS.UserLevel | null {
    const trimmed = message.trim().toLowerCase()

    // Direct number
    const num = parseInt(trimmed, 10)
    if (Levels.isValidLevel(num)) return num

    // Level name
    const nameMap: Record<string, LevelsNS.UserLevel> = {
      novato: 1,
      "noob": 1,
      "principiante": 1,
      "beginner": 1,
      basico: 2,
      "básico": 2,
      "basic": 2,
      intermedio: 3,
      "intermediate": 3,
      avanzado: 4,
      "advanced": 4,
      experto: 5,
      "expert": 5,
      "pro": 5,
    }

    for (const [key, level] of Object.entries(nameMap)) {
      if (trimmed.includes(key)) return level
    }

    return null
  }

  // ── Domain Calibration ───────────────────────────────────

  /**
   * Get the current calibration state for a given message.
   * Detects the domain, resolves effective level, and returns full state.
   */
  export function getState(message: string): CalibrationState {
    const profile = SocraticDB.ensureProfile()
    const globalLevel = Levels.clampLevel(profile.global_level)
    const domain = Taxonomy.detectPrimaryDomain(message)

    let domainLevel: LevelsNS.UserLevel | null = null
    let effective = globalLevel

    if (domain) {
      const domainData = SocraticDB.getDomainLevel(domain)
      if (domainData) {
        domainLevel = Levels.clampLevel(domainData.level)
        effective = Levels.effectiveLevel(
          globalLevel,
          domainData.level,
          domainData.confidence,
        )
      }
    }

    return {
      isCalibrated: profile.calibration_completed === 1,
      globalLevel,
      currentDomain: domain,
      domainLevel,
      effectiveLevel: effective,
      mode: (profile.preferred_mode as "learn" | "productive") ?? "learn",
    }
  }

  /**
   * Get the calibration question for a new domain.
   */
  export function getDomainCalibrationPrompt(domain: Taxonomy.DomainKey): string {
    const info = Taxonomy.DOMAINS[domain]
    return `We're going to work with **${info.label}**. How well do you know this topic? (1-5, or describe your experience)`
  }

  /**
   * Check if a domain needs calibration (never seen before).
   */
  export function domainNeedsCalibration(domain: Taxonomy.DomainKey): boolean {
    const domainData = SocraticDB.getDomainLevel(domain)
    return domainData === null
  }

  /**
   * Calibrate a specific domain with a level.
   */
  export function calibrateDomain(domain: Taxonomy.DomainKey, level: LevelsNS.UserLevel): void {
    SocraticDB.setDomainLevel(domain, level)
  }

  // ── Continuous Calibration ───────────────────────────────

  /**
   * Analyze a user message for calibration signals.
   */
  export function analyzeTurn(
    message: string,
    previousMessageLength: number,
    currentLevel: number,
  ): TurnAnalysis {
    return {
      zeroKnowledgeCount: Detector.detectZeroKnowledge(message),
      slowDownRequested: Detector.detectSlowDownRequest(message),
      copyPasteDetected: Detector.detectCopyPaste(message, currentLevel, previousMessageLength).isCopy,
      technicalTermsUsed: Detector.hasTechnicalVocabulary(message),
      domain: Taxonomy.detectPrimaryDomain(message),
    }
  }

  /**
   * Apply continuous calibration based on accumulated session signals.
   * Called periodically (e.g., every N turns) to evaluate level adjustment.
   *
   * Returns the adjustment result and updates DB if a change occurs.
   */
  export function applyContinuousCalibration(
    signals: Levels.AdjustmentSignals,
    domain: Taxonomy.DomainKey | null,
  ): Levels.AdjustmentResult {
    const profile = SocraticDB.ensureProfile()

    // Determine which level to evaluate: domain-specific or global
    let currentLevel: number
    if (domain) {
      const domainData = SocraticDB.getDomainLevel(domain)
      currentLevel = domainData?.level ?? profile.global_level
    } else {
      currentLevel = profile.global_level
    }

    const rawResult = Levels.evaluateAdjustment(currentLevel, signals)

    // Apply upgrade quality filters (weighted avg + topic diversity + depth
    // diversity). Only gates upgrades — downgrades pass through unchanged.
    let result = rawResult
    if (rawResult.changed && rawResult.newLevel > currentLevel) {
      const clampedCurrent = Levels.clampLevel(currentLevel)
      const recent = SocraticDB.getRecentEvaluatedTurns(
        Levels.CALIBRATION_UP_BY_LEVEL[clampedCurrent].window + 5,
      )
      const turnsForFilter: Levels.TurnForFilter[] = recent.map((r) => ({
        hintLevel: r.hint_level,
        correct: r.correct === null ? null : r.correct === 1,
        topic: r.topic,
        readiness:
          r.readiness === "above" || r.readiness === "at" || r.readiness === "below"
            ? r.readiness
            : null,
      }))
      const filters = Levels.evaluateUpgradeFilters(clampedCurrent, turnsForFilter)
      if (!filters.passed) {
        result = {
          newLevel: clampedCurrent,
          changed: false,
          reason: `upgrade blocked (${filters.reason})`,
        }
      } else {
        result = {
          ...rawResult,
          reason: `${rawResult.reason ?? "upgrade"} [filters: ${filters.reason}]`,
        }
      }
    }

    if (result.changed) {
      if (domain) {
        // Update domain level
        SocraticDB.setDomainLevel(domain, result.newLevel)
        // Update confidence (more interactions = higher confidence)
        const domainData = SocraticDB.getDomainLevel(domain)
        if (domainData) {
          const newConfidence = Levels.updateConfidence(
            domainData.confidence,
            domainData.total_interactions,
          )
          // Confidence is updated via the domain level record
          // Note: setDomainLevel already increments total_interactions
        }
      } else {
        // Update global level
        SocraticDB.updateProfile({ global_level: result.newLevel })
      }
    }

    // Always update comprehension speed and copy tendency
    const understood = signals.correctAnswers > signals.incorrectAnswers
    const newSpeed = Levels.adjustComprehensionSpeed(
      profile.comprehension_speed,
      understood,
    )
    const newCopyTendency = Levels.updateCopyTendency(
      profile.copy_tendency,
      signals.copyPasteDetected,
    )

    SocraticDB.updateProfile({
      comprehension_speed: newSpeed,
      copy_tendency: newCopyTendency,
    })

    return result
  }

  // ── Manual Override ──────────────────────────────────────

  /**
   * User manually sets their level via /level command.
   * Marks as user_override so the system respects it for a few sessions.
   */
  export function setManualLevel(level: LevelsNS.UserLevel): void {
    SocraticDB.updateProfile({
      global_level: level,
      user_override: 1,
      override_timestamp: Date.now(),
      override_sessions_count: 0,
    })
  }

  /**
   * Check if the system should respect a manual override.
   * Override lasts for 5 sessions, then the system can adjust again.
   */
  export function isOverrideActive(): boolean {
    const profile = SocraticDB.getProfile()
    if (!profile || !profile.user_override) return false
    return profile.override_sessions_count < 5
  }

  /**
   * Increment the override session counter.
   * Called at the start of each new session.
   */
  export function incrementOverrideCounter(): void {
    const profile = SocraticDB.getProfile()
    if (!profile || !profile.user_override) return

    const newCount = profile.override_sessions_count + 1
    if (newCount >= 5) {
      // Override expired
      SocraticDB.updateProfile({
        user_override: 0,
        override_sessions_count: newCount,
      })
    } else {
      SocraticDB.updateProfile({
        override_sessions_count: newCount,
      })
    }
  }
}
