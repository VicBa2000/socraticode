/**
 * Hint escalation system (levels 0-5) for SocraticCode.
 *
 * Manages progressive hint levels that escalate when a user struggles
 * and de-escalate when they succeed. Orthogonal to user level — a novice
 * starts at hint 4-5, an intermediate at 0.
 *
 * Levels:
 *   0 - Socratic pure: only questions
 *   1 - Orientation: general category hints
 *   2 - Analogy: real-world analogies
 *   3 - Reduction: break problem into minimal parts
 *   4 - Explanation + verification: explain then quiz
 *   5 - Scaffolding: micro-lesson (3-5 sentences) + verification
 */

import type { Levels as LevelsNS } from "./levels"

export namespace Hints {
  export type HintLevel = 0 | 1 | 2 | 3 | 4 | 5
  export type Capability = "strong" | "lite"

  export const MIN_HINT = 0
  export const MAX_HINT = 5

  // How many consecutive failures trigger escalation
  export const ESCALATION_THRESHOLD = 2

  // ── Hint State ───────────────────────────────────────────

  export interface HintState {
    currentLevel: HintLevel
    consecutiveFailures: number
    consecutiveSuccesses: number
    totalEscalations: number
    zeroKnowledgeActive: boolean
  }

  export function createInitialState(userLevel: LevelsNS.UserLevel): HintState {
    return {
      currentLevel: getInitialHintLevel(userLevel),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      totalEscalations: 0,
      zeroKnowledgeActive: false,
    }
  }

  /**
   * Get the starting hint level based on user level.
   *
   * Smoothing for mid-tier users: pure socratic as a cold start creates
   * unnecessary friction when the user actually does not know the thing.
   * Intermediate opens at analogy (still discovery, less gotcha);
   * advanced opens at orientation (category pointer, not solution).
   * Expert stays at pure socratic — at that level silence is the default.
   */
  export function getInitialHintLevel(userLevel: LevelsNS.UserLevel): HintLevel {
    switch (userLevel) {
      case 1: return 5  // novato: scaffolding
      case 2: return 4  // basico: explanation + verification
      case 3: return 2  // intermedio: analogy (smoothed from 0)
      case 4: return 1  // avanzado: orientation (smoothed from 0)
      case 5: return 0  // experto: socratic pure
    }
  }

  // ── Escalation / De-escalation ───────────────────────────

  /**
   * Process a user response and update hint state.
   */
  export function processResponse(
    state: HintState,
    correct: boolean,
    zeroKnowledge: boolean,
  ): HintState {
    const next = { ...state }

    // Zero-knowledge signal: jump to scaffolding
    if (zeroKnowledge) {
      next.zeroKnowledgeActive = true
      if (state.currentLevel < 3) {
        next.currentLevel = 5 as HintLevel
      } else {
        next.currentLevel = 5 as HintLevel
      }
      next.consecutiveFailures = 0
      next.consecutiveSuccesses = 0
      next.totalEscalations++
      return next
    }

    if (correct) {
      next.consecutiveSuccesses++
      next.consecutiveFailures = 0
      next.zeroKnowledgeActive = false

      // De-escalate on success
      next.currentLevel = descendLevel(state.currentLevel)
    } else {
      next.consecutiveFailures++
      next.consecutiveSuccesses = 0

      // Escalate after threshold failures
      if (next.consecutiveFailures >= ESCALATION_THRESHOLD) {
        next.currentLevel = ascendLevel(state.currentLevel)
        next.consecutiveFailures = 0
        next.totalEscalations++
      }
    }

    return next
  }

  /**
   * Escalate hint level (more help).
   */
  function ascendLevel(current: HintLevel): HintLevel {
    if (current >= MAX_HINT) return MAX_HINT as HintLevel
    return (current + 1) as HintLevel
  }

  /**
   * De-escalate hint level (less help).
   * Uses jump-down rules:
   *   5 → 3, 3+ → 1, 1+ → 0
   */
  function descendLevel(current: HintLevel): HintLevel {
    if (current >= 5) return 3 as HintLevel
    if (current >= 3) return 1 as HintLevel
    if (current >= 1) return 0 as HintLevel
    return 0 as HintLevel
  }

  // ── Hint Directives (injected into system prompt) ───────

  export interface HintDirective {
    level: HintLevel
    name: string
    strategy: string
    instruction: string
  }

  export function getDirective(
    level: HintLevel,
    capability: Capability = "strong",
  ): HintDirective {
    if (capability === "lite") {
      return DIRECTIVES_LITE[level] ?? DIRECTIVES[level]
    }
    return DIRECTIVES[level]
  }

  const DIRECTIVES: Record<HintLevel, HintDirective> = {
    0: {
      level: 0,
      name: "Pure socratic",
      strategy: "Questions only. No additional guidance.",
      instruction: [
        "HINT LEVEL 0 — PURE SOCRATIC:",
        "Respond ONLY with questions. Give no hints, no guidance.",
        "Ask questions that lead the user to discover the answer themselves.",
        'Example: "What data structure gives you O(1) lookup?"',
      ].join("\n"),
    },
    1: {
      level: 1,
      name: "Orientation",
      strategy: "General-category questions without revealing details.",
      instruction: [
        "HINT LEVEL 1 — ORIENTATION:",
        "Ask questions that point toward the right CATEGORY without revealing the answer.",
        "Point to the AREA of the problem, not the solution.",
        'Example: "Have you considered that the problem might be in how you handle async state?"',
      ].join("\n"),
    },
    2: {
      level: 2,
      name: "Analogy",
      strategy: "Use an analogy or example from another context.",
      instruction: [
        "HINT LEVEL 2 — ANALOGY:",
        "Use a real-world analogy to illuminate the underlying principle.",
        "Connect with something the user probably already knows.",
        'Example: "Think of a supermarket line — first to arrive is first',
        'to leave. What data structure works like that?"',
      ].join("\n"),
    },
    3: {
      level: 3,
      name: "Reduction",
      strategy: "Break the problem into minimal parts.",
      instruction: [
        "HINT LEVEL 3 — REDUCTION:",
        "Simplify the problem to the MINIMUM. Break into parts and guide through the first one.",
        "Remove accidental complexity to focus on the core concept.",
        'Example: "Forget the full sort. Can you compare just two numbers and tell me',
        'which is larger?"',
      ].join("\n"),
    },
    4: {
      level: 4,
      name: "Explanation + verification",
      strategy: "Explain the concept. Immediately verify with an exercise.",
      instruction: [
        "HINT LEVEL 4 — EXPLANATION + VERIFICATION:",
        "Explain the concept DIRECTLY (brief, 2-3 sentences).",
        "IMMEDIATELY after, ask an equivalent verification question.",
        "Don't ask about what you just explained literally — ask a VARIATION.",
        'Example: "A HashMap stores key-value pairs using a hash function to',
        'compute the index... Now: what happens if two different keys produce',
        'the same index?"',
      ].join("\n"),
    },
    5: {
      level: 5,
      name: "Scaffolding",
      strategy: "Micro-lesson + immediate verification.",
      instruction: [
        "HINT LEVEL 5 — SCAFFOLDING MODE:",
        "Give a MICRO-LESSON: 3-5 simple sentences about ONE single concept.",
        "Use clear language, no unnecessary jargon. Include a concrete example.",
        "IMMEDIATELY after, ask ONE simple question about what you just taught.",
        "DO NOT ask about material you have NOT explained in this micro-lesson.",
        "If they don't understand: reformulate with a different analogy, DO NOT repeat the same thing.",
      ].join("\n"),
    },
  }

  // ── LITE Directives (short, for small models) ────────────

  const DIRECTIVES_LITE: Record<HintLevel, HintDirective> = {
    0: {
      level: 0, name: "Pure socratic", strategy: "Questions only.",
      instruction: "HINT 0: Answer only with questions. No hints, no guidance.",
    },
    1: {
      level: 1, name: "Orientation", strategy: "Point to category.",
      instruction: "HINT 1: Hint the general AREA of the problem. Do not reveal the answer.",
    },
    2: {
      level: 2, name: "Analogy", strategy: "Real-world analogy.",
      instruction: "HINT 2: Use a simple real-world analogy to hint at the concept.",
    },
    3: {
      level: 3, name: "Reduction", strategy: "Simplify.",
      instruction: "HINT 3: Simplify the problem. Ask about the smallest part first.",
    },
    4: {
      level: 4, name: "Explain + verify", strategy: "Short explanation then quiz.",
      instruction: "HINT 4: Explain the concept in 2 sentences, then ask a variation to verify.",
    },
    5: {
      level: 5, name: "Scaffolding", strategy: "Micro-lesson + check.",
      instruction: "HINT 5: Give a 3-sentence micro-lesson with one concrete example. Then ask one simple check question.",
    },
  }

  // ── Helper ───────────────────────────────────────────────

  export function clampHint(level: number): HintLevel {
    return Math.max(MIN_HINT, Math.min(MAX_HINT, Math.round(level))) as HintLevel
  }
}
