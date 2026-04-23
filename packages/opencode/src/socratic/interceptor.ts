/**
 * Tool interceptor for SocraticCode.
 *
 * Intercepts Write/Edit tool calls based on user level + mode.
 * Generates directives that modify how the LLM uses code-writing tools.
 *
 * Level × Mode behavior:
 *   Novato (1-2): Allow write but inject line-by-line explanation + verification
 *   Intermedio + learn (3): Transform to gapped code
 *   Intermedio + productive (3): Allow with brief explanation
 *   Avanzado/Experto (4-5): Allow freely
 */

import type { Levels as LevelsNS } from "./levels"
import type { Modes as ModesNS } from "./modes"
import { Gaps } from "./gaps"

export namespace Interceptor {
  // ── Decision Types ───────────────────────────────────────

  export type Action =
    | "allow"                    // No modification
    | "allow_with_explanation"   // Allow but add explanation directive
    | "transform_to_gaps"       // Use gapped code instead

  export interface Decision {
    action: Action
    directive: string | null
    explainLines: boolean
    verifyAfter: boolean
  }

  // ── Tool Interception ─────��──────────────────────────────

  const CODE_TOOLS = new Set(["write", "edit", "multi_edit"])

  /**
   * Determine how a tool call should be handled based on level + mode.
   * Returns a Decision with the action and any directives to inject.
   */
  export function intercept(
    toolName: string,
    userLevel: LevelsNS.UserLevel,
    mode: ModesNS.Mode,
  ): Decision {
    // Only intercept code-writing tools
    if (!CODE_TOOLS.has(toolName.toLowerCase())) {
      return { action: "allow", directive: null, explainLines: false, verifyAfter: false }
    }

    // Novice (1-2): explain everything
    if (userLevel <= 2) {
      return {
        action: "allow_with_explanation",
        directive: [
          "WRITE INTERCEPTION — NOVICE LEVEL:",
          "Before writing/editing this file:",
          "1. Explain WHAT you will do and WHY.",
          "2. When writing, comment the key lines in simple language.",
          "3. After writing, ask ONE verification question.",
          '   Example: "Do you understand why we use async here?"',
        ].join("\n"),
        explainLines: true,
        verifyAfter: true,
      }
    }

    // Intermediate + learn: gapped code
    if (userLevel === 3 && mode === "learn") {
      return {
        action: "transform_to_gaps",
        directive: Gaps.getGapDirective(),
        explainLines: false,
        verifyAfter: false,
      }
    }

    // Intermediate + productive: brief explanation
    if (userLevel === 3 && mode === "productive") {
      return {
        action: "allow_with_explanation",
        directive: [
          "WRITE INTERCEPTION — INTERMEDIATE PRODUCTIVE:",
          "Write the code directly. Only explain the NON-OBVIOUS:",
          "- Design decisions that aren't self-evident",
          "- Workarounds or necessary hacks",
          "- Configurations that might surprise",
        ].join("\n"),
        explainLines: false,
        verifyAfter: false,
      }
    }

    // Advanced/Expert: no interception
    return { action: "allow", directive: null, explainLines: false, verifyAfter: false }
  }

  /**
   * Get a persistent directive about tool usage for the entire session.
   * This is injected once into the system prompt, not per-tool-call.
   */
  export function getSessionDirective(
    userLevel: LevelsNS.UserLevel,
    mode: ModesNS.Mode,
  ): string | null {
    // Level 1 HARD block — numeric limits + 4-phase protocol. These are the
    // non-negotiables a novice needs to prevent runaway codegen that outpaces
    // comprehension. Model compliance only — opencode's tool layer does not
    // pre-approve tool calls, so enforcement is the model following this block.
    if (userLevel === 1) {
      return [
        "── LEVEL 1 HARD LIMITS (critical, not optional) ──",
        "DO NOT call Write / Edit / MultiEdit until the user has EXPLICITLY approved",
        "your plan IN THIS TURN. Approval from past turns DOES NOT COUNT — re-confirm.",
        "MAX 30 lines of code per response. MAX 1 file touched.",
        "",
        "BEFORE any code, your response MUST contain (in order):",
        "  (1) RESTATE: reformulate the user's request in your own words.",
        "  (2) PLAN: 3-6 bullets, each with file + estimated line count.",
        "  (3) TEACH: explain the prerequisite concept with an analogy, no code yet.",
        "  (4) ASK: ONE comprehension question (not preference). Then END the turn.",
        "      No tool calls this turn.",
        "",
        "Comprehension questions — GOOD vs BAD:",
        "  GOOD: \"Why do we pick X and not Y?\" / \"If we change A to B, what breaks?\"",
        "        \"Explain in your own words what this function will do.\"",
        "  BAD:  \"Does that make sense?\" / \"Any questions?\" / \"A or B?\"",
        "",
        "Override handling:",
        "  If the user says \"just write it\" / \"I already know this\" / \"stop asking\":",
        "  acknowledge in ONE line, proceed this turn only, then suggest /level 3.",
      ].join("\n")
    }

    if (userLevel === 2) {
      return [
        "CODE WRITING RULE (Basic):",
        "When you use the Write or Edit tools:",
        "- Explain the WHY behind non-trivial decisions BEFORE the code.",
        "- Block-by-block, NOT line-by-line.",
        "- ONE verification question per new concept (not per file).",
        "- Do not re-teach vocabulary the user has used correctly this session.",
      ].join("\n")
    }

    if (userLevel === 3 && mode === "learn") {
      return [
        "CODE WRITING RULE:",
        "When you write code, use blanks (___) in key values for the user to complete.",
        Gaps.getGapDirective(),
      ].join("\n")
    }

    if (userLevel === 3 && mode === "productive") {
      return [
        "CODE WRITING RULE:",
        "Write code directly. Briefly explain only non-obvious decisions.",
      ].join("\n")
    }

    // Advanced/Expert: no special directive
    return null
  }
}
