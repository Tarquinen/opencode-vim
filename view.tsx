/** @jsxImportSource @opentui/solid */
import type { TextRenderable } from "@opentui/core"
import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js"
import type { VimMode } from "./src/modules/vim/state"

type VimStatusProps = {
  mode: Accessor<VimMode>
  pending: Accessor<string | undefined>
  enabled: Accessor<boolean>
  theme: {
    info: TextRenderable["fg"]
    success: TextRenderable["fg"]
    warning: TextRenderable["fg"]
    textMuted: TextRenderable["fg"]
  }
  pendingDisplayDelay?: number
}

export function VimStatus(props: VimStatusProps) {
  const [pending, setPending] = createSignal<string>()
  createEffect(() => {
    const value = props.enabled() ? props.pending() : undefined
    const delay = props.pendingDisplayDelay ?? 120
    if (!value || delay <= 0) {
      setPending(value)
      return
    }
    const timer = setTimeout(() => setPending(value), delay)
    onCleanup(() => clearTimeout(timer))
  })

  return (
    <box paddingRight={1} flexDirection="row">
      <text fg={props.theme.info}>{props.enabled() && pending() ? `${pending()} ` : ""}</text>
      <text fg={props.mode() === "insert" ? props.theme.success : props.theme.warning}>
        {props.enabled() ? modeLabel(props.mode()) : ""}
      </text>
    </box>
  )
}

function modeLabel(mode: VimMode) {
  if (mode === "visual") return "VISUAL"
  if (mode === "visual-line") return "VISUAL LINE"
  return mode === "normal" ? "NORMAL" : "INSERT"
}
