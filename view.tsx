/** @jsxImportSource @opentui/solid */
import type { TextRenderable } from "@opentui/core"
import type { Accessor } from "solid-js"
import type { VimMode } from "./src/modules/vim/state"

type VimStatusProps = {
  mode: Accessor<VimMode>
  enabled: Accessor<boolean>
  theme: {
    success: TextRenderable["fg"]
    warning: TextRenderable["fg"]
  }
}

export function VimStatus(props: VimStatusProps) {
  return (
    <box paddingRight={1} flexDirection="row">
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
