import { TextAttributes } from "@opentui/core"
import { useTheme } from "../context/theme"
import { useDialog } from "@tui/ui/dialog"
import { useToast } from "../ui/toast"
import { Calibration } from "@/socratic/calibration"
import { Levels } from "@/socratic/levels"
import { useKeyboard } from "@opentui/solid"
import { createSignal, Show } from "solid-js"

export function DialogCalibration() {
  const { theme } = useTheme()
  const dialog = useDialog()
  const toast = useToast()
  const [selected, setSelected] = createSignal<number | null>(null)

  const levels = [
    { level: 1 as const, label: "Novice", desc: "I'm just starting. I need detailed explanations." },
    { level: 2 as const, label: "Basic", desc: "I know the fundamentals but I need guidance." },
    { level: 3 as const, label: "Intermediate", desc: "I program regularly. I can work with some help." },
    { level: 4 as const, label: "Advanced", desc: "Solid experience. I prefer challenges." },
    { level: 5 as const, label: "Expert", desc: "I master multiple technologies. I just need a colleague." },
  ]

  useKeyboard((evt) => {
    const num = parseInt(evt.name ?? "", 10)
    if (num >= 1 && num <= 5) {
      try {
        Calibration.completeInitialCalibration(num as Levels.UserLevel)
        setSelected(num)
        const name = Levels.getProfile(num as Levels.UserLevel).label
        toast.show({ variant: "info", message: `Welcome! Level: ${num} - ${name}. Use /level to change.` })
        dialog.clear()
      } catch {
        toast.show({ variant: "error", message: "Error setting level" })
      }
      return
    }
    if (evt.name === "escape") {
      // Default to level 3 (intermediate) if user skips
      try {
        Calibration.completeInitialCalibration(3)
        toast.show({ variant: "info", message: "Default level: 3 - Intermediate. Use /level to change." })
      } catch {}
      dialog.clear()
      return
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} paddingBottom={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text} attributes={TextAttributes.BOLD}>
          Welcome to SocraticCode
        </text>
        <text fg={theme.textMuted} onMouseUp={() => dialog.clear()}>
          esc
        </text>
      </box>
      <text fg={theme.text}>
        To adapt my teaching, I need to know your level.
      </text>
      <text fg={theme.text}>
        Press a number (1-5):
      </text>
      <box>
        {levels.map((l) => (
          <text fg={selected() === l.level ? theme.accent : theme.text}>
            {"  "}{l.level}. <b>{l.label}</b> — {l.desc}
          </text>
        ))}
      </box>
      <text fg={theme.textMuted}>
        You can change it anytime with /level
      </text>
    </box>
  )
}
