import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { Profile } from "@/socratic/profile"
import { Levels } from "@/socratic/levels"
import { SocraticDB } from "@/socratic/db"
import { createMemo, For, Show } from "solid-js"

// ── Profile Dialog (/profile) ────────────────────────────────

export function DialogSocraticProfile() {
  const { theme } = useTheme()
  const dialog = useDialog()

  const snapshot = createMemo(() => Profile.load())

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Pedagogical Profile
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={snapshot()} fallback={<text fg={theme.textMuted}>No profile configured. Start a session to calibrate.</text>}>
        {(snap) => {
          const levelProfile = () => Levels.getProfile(snap().globalLevel)
          return (
            <box gap={1}>
              <box>
                <text fg={theme.text}>
                  <b>Level:</b> {snap().globalLevel} - {levelProfile().label}
                  {snap().userOverride ? " (manual)" : ""}
                </text>
                <text fg={theme.text}>
                  <b>Mode:</b> {snap().mode === "learn" ? "Learn" : "Productive"}
                </text>
                <text fg={theme.text}>
                  <b>Comprehension:</b> {Math.round(snap().comprehensionSpeed * 100)}%
                </text>
                <text fg={theme.text}>
                  <b>Copy tendency:</b> {Math.round(snap().copyTendency * 100)}%
                </text>
              </box>
              <box>
                <text fg={theme.text}>
                  <b>Sessions:</b> {snap().totalSessions} | <b>Concepts:</b> {snap().totalConceptsLearned} | <b>Streak:</b> {snap().streakDays} day{snap().streakDays !== 1 ? "s" : ""}
                </text>
              </box>
              <Show when={snap().domainLevels.length > 0}>
                <box>
                  <text fg={theme.text} attributes={TextAttributes.BOLD}>Per-domain levels</text>
                  <For each={snap().domainLevels}>
                    {(d) => (
                      <text fg={theme.text}>
                        {"  "}{d.domain}: {d.level}-{Levels.getProfile(d.level).label} (confidence: {Math.round(d.confidence * 100)}%)
                      </text>
                    )}
                  </For>
                </box>
              </Show>
              <Show when={snap().weaknesses.length > 0}>
                <box>
                  <text fg={theme.warning} attributes={TextAttributes.BOLD}>Topics to reinforce</text>
                  <For each={snap().weaknesses.slice(0, 5)}>
                    {(w) => (
                      <text fg={theme.text}>
                        {"  "}{w.topic} ({w.domain}) — {w.count} error{w.count !== 1 ? "s" : ""}
                      </text>
                    )}
                  </For>
                </box>
              </Show>
              <Show when={snap().strengths.length > 0}>
                <box>
                  <text fg={theme.success} attributes={TextAttributes.BOLD}>Mastered topics</text>
                  <For each={snap().strengths.slice(0, 5)}>
                    {(s) => (
                      <text fg={theme.text}>
                        {"  "}{s.topic} ({s.domain}) — {s.count} correct{s.count !== 1 ? "" : ""}
                      </text>
                    )}
                  </For>
                </box>
              </Show>
              <Show when={snap().antipatterns.filter((a) => a.active).length > 0}>
                <box>
                  <text fg={theme.warning} attributes={TextAttributes.BOLD}>Active anti-patterns</text>
                  <For each={snap().antipatterns.filter((a) => a.active)}>
                    {(a) => (
                      <text fg={theme.text}>
                        {"  "}{a.label} — {a.occurrenceCount}x
                      </text>
                    )}
                  </For>
                </box>
              </Show>
            </box>
          )
        }}
      </Show>
    </box>
  )
}

// ── Weaknesses Dialog (/weakness) ────────────────────────────

export function DialogSocraticWeaknesses() {
  const { theme } = useTheme()
  const dialog = useDialog()

  const weaknesses = createMemo(() => SocraticDB.getTopWeaknesses(10))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Topics to Reinforce
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show
        when={weaknesses().length > 0}
        fallback={<text fg={theme.textMuted}>No weak topics recorded.</text>}
      >
        <For each={weaknesses()}>
          {(w) => (
            <text fg={theme.text}>
              <span style={{ fg: theme.warning }}>•</span> {w.topic}{" "}
              <span style={{ fg: theme.textMuted }}>
                ({w.domain}) — {w.fail_count} error{w.fail_count !== 1 ? "s" : ""}, hint level {w.last_hint_level}
              </span>
            </text>
          )}
        </For>
      </Show>
    </box>
  )
}

// ── Strengths Dialog (/strengths) ────────────────────────────

export function DialogSocraticStrengths() {
  const { theme } = useTheme()
  const dialog = useDialog()

  const strengths = createMemo(() => SocraticDB.getTopStrengths(10))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Mastered Topics
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show
        when={strengths().length > 0}
        fallback={<text fg={theme.textMuted}>No mastered topics recorded.</text>}
      >
        <For each={strengths()}>
          {(s) => (
            <text fg={theme.text}>
              <span style={{ fg: theme.success }}>•</span> {s.topic}{" "}
              <span style={{ fg: theme.textMuted }}>
                ({s.domain}) — {s.success_count} correct
              </span>
            </text>
          )}
        </For>
      </Show>
    </box>
  )
}
