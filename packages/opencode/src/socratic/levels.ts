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
      initialHintLevel: 2,
      accompanimentRatio: 0.5,
    },
    4: {
      level: 4,
      name: "avanzado",
      label: "Advanced",
      role: "code reviewer",
      description: "Does not explain basics. Challenges architectural decisions. Challenge mode.",
      initialHintLevel: 1,
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

  // ── Upgrade Quality Filters ──────────────────────────────
  //
  // Passing `evaluateAdjustment` is a NECESSARY condition for upgrade, not a
  // sufficient one. On top of the simple signal heuristic we require evidence
  // from the last N evaluated turns across sessions:
  //   (A) weighted avg >= 0.5 — "10 correct all under hint=5" is obedience.
  //   (B) topic diversity — can't graduate by nailing the same thing repeatedly.
  //   (C) depth diversity floor — at least half the correct under low hint.
  //
  // Downgrade skips these filters (being stuck above level is worse than a
  // false downgrade; the user can always /level back up).

  export interface UpgradeWindow {
    window: number
    correctRequired: number
  }

  export const CALIBRATION_UP_BY_LEVEL: Record<UserLevel, UpgradeWindow> = {
    1: { window: 12, correctRequired: 10 },
    2: { window: 9, correctRequired: 7 },
    3: { window: 7, correctRequired: 5 },
    4: { window: 7, correctRequired: 5 },
    5: { window: 7, correctRequired: 5 }, // unused (L5 has no upgrade) — kept for completeness
  }

  export const MIN_WEIGHTED_AVG_FOR_UP = 0.5
  export const LOW_HINT_THRESHOLD = 2

  export type Readiness = "above" | "at" | "below" | null

  export interface TurnForFilter {
    hintLevel: number
    correct: boolean | null
    topic: string | null
    readiness?: Readiness
  }

  export interface UpgradeFilterResult {
    passed: boolean
    reason: string
    weightedAvg: number
    topicDiversity: number
    lowHintCount: number
    correctInWindow: number
    windowSize: number
    correctRequired: number
  }

  /**
   * Apply the three upgrade quality filters over the most recent `window` turns.
   *
   * Callers pass turns newest-first (or any order — we only count, don't index).
   * Turns with correct === null are ignored (not an evaluated signal).
   *
   * The filters check in order: enough correct → weighted avg → topic diversity
   * → depth diversity. First failure short-circuits with a reason string.
   */
  export function evaluateUpgradeFilters(
    currentLevel: UserLevel,
    recentTurns: TurnForFilter[],
  ): UpgradeFilterResult {
    const cfg = CALIBRATION_UP_BY_LEVEL[currentLevel]
    // Keep only evaluated turns, then take the latest `window` of them.
    const evaluated = recentTurns.filter((t) => t.correct !== null).slice(0, cfg.window)
    const correctTurns = evaluated.filter((t) => t.correct === true)
    const correctInWindow = correctTurns.length

    const base = {
      weightedAvg: 0,
      topicDiversity: 0,
      lowHintCount: 0,
      correctInWindow,
      windowSize: cfg.window,
      correctRequired: cfg.correctRequired,
    }

    if (correctInWindow < cfg.correctRequired) {
      return {
        ...base,
        passed: false,
        reason: `only ${correctInWindow}/${cfg.correctRequired} correct in last ${cfg.window} turns`,
      }
    }

    // Filter A: weighted avg of hint-adjusted correctness >= 0.5
    let weightSum = 0
    for (const t of correctTurns) {
      const h = Math.max(0, Math.min(5, t.hintLevel))
      const baseWeight = (5 - h) / 5
      const adj =
        t.readiness === "above" ? 0.25 : t.readiness === "below" ? -0.25 : 0
      const w = Math.max(0, Math.min(1, baseWeight + adj))
      weightSum += w
    }
    const weightedAvg = weightSum / correctTurns.length

    // Filter B: topic diversity >= ceil(needed/2)
    const minDiversity = Math.ceil(cfg.correctRequired / 2)
    const uniqueTopics = new Set(
      correctTurns.map((t) => t.topic).filter((x): x is string => !!x && x.length > 0),
    )
    const topicDiversity = uniqueTopics.size

    // Filter C: depth diversity floor — at least half of the correct under low hint
    const lowHintCount = correctTurns.filter((t) => t.hintLevel <= LOW_HINT_THRESHOLD).length

    const enriched = { ...base, weightedAvg, topicDiversity, lowHintCount }

    if (weightedAvg < MIN_WEIGHTED_AVG_FOR_UP) {
      return {
        ...enriched,
        passed: false,
        reason: `weighted avg ${weightedAvg.toFixed(2)} < ${MIN_WEIGHTED_AVG_FOR_UP} (scaffold obedience, not mastery)`,
      }
    }

    if (topicDiversity < minDiversity) {
      return {
        ...enriched,
        passed: false,
        reason: `topic diversity ${topicDiversity} < ${minDiversity} (repeated same topic, not general mastery)`,
      }
    }

    if (lowHintCount < minDiversity) {
      return {
        ...enriched,
        passed: false,
        reason: `low-hint count ${lowHintCount} < ${minDiversity} (no evidence of mastery under light scaffolding)`,
      }
    }

    return {
      ...enriched,
      passed: true,
      reason: `weighted=${weightedAvg.toFixed(2)}, topics=${topicDiversity}, lowHint=${lowHintCount}`,
    }
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
