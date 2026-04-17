/**
 * Accompanied implementation system for SocraticCode.
 *
 * Manages the state machine for step-by-step code implementation
 * with teaching. The flow is:
 *   CONTEXTO → PLAN → POR_MODULO (repeat) → RESUMEN → VERIFICACION_FINAL
 *
 * The accompaniment ratio varies by level:
 *   Novice: 100% accompanied
 *   Basic: 80% accompanied
 *   Intermediate: 50% collaborative
 *   Advanced: 10% review-based
 *   Expert: 0% (direct)
 */

import type { Levels as LevelsNS } from "./levels"

export namespace Accompaniment {
  export type Capability = "strong" | "lite"

  // ── States ───────────────────────────────────────────────

  export type Phase =
    | "idle"               // No accompaniment active
    | "contexto"           // Explain the general concept
    | "plan"               // Announce which files/steps are needed
    | "modulo"             // Working on a specific module/file
    | "modulo_verificacion" // Verifying user understood the current module
    | "resumen"            // Review what was built
    | "verificacion_final" // Final: user explains the full flow

  export interface AccompanimentState {
    phase: Phase
    totalModules: number
    currentModule: number
    moduleNames: string[]
    currentModuleName: string | null
    failedVerifications: number
    conceptExplained: boolean
  }

  export function createIdleState(): AccompanimentState {
    return {
      phase: "idle",
      totalModules: 0,
      currentModule: 0,
      moduleNames: [],
      currentModuleName: null,
      failedVerifications: 0,
      conceptExplained: false,
    }
  }

  // ── State Transitions ────────────────────────────────────

  export function startAccompaniment(
    modules: string[],
  ): AccompanimentState {
    return {
      phase: "contexto",
      totalModules: modules.length,
      currentModule: 0,
      moduleNames: modules,
      currentModuleName: null,
      failedVerifications: 0,
      conceptExplained: false,
    }
  }

  export function advanceToPlanning(state: AccompanimentState): AccompanimentState {
    return { ...state, phase: "plan", conceptExplained: true }
  }

  export function startModule(state: AccompanimentState): AccompanimentState {
    const idx = state.currentModule
    return {
      ...state,
      phase: "modulo",
      currentModuleName: state.moduleNames[idx] ?? `Module ${idx + 1}`,
      failedVerifications: 0,
    }
  }

  export function askVerification(state: AccompanimentState): AccompanimentState {
    return { ...state, phase: "modulo_verificacion" }
  }

  export function verificationPassed(state: AccompanimentState): AccompanimentState {
    const nextIdx = state.currentModule + 1
    if (nextIdx >= state.totalModules) {
      return { ...state, phase: "resumen", currentModule: nextIdx }
    }
    return {
      ...state,
      phase: "modulo",
      currentModule: nextIdx,
      currentModuleName: state.moduleNames[nextIdx] ?? `Module ${nextIdx + 1}`,
      failedVerifications: 0,
    }
  }

  export function verificationFailed(state: AccompanimentState): AccompanimentState {
    return {
      ...state,
      phase: "modulo",
      failedVerifications: state.failedVerifications + 1,
    }
  }

  export function advanceToFinalVerification(state: AccompanimentState): AccompanimentState {
    return { ...state, phase: "verificacion_final" }
  }

  export function complete(state: AccompanimentState): AccompanimentState {
    return { ...state, phase: "idle" }
  }

  // ── Phase Directives ─────────────────────────────────────

  export function getPhaseDirective(
    state: AccompanimentState,
    userLevel: LevelsNS.UserLevel,
    capability: Capability = "strong",
  ): string | null {
    if (state.phase === "idle") return null
    if (capability === "lite") return getLitePhaseDirective(state, userLevel)

    switch (state.phase) {
      case "contexto":
        return [
          "ACCOMPANIED IMPLEMENTATION — PHASE: CONTEXT",
          "Explain the general concept of what will be built and WHY.",
          "3-5 clear sentences. Use analogies if the user is a novice.",
          "At the end ask: 'What is your goal? Why do you need this?'",
        ].join("\n")

      case "plan":
        return [
          "ACCOMPANIED IMPLEMENTATION — PHASE: PLAN",
          `Announce the plan: ${state.totalModules} modules/files.`,
          `Modules: ${state.moduleNames.join(", ")}`,
          'Format: "We will need X files. Let\'s start with..."',
        ].join("\n")

      case "modulo":
        return getModuleDirective(state, userLevel)

      case "modulo_verificacion":
        return [
          "ACCOMPANIED IMPLEMENTATION — PHASE: MODULE VERIFICATION",
          `Module: ${state.currentModuleName} (${state.currentModule + 1}/${state.totalModules})`,
          "Ask ONE verification question about what you just explained/wrote.",
          "The question must verify understanding, not memorization.",
          state.failedVerifications > 0
            ? `The user has failed ${state.failedVerifications} time(s). Reformulate the explanation with a different analogy.`
            : "",
        ].filter(Boolean).join("\n")

      case "resumen":
        return [
          "ACCOMPANIED IMPLEMENTATION — PHASE: SUMMARY",
          "Do a brief review of everything that was built:",
          state.moduleNames.map((m, i) => `  ${i + 1}. ${m}`).join("\n"),
          "Explain how the parts connect to each other.",
        ].join("\n")

      case "verificacion_final":
        return [
          "ACCOMPANIED IMPLEMENTATION — PHASE: FINAL VERIFICATION",
          '"Explain the full flow in your own words."',
          "Evaluate their understanding. If pieces are missing, point them out without giving the answer.",
        ].join("\n")
    }
  }

  /**
   * Short, bullet-only phase directives for small models.
   */
  function getLitePhaseDirective(
    state: AccompanimentState,
    _userLevel: LevelsNS.UserLevel,
  ): string | null {
    switch (state.phase) {
      case "contexto":
        return "PHASE: CONTEXT. Explain what and why in 3 sentences. Then ask the user's goal."
      case "plan":
        return `PHASE: PLAN. ${state.totalModules} steps: ${state.moduleNames.join(", ")}. Start with the first.`
      case "modulo":
        return `PHASE: MODULE ${state.currentModule + 1}/${state.totalModules} (${state.currentModuleName}). Explain, write code, then ask one check question.`
      case "modulo_verificacion":
        return `PHASE: VERIFY. Ask one comprehension question about ${state.currentModuleName}. ${state.failedVerifications > 0 ? "Reformulate with a different analogy." : ""}`.trim()
      case "resumen":
        return "PHASE: SUMMARY. Briefly review what was built and how parts connect."
      case "verificacion_final":
        return "PHASE: FINAL. Ask the user to explain the whole flow in their own words."
      default:
        return null
    }
  }

  function getModuleDirective(
    state: AccompanimentState,
    userLevel: LevelsNS.UserLevel,
  ): string {
    const header = [
      "ACCOMPANIED IMPLEMENTATION — PHASE: MODULE",
      `Module: ${state.currentModuleName} (${state.currentModule + 1}/${state.totalModules})`,
    ]

    if (userLevel <= 2) {
      // Novice/Basic: full explanation
      return [
        ...header,
        "1. Explain WHAT this module will do and WHY.",
        "2. Write the code, explaining the key lines AS you write.",
        "3. When done, ask ONE verification question.",
        "4. If they answer correctly → move to the next.",
        "5. If not → reformulate with a different analogy, DO NOT repeat the same thing.",
      ].join("\n")
    }

    if (userLevel === 3) {
      // Intermediate: collaborative
      return [
        ...header,
        "1. Ask: 'What approach do you have in mind for this module?'",
        "2. If they propose something correct, implement together.",
        "3. If they have gaps, point them out with questions.",
        "4. You can show code with blanks (___) for them to complete.",
        "5. At the end ask about trade-offs.",
      ].join("\n")
    }

    // Advanced: review-based
    return [
      ...header,
      "Implement the module. While you do:",
      "- Challenge key decisions: 'Agree with this choice? Why not X?'",
      "- Point out edge cases and possible improvements.",
    ].join("\n")
  }

  // ── Should Accompany? ────────────────────────────────────

  /**
   * Determine if a new implementation should be accompanied,
   * based on user level and accompaniment ratio.
   */
  export function shouldAccompany(
    userLevel: LevelsNS.UserLevel,
    mode: "learn" | "productive",
  ): boolean {
    // In productive mode, reduce accompaniment
    const ratios: Record<LevelsNS.UserLevel, { learn: number; productive: number }> = {
      1: { learn: 1.0, productive: 0.7 },
      2: { learn: 0.8, productive: 0.5 },
      3: { learn: 0.5, productive: 0.2 },
      4: { learn: 0.1, productive: 0.0 },
      5: { learn: 0.0, productive: 0.0 },
    }

    const ratio = ratios[userLevel][mode]
    // For deterministic behavior: always accompany if ratio >= 0.5
    return ratio >= 0.5
  }
}
