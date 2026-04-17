/**
 * Pedagogical Profile for SocraticCode.
 *
 * Manages the persistent user profile that tracks learning patterns:
 * - Comprehension speed (how quickly the user grasps concepts)
 * - Copy tendency (how likely responses are AI-generated)
 * - Weaknesses and strengths (top topics by domain)
 * - Streak tracking (consecutive active days)
 * - Profile-based directives injected into the system prompt
 */

import { SocraticDB } from "./db"
import { Levels, type Levels as LevelsNS } from "./levels"

export namespace Profile {
  // ── Types ─────────────────────────────────────────────────

  export interface ProfileSnapshot {
    globalLevel: LevelsNS.UserLevel
    mode: "learn" | "productive"
    comprehensionSpeed: number
    copyTendency: number
    totalSessions: number
    totalConceptsLearned: number
    streakDays: number
    lastActiveDate: string | null
    calibrationCompleted: boolean
    userOverride: boolean
    weaknesses: TopicEntry[]
    strengths: TopicEntry[]
    domainLevels: DomainEntry[]
    antipatterns: AntipatternEntry[]
  }

  export interface AntipatternEntry {
    errorClass: string
    label: string
    occurrenceCount: number
    correctStreak: number
    active: boolean
    lastSeen: number
  }

  export interface TopicEntry {
    topic: string
    domain: string
    count: number
  }

  export interface DomainEntry {
    domain: string
    level: LevelsNS.UserLevel
    confidence: number
    totalInteractions: number
  }

  // ── Load Profile ──────────────────────────────────────────

  /**
   * Load the full pedagogical profile snapshot from the database.
   * Returns null if no profile exists.
   */
  export function load(): ProfileSnapshot | null {
    const profile = SocraticDB.getProfile()
    if (!profile) return null

    const weaknesses = SocraticDB.getTopWeaknesses(10).map((w) => ({
      topic: w.topic,
      domain: w.domain,
      count: w.fail_count,
    }))

    const strengths = SocraticDB.getTopStrengths(10).map((s) => ({
      topic: s.topic,
      domain: s.domain,
      count: s.success_count,
    }))

    const domainLevels = SocraticDB.getAllDomainLevels().map((d) => ({
      domain: d.domain,
      level: Levels.clampLevel(d.level),
      confidence: d.confidence,
      totalInteractions: d.total_interactions,
    }))

    const antipatterns = SocraticDB.getAllAntipatterns().map((a) => ({
      errorClass: a.error_class,
      label: a.label,
      occurrenceCount: a.occurrence_count,
      correctStreak: a.correct_streak,
      active: a.active === 1,
      lastSeen: a.last_seen,
    }))

    return {
      globalLevel: Levels.clampLevel(profile.global_level),
      mode: (profile.preferred_mode as "learn" | "productive") ?? "learn",
      comprehensionSpeed: profile.comprehension_speed,
      copyTendency: profile.copy_tendency,
      totalSessions: profile.total_sessions,
      totalConceptsLearned: profile.total_concepts_learned,
      streakDays: profile.streak_days,
      lastActiveDate: profile.last_active_date,
      calibrationCompleted: profile.calibration_completed === 1,
      userOverride: profile.user_override === 1,
      weaknesses,
      strengths,
      domainLevels,
      antipatterns,
    }
  }

  // ── Streak Tracking ───────────────────────────────────────

  /**
   * Update the streak counter based on the current date.
   * Call at the start of each session.
   *
   * Rules:
   * - Same day: no change
   * - Next day: streak +1
   * - Gap of 2+ days: streak resets to 1
   */
  export function updateStreak(): void {
    const profile = SocraticDB.getProfile()
    if (!profile) return

    const today = toDateString(new Date())
    const lastActive = profile.last_active_date

    if (lastActive === today) {
      // Already active today, no update needed
      return
    }

    if (!lastActive) {
      // First ever session
      SocraticDB.updateProfile({
        streak_days: 1,
        last_active_date: today,
      })
      return
    }

    const daysDiff = daysBetween(lastActive, today)

    if (daysDiff === 1) {
      // Consecutive day — extend streak
      SocraticDB.updateProfile({
        streak_days: profile.streak_days + 1,
        last_active_date: today,
      })
    } else {
      // Gap — reset streak
      SocraticDB.updateProfile({
        streak_days: 1,
        last_active_date: today,
      })
    }
  }

  /**
   * Increment total sessions counter.
   * Call at the start of each session.
   */
  export function incrementSessionCount(): void {
    const profile = SocraticDB.getProfile()
    if (!profile) return

    SocraticDB.updateProfile({
      total_sessions: profile.total_sessions + 1,
    })
  }

  /**
   * Add to the total concepts learned counter.
   */
  export function addConceptsLearned(count: number): void {
    if (count <= 0) return
    const profile = SocraticDB.getProfile()
    if (!profile) return

    SocraticDB.updateProfile({
      total_concepts_learned: profile.total_concepts_learned + count,
    })
  }

  // ── Profile Directives ────────────────────────────────────

  /**
   * Generate directive strings for injection into the system prompt
   * based on the current profile state.
   *
   * These directives tell the LLM how to adjust its behavior
   * based on the user's learning patterns.
   */
  export function getDirectives(snapshot: ProfileSnapshot): string[] {
    const directives: string[] = []

    // Comprehension speed directives
    if (snapshot.comprehensionSpeed < 0.3) {
      directives.push(
        "LOW COMPREHENSION SPEED: Simplify explanations more. " +
          "Use everyday language. Break large concepts into smaller parts. " +
          "Verify comprehension after each point.",
      )
    } else if (snapshot.comprehensionSpeed > 0.7) {
      directives.push(
        "HIGH COMPREHENSION SPEED: You can be more direct and concise. " +
          "You don't need to explain basic concepts. " +
          "The user catches on quickly, prioritize depth over breadth.",
      )
    }

    // Copy tendency directives
    if (snapshot.copyTendency > 0.5) {
      directives.push(
        "HIGH COPY TENDENCY: Increase probing in the user's responses. " +
          "Ask them to explain in their own words. " +
          'Ask "what happens if I change X?" to verify real understanding.',
      )
    } else if (snapshot.copyTendency > 0.3) {
      directives.push(
        "MODERATE COPY TENDENCY: Occasionally ask for original elaboration " +
          "to verify that the user isn't just repeating answers.",
      )
    }

    // Weakness directives
    if (snapshot.weaknesses.length > 0) {
      const weakTopics = snapshot.weaknesses
        .slice(0, 5)
        .map((w) => `${w.topic} (${w.domain})`)
        .join(", ")
      directives.push(
        `USER'S WEAK TOPICS: ${weakTopics}. ` +
          "If the current topic relates to any of these, reinforce with more detail " +
          "and connect with what the user already knows.",
      )
    }

    // Strength directives
    if (snapshot.strengths.length > 0) {
      const strongTopics = snapshot.strengths
        .slice(0, 5)
        .map((s) => `${s.topic} (${s.domain})`)
        .join(", ")
      directives.push(
        `USER'S STRONG TOPICS: ${strongTopics}. ` +
          "You can use these as analogies when explaining new concepts. " +
          "You don't need to explain these topics in detail.",
      )
    }

    // Streak motivation (only for active learners)
    if (snapshot.streakDays >= 7) {
      directives.push(
        `The user has been practicing for ${snapshot.streakDays} consecutive days. ` +
          "Acknowledge their consistency when relevant (without empty praise).",
      )
    }

    // Domain level awareness
    if (snapshot.domainLevels.length > 0) {
      const domainSummary = snapshot.domainLevels
        .filter((d) => d.confidence > 0.3)
        .map((d) => {
          const levelName = Levels.getProfile(d.level).label
          return `${d.domain}=${levelName}`
        })
        .join(", ")
      if (domainSummary) {
        directives.push(
          `KNOWN PER-DOMAIN LEVELS: ${domainSummary}. ` +
            "Adjust depth according to the specific domain of the current topic.",
        )
      }
    }

    return directives
  }

  // ── Summary for /profile command ──────────────────────────

  /**
   * Generate a human-readable summary of the profile for the /profile command.
   */
  export function formatSummary(snapshot: ProfileSnapshot): string {
    const levelProfile = Levels.getProfile(snapshot.globalLevel)
    const lines: string[] = []

    lines.push("═══ Pedagogical Profile ═══")
    lines.push("")
    lines.push(`Global level: ${snapshot.globalLevel} - ${levelProfile.label}${snapshot.userOverride ? " (manual)" : ""}`)
    lines.push(`Mode: ${snapshot.mode === "learn" ? "Learn" : "Productive"}`)
    lines.push(`Comprehension speed: ${formatPercent(snapshot.comprehensionSpeed)}`)
    lines.push(`Copy tendency: ${formatPercent(snapshot.copyTendency)}`)
    lines.push("")
    lines.push(`Total sessions: ${snapshot.totalSessions}`)
    lines.push(`Concepts learned: ${snapshot.totalConceptsLearned}`)
    lines.push(`Current streak: ${snapshot.streakDays} day${snapshot.streakDays !== 1 ? "s" : ""}`)

    if (snapshot.domainLevels.length > 0) {
      lines.push("")
      lines.push("── Per-domain levels ──")
      for (const d of snapshot.domainLevels) {
        const lvlName = Levels.getProfile(d.level).label
        const conf = formatPercent(d.confidence)
        lines.push(`  ${d.domain}: ${d.level}-${lvlName} (confidence: ${conf}, interactions: ${d.totalInteractions})`)
      }
    }

    if (snapshot.weaknesses.length > 0) {
      lines.push("")
      lines.push("── Topics to reinforce ──")
      for (const w of snapshot.weaknesses.slice(0, 5)) {
        lines.push(`  ${w.topic} (${w.domain}) — ${w.count} error${w.count !== 1 ? "s" : ""}`)
      }
    }

    if (snapshot.strengths.length > 0) {
      lines.push("")
      lines.push("── Mastered topics ──")
      for (const s of snapshot.strengths.slice(0, 5)) {
        lines.push(`  ${s.topic} (${s.domain}) — ${s.count} correct answer${s.count !== 1 ? "s" : ""}`)
      }
    }

    const activeAntipatterns = snapshot.antipatterns.filter((a) => a.active)
    if (activeAntipatterns.length > 0) {
      lines.push("")
      lines.push("── Active anti-patterns (mentor actively watches for these) ──")
      for (const a of activeAntipatterns) {
        lines.push(`  ${a.label} — ${a.occurrenceCount} occurrence${a.occurrenceCount !== 1 ? "s" : ""}`)
      }
    }

    return lines.join("\n")
  }

  // ── Helpers ───────────────────────────────────────────────

  function toDateString(date: Date): string {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  function daysBetween(dateStrA: string, dateStrB: string): number {
    const a = new Date(dateStrA + "T00:00:00")
    const b = new Date(dateStrB + "T00:00:00")
    const diffMs = Math.abs(b.getTime() - a.getTime())
    return Math.round(diffMs / (1000 * 60 * 60 * 24))
  }

  function formatPercent(value: number): string {
    return `${Math.round(value * 100)}%`
  }
}
