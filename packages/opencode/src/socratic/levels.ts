/**
 * Level definitions and dynamic adjustment logic for SocraticCode.
 *
 * Defines the 5 user levels (1-5), their behavioral profiles,
 * and the rules for adjusting levels based on user performance signals.
 */

export namespace Levels {
  // ── Level Definitions ────────────────────────────────────

  export type UserLevel = 1 | 2 | 3 | 4 | 5

  export const MIN_LEVEL: UserLevel = 1
  export const MAX_LEVEL: UserLevel = 5

  export interface LevelProfile {
    level: UserLevel
    name: string
    label: string
    role: string
    description: string
    initialHintLevel: number
    accompanimentRatio: number // 0.0 - 1.0, how much code gets accompanied explanation
  }

  export const PROFILES: Record<UserLevel, LevelProfile> = {
    1: {
      level: 1,
      name: "novato",
      label: "Novice",
      role: "teacher",
      description: "Teach BEFORE asking. Explain every line in simple language.",
      initialHintLevel: 5,
      accompanimentRatio: 1.0,
    },
    2: {
      level: 2,
      name: "basico",
      label: "Basic",
      role: "teacher",
      description: "Teach with context. Explain key concepts, advance file by file.",
      initialHintLevel: 4,
      accompanimentRatio: 0.8,
    },
    3: {
      level: 3,
      name: "intermedio",
      label: "Intermediate",
      role: "pair programmer",
      description: "Ask before writing. Gapped code. Collaborative.",
      initialHintLevel: 0,
      accompanimentRatio: 0.5,
    },
    4: {
      level: 4,
      name: "avanzado",
      label: "Advanced",
      role: "code reviewer",
      description: "Does not explain basics. Challenges architectural decisions. Challenge mode.",
      initialHintLevel: 0,
      accompanimentRatio: 0.1,
    },
    5: {
      level: 5,
      name: "experto",
      label: "Expert",
      role: "silent colleague",
      description: "Works as a normal agent. Only intervenes on vulnerabilities or anti-patterns.",
      initialHintLevel: 0,
      accompanimentRatio: 0.0,
    },
  }

  export function getProfile(level: number): LevelProfile {
    const clamped = clampLevel(level)
    return PROFILES[clamped]
  }

  // ── Level Adjustment ─────────────────────────────────────

  export interface AdjustmentSignals {
    correctAnswers: number
    incorrectAnswers: number
    zeroKnowledgeSignals: number
    technicalTermsUsed: boolean
    proposedSolutionWithoutHelp: boolean
    requestedSlowDown: boolean
    copyPasteDetected: boolean
  }

  export interface AdjustmentResult {
    newLevel: UserLevel
    changed: boolean
    reason: string | null
  }

  /**
   * Evaluate whether a level should be adjusted based on accumulated signals.
   *
   * Rules:
   * - Lower: 3+ incorrect, or 2+ zero-knowledge signals, or slow-down request
   * - Raise: 3+ correct AND (technical terms OR proposed solution without help)
   * - Copy-paste blocks level increase
   * - Max 1 level change at a time
   */
  export function evaluateAdjustment(
    currentLevel: number,
    signals: AdjustmentSignals,
  ): AdjustmentResult {
    const level = clampLevel(currentLevel)

    // Check for downgrade signals
    if (signals.zeroKnowledgeSignals >= 2 && level > MIN_LEVEL) {
      return {
        newLevel: (level - 1) as UserLevel,
        changed: true,
        reason: "Zero-knowledge signals detected — adjusting level for better support.",
      }
    }

    if (signals.requestedSlowDown && level > MIN_LEVEL) {
      return {
        newLevel: (level - 1) as UserLevel,
        changed: true,
        reason: "Slow-down request — lowering level to explain in more detail.",
      }
    }

    if (signals.incorrectAnswers >= 3 && level > MIN_LEVEL) {
      return {
        newLevel: (level - 1) as UserLevel,
        changed: true,
        reason: "Several incorrect answers — adjusting level to reinforce concepts.",
      }
    }

    // Check for upgrade signals (copy-paste blocks upgrades)
    if (signals.copyPasteDetected) {
      return { newLevel: level, changed: false, reason: null }
    }

    if (
      signals.correctAnswers >= 3 &&
      (signals.technicalTermsUsed || signals.proposedSolutionWithoutHelp) &&
      level < MAX_LEVEL
    ) {
      return {
        newLevel: (level + 1) as UserLevel,
        changed: true,
        reason: "Strong mastery demonstrated — raising level for greater challenge.",
      }
    }

    return { newLevel: level, changed: false, reason: null }
  }

  // ── Domain-Level Confidence ──────────────────────────────

  /**
   * Calculate the effective level for a domain, considering domain-specific
   * level and confidence, falling back to global level.
   */
  export function effectiveLevel(
    globalLevel: number,
    domainLevel: number | null,
    domainConfidence: number | null,
  ): UserLevel {
    if (domainLevel === null || domainConfidence === null) {
      return clampLevel(globalLevel)
    }

    // If confidence is low (<0.3), lean towards global level
    if (domainConfidence < 0.3) {
      return clampLevel(Math.round(globalLevel * 0.7 + domainLevel * 0.3))
    }

    // If confidence is medium (0.3-0.7), blend
    if (domainConfidence < 0.7) {
      return clampLevel(Math.round(globalLevel * 0.4 + domainLevel * 0.6))
    }

    // High confidence: trust domain level
    return clampLevel(domainLevel)
  }

  /**
   * Update confidence based on interaction count.
   * More interactions = higher confidence in the domain-specific level.
   */
  export function updateConfidence(currentConfidence: number, interactionCount: number): number {
    // Confidence grows with interactions, asymptotic to 1.0
    // After ~10 interactions, confidence is ~0.75
    // After ~20 interactions, confidence is ~0.87
    const target = 1 - Math.exp(-interactionCount / 12)
    // Smooth transition: 80% new + 20% old
    return Math.min(1.0, currentConfidence * 0.2 + target * 0.8)
  }

  // ── Comprehension Speed ──────────────────────────────────

  /**
   * Adjust comprehension speed based on whether the user understood a concept.
   * Speed affects how much explanation detail the system provides.
   */
  export function adjustComprehensionSpeed(
    currentSpeed: number,
    understood: boolean,
  ): number {
    const delta = 0.02
    if (understood) {
      return Math.min(1.0, currentSpeed + delta)
    } else {
      return Math.max(0.0, currentSpeed - delta)
    }
  }

  // ── Copy Tendency (EMA) ──────────────────────────────────

  /**
   * Update copy tendency using Exponential Moving Average (α=0.1).
   * Value of 1.0 = definitely copied, 0.0 = definitely original.
   */
  export function updateCopyTendency(
    currentTendency: number,
    wasCopy: boolean,
  ): number {
    const alpha = 0.1
    const signal = wasCopy ? 1.0 : 0.0
    return currentTendency * (1 - alpha) + signal * alpha
  }

  // ── Helpers ──────────────────────────────────────────────

  export function clampLevel(level: number): UserLevel {
    return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level))) as UserLevel
  }

  export function isValidLevel(level: number): level is UserLevel {
    return Number.isInteger(level) && level >= MIN_LEVEL && level <= MAX_LEVEL
  }
}
