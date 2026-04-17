/**
 * Feynman teach-mode for SocraticCode (Phase 11.3).
 *
 * When active, the role inverts: the user explains a topic and the agent
 * plays a curious student who probes the explanation for gaps, ambiguities,
 * and unjustified claims. Activated via /teach <topic>, terminated via
 * /endteach (or auto-terminates when session ends).
 */

import type { Levels as LevelsNS } from "./levels"

export namespace Feynman {
  export interface FeynmanState {
    active: boolean
    topic: string
    startedAt: number
    turnCount: number
    /** Short excerpts of the user's explanation, kept for the final summary. */
    userExcerpts: string[]
    /** Ambiguity/gap notes accumulated across turns (LLM-reported, best-effort). */
    gapsDetected: string[]
  }

  /**
   * Module-level queue: holds a topic when /teach is typed before any session
   * exists. Consumed when the first session state is created, then cleared.
   */
  let pendingTopic: string | null = null

  export function queueTeach(topic: string): void {
    pendingTopic = topic.trim() || "unspecified topic"
  }

  export function consumeQueued(): string | null {
    const t = pendingTopic
    pendingTopic = null
    return t
  }

  export function hasQueued(): boolean {
    return pendingTopic !== null
  }

  export function createState(topic: string): FeynmanState {
    return {
      active: true,
      topic: topic.trim() || "unspecified topic",
      startedAt: Date.now(),
      turnCount: 0,
      userExcerpts: [],
      gapsDetected: [],
    }
  }

  export function createIdle(): FeynmanState {
    return {
      active: false,
      topic: "",
      startedAt: 0,
      turnCount: 0,
      userExcerpts: [],
      gapsDetected: [],
    }
  }

  /**
   * The full system prompt for Feynman mode. REPLACES the normal base/level
   * prompts — the student persona is uniform regardless of user level. The
   * directive explicitly overrides adulation-detection rules that assume the
   * agent is the teacher.
   */
  export function buildPrompt(state: FeynmanState): string {
    return [
      "── FEYNMAN TEACH MODE ACTIVE ──",
      "",
      "Role inversion: the USER is the teacher, YOU are a curious student who",
      `just encountered "${state.topic}" for the first time. You are eager to`,
      "understand but you do not pretend to know things you do not.",
      "",
      "Your job each turn:",
      "  1. Read the user's explanation carefully.",
      "  2. Identify up to 3-5 SPECIFIC weaknesses: vague phrases, undefined terms,",
      "     unjustified claims, missing edge cases, or hidden assumptions.",
      "  3. Ask ONE focused probing question for EACH weakness. Short, direct,",
      "     no padding. No summary, no compliments, no meta-commentary.",
      "",
      "Good probes:",
      '  - "What exactly do you mean by X?"',
      '  - "Give me a concrete example where this would NOT apply."',
      '  - "If I change Y in your example, does your explanation still hold?"',
      '  - "You said Z — how is that different from W?"',
      "",
      "Bad probes (do NOT do):",
      "  - Yes/no questions that accept hand-waving.",
      "  - Questions about topics the user did not bring up.",
      "  - Praise disguised as a question.",
      "",
      "Rules:",
      "  - Never explain the topic yourself. You are a student, not a teacher.",
      "  - If the explanation is solid, acknowledge briefly and push ONE level",
      "    deeper (edge cases, trade-offs, why-this-and-not-that).",
      "  - If the explanation is vague, demand precision before moving on.",
      "  - Match the user's language (EN/ES). Keep turns concise (<15 lines).",
      "",
      "METADATA: end every response with [HINT_META:{\"correct\":null,\"topic\":\"" +
        state.topic +
        "\",\"domain\":\"feynman\",\"level\":\"teach\"}]",
      "If the user's explanation this turn was solid, set \"correct\":true.",
      "If it was vague or wrong, set \"correct\":false.",
    ].join("\n")
  }

  /**
   * Record one turn. Keeps an excerpt and increments the counter.
   */
  export function recordTurn(state: FeynmanState, userMessage: string): void {
    state.turnCount++
    const excerpt = userMessage.slice(0, 200).replace(/\s+/g, " ").trim()
    if (excerpt) state.userExcerpts.push(excerpt)
  }

  /**
   * Build the end-of-session summary shown when /endteach is issued.
   * Summarizes duration, turns, topic, and a study recommendation.
   */
  export function summarize(state: FeynmanState, userLevel: LevelsNS.UserLevel): string {
    const minutes = Math.max(1, Math.round((Date.now() - state.startedAt) / 60000))
    const lines: string[] = [
      `Feynman session on "${state.topic}" ended.`,
      `Turns: ${state.turnCount} · Duration: ${minutes} min`,
    ]

    if (state.turnCount === 0) {
      lines.push("No explanation captured. Try /teach again and explain in your own words.")
      return lines.join("\n")
    }

    if (state.turnCount < 3) {
      lines.push("Short session — the agent barely had time to probe. Aim for 5+ turns next time.")
    } else {
      lines.push(
        userLevel <= 2
          ? "Good practice. Review the points where you hesitated — those are the real gaps."
          : "Solid run. The spots where probes stacked up are worth a second pass.",
      )
    }

    return lines.join("\n")
  }
}
