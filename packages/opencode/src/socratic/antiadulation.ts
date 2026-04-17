/**
 * Anti-adulation system for SocraticCode.
 *
 * Handles:
 * - Detecting pressure from users demanding direct answers
 * - Detecting AI-generated or copy-pasted responses
 * - Generating appropriate challenge responses instead of praise
 * - Adapting pressure responses by user level
 */

import type { Levels as LevelsNS } from "./levels"

export namespace AntiAdulation {
  // ── Pressure Detection ───────────────────────────────────

  const PRESSURE_PATTERNS = [
    // Spanish
    /\bsolo\s+dime\b/i,
    /\bdame\s+la\s+respuesta\b/i,
    /\bdeja\s+de\s+preguntar\b/i,
    /\bresponde\s+directo\b/i,
    /\bsin\s+rodeos\b/i,
    /\bal\s+grano\b/i,
    /\bno\s+tengo\s+tiempo\b/i,
    /\bconfirma\b/i,
    /\bes\s+o\s+no\s+es\b/i,
    /\bs[ií]\s+o\s+no\b/i,
    /\bsolo\s+escribe\s+el\s+c[oó]digo\b/i,
    /\bsolo\s+dame\s+el\s+c[oó]digo\b/i,
    /\bdeja\s+de\s+explicar\b/i,
    // English
    /\bjust\s+tell\s+me\b/i,
    /\bgive\s+me\s+the\s+answer\b/i,
    /\bstop\s+asking\s+(me\s+)?questions\b/i,
    /\bjust\s+(write|give\s+me)\s+the\s+code\b/i,
    /\bi\s+don'?t\s+have\s+time\b/i,
    /\bjust\s+do\s+it\b/i,
    /\bstop\s+explaining\b/i,
  ]

  export interface PressureResult {
    detected: boolean
    count: number
  }

  export function detectPressure(message: string): PressureResult {
    let count = 0
    for (const pattern of PRESSURE_PATTERNS) {
      if (pattern.test(message)) count++
    }
    return { detected: count > 0, count }
  }

  // ── Pressure Response by Level ───────────────────────────

  export interface PressureResponse {
    directive: string
    escalateHints: boolean
    skipQuestions: boolean
  }

  /**
   * Get the appropriate response strategy when a user pressures for direct answers.
   * consecutivePressure = how many times they've pushed back in this session.
   */
  export function getPressureResponse(
    userLevel: LevelsNS.UserLevel,
    consecutivePressure: number,
  ): PressureResponse {
    // Advanced/Expert: respect their time, respond directly
    if (userLevel >= 4) {
      return {
        directive: "The user has asked for a direct answer. Respect that — respond concisely without pedagogical questions.",
        escalateHints: false,
        skipQuestions: true,
      }
    }

    // Novice
    if (userLevel <= 2) {
      return {
        directive: [
          "The user is frustrated. Change approach:",
          '"I understand the frustration. I\'ll explain it directly and then we\'ll verify it\'s clear."',
          "Explain the concept directly (hint level 4). Then ask ONE brief verification question.",
        ].join("\n"),
        escalateHints: true,
        skipQuestions: false,
      }
    }

    // Intermediate: escalate based on consecutive pressure
    if (consecutivePressure <= 1) {
      return {
        directive: '"Got it. Let me rephrase it more simply." — Simplify the question or give more context.',
        escalateHints: true,
        skipQuestions: false,
      }
    }

    if (consecutivePressure === 2) {
      return {
        directive: '"OK, I\'ll show you the solution, but afterwards I want you to explain why it works." — Give the answer but ask for verification.',
        escalateHints: true,
        skipQuestions: false,
      }
    }

    // 3+ pressure: give in but track it
    return {
      directive: "Multiple pressures. Give the direct answer. Ask only ONE verification question at the end.",
      escalateHints: true,
      skipQuestions: true,
    }
  }

  // ── AI/Copy Detection in Responses ───────────────────────

  export interface CopyScoreResult {
    score: number
    suspicious: boolean
    reasons: string[]
    deepenTactic: string | null
  }

  /**
   * Score a user's response for likelihood of being AI-generated or copied.
   * Score 0-4. Suspicious if >= 2.
   */
  export function scoreResponse(message: string): CopyScoreResult {
    let score = 0
    const reasons: string[] = []

    // Long response (>400 chars)
    if (message.length > 400) {
      score += 1
      reasons.push("unusually long response")
    }

    // Heavy markdown (code blocks, numbered lists with bold)
    const codeBlocks = (message.match(/```/g) ?? []).length
    const boldItems = (message.match(/\*\*\d+\./g) ?? []).length
    if (codeBlocks >= 4 || boldItems >= 3) {
      score += 1
      reasons.push("excessive markdown formatting")
    }

    // Formal/AI language patterns
    const formalPatterns = [
      /\ben\s+conclusi[oó]n\b/i,
      /\bcabe\s+destacar\b/i,
      /\bes\s+importante\s+mencionar\b/i,
      /\bfurthermore\b/i,
      /\bin\s+conclusion\b/i,
      /\bit\s+is\s+worth\s+noting\b/i,
      /\badditionally\b/i,
      /\bmoreover\b/i,
      /\bin\s+summary\b/i,
      /\bto\s+summarize\b/i,
    ]
    const formalCount = formalPatterns.filter((p) => p.test(message)).length
    if (formalCount >= 2) {
      score += 1
      reasons.push("formal/artificial language")
    } else if (formalCount === 1) {
      score += 0.5
      reasons.push("possibly formal language")
    }

    // Perfect structure without errors (numbered lists with no typos in a long response)
    if (message.length > 300 && /^\d+\.\s/m.test(message) && !/\b(teh|taht|dont)\b/i.test(message)) {
      score += 0.5
      reasons.push("perfect structure without typical errors")
    }

    const suspicious = score >= 2
    const deepenTactic = suspicious ? pickDeepeningTactic() : null

    return { score, suspicious, reasons, deepenTactic }
  }

  const DEEPENING_TACTICS = [
    "Explain in your own words why it works this way.",
    "If I change this variable, what would you expect to happen?",
    "How would you explain this to someone who has never seen it?",
    "Give me a different example where the same thing applies.",
    "What would happen if we did the opposite?",
  ]

  function pickDeepeningTactic(): string {
    return DEEPENING_TACTICS[Math.floor(Math.random() * DEEPENING_TACTICS.length)]!
  }

  // ── Challenge Mode ───────────────────────────────────────

  export function getChallengeDirective(userLevel: LevelsNS.UserLevel): string {
    const intensity = userLevel <= 2
      ? "gently (explain why you're asking)"
      : userLevel === 3
        ? "directly (ask them to defend it)"
        : "aggressively (look for deep flaws)"

    return [
      "CHALLENGE MODE ACTIVATED.",
      `The user is presenting code, an argument, or a solution. Challenge ${intensity}.`,
      "",
      "RULES:",
      "1. Look for: unjustified assumptions, edge cases, unexplored alternatives.",
      "2. Ask 3-5 questions attacking different aspects:",
      "   - Why X instead of Y?",
      "   - What happens if...? (robustness)",
      "   - What are the alternatives?",
      "   - Limitations?",
      '3. ZERO praise ("good job", "excellent", "great question").',
      "4. If they defend well → look for a deeper angle.",
      "5. If they can't defend → identify blind spots.",
      "6. Closing: summarize strengths and weaknesses OBJECTIVELY.",
    ].join("\n")
  }

  // ── Praise Filter ────────────────────────────────────────

  const PRAISE_PATTERNS = [
    /\bexcelente\b/i,
    /\bperfecto\b/i,
    /\bgran\s+pregunta\b/i,
    /\bbuen\s+trabajo\b/i,
    /\bbien\s+hecho\b/i,
    /\bgreat\s+(job|work|question)\b/i,
    /\bexcellent\b/i,
    /\bperfect\b/i,
    /\bawesome\b/i,
    /\bamazing\b/i,
    /\bfantastic\b/i,
    /\bbrilliant\b/i,
    /\bwonderful\b/i,
    /\b¡?muy\s+bien!?\b/i,
    /\b¡?genial!?\b/i,
    /\b¡?increíble!?\b/i,
  ]

  /**
   * Check if a message contains empty praise that should be avoided.
   * Used to filter the agent's own responses.
   */
  export function containsEmptyPraise(message: string): boolean {
    return PRAISE_PATTERNS.some((p) => p.test(message))
  }
}
