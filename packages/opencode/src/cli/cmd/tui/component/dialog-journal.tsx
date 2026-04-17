import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { Journal } from "@/socratic/journal"
import { createMemo, For, Show } from "solid-js"

type Mode = "latest" | "week" | "month"

interface Props {
  mode?: Mode
}

/**
 * Journal dialog (/journal, /journal week, /journal month).
 * Shows per-session entries, weekly rollup, or monthly rollup with ASCII chart.
 */
export function DialogSocraticJournal(props: Props) {
  const { theme } = useTheme()
  const dialog = useDialog()
  const mode: Mode = props.mode ?? "latest"

  const title = () =>
    mode === "week"
      ? "Weekly Rollup (7 days)"
      : mode === "month"
        ? "Monthly Rollup (30 days)"
        : "Pedagogical Journal (latest entries)"

  const body = createMemo(() => {
    try {
      if (mode === "week") {
        const entries = Journal.getRange(Journal.daysAgo(7), Date.now())
        return Journal.formatWeeklyRollup(entries)
      }
      if (mode === "month") {
        const entries = Journal.getRange(Journal.daysAgo(30), Date.now())
        return Journal.formatMonthlyRollup(entries)
      }
      const entries = Journal.getLatest(7)
      return Journal.formatLatest(entries)
    } catch {
      return "Could not load journal (DB unavailable?)."
    }
  })

  const lines = createMemo(() => body().split("\n"))

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          {title()}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <Show when={lines().length > 0} fallback={<text fg={theme.textMuted}>No journal entries yet.</text>}>
        <For each={lines()}>
          {(line) => <text fg={theme.text}>{line}</text>}
        </For>
      </Show>
    </box>
  )
}
