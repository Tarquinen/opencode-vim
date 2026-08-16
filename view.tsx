/** @jsxImportSource @opentui/solid */
import type { TextRenderable } from "@opentui/core"
import { onCleanup, type Accessor } from "solid-js"
import type { VimLog } from "./src/modules/vim/log"
import type { VimMode, VimStateListener } from "./src/modules/vim/state"

const STATUS_SYNC_MS = 50

type VimStatusProps = {
  mode: Accessor<VimMode>
  pending: Accessor<string | undefined>
  subscribe: (listener: VimStateListener) => () => void
  enabled: Accessor<boolean>
  theme: {
    info: TextRenderable["fg"]
    success: TextRenderable["fg"]
    warning: TextRenderable["fg"]
    textMuted: TextRenderable["fg"]
  }
  pendingDisplayDelay?: number
  disabled?: boolean
  log?: VimLog
  requestRender?: () => void
}

export function VimStatus(props: VimStatusProps) {
  let modeText: TextRenderable | undefined
  let pendingText: TextRenderable | undefined
  let displayedMode = props.mode()
  let displayedPending: string | undefined
  let displayedEnabled = props.enabled()
  let pendingTimer: ReturnType<typeof setTimeout> | undefined
  let scheduledPending: string | undefined

  const sync = () => {
    const nextMode = props.mode()
    const nextPending = props.pending()
    let changed = false

    if (displayedMode !== nextMode) {
      props.log?.("status.sync", {
        fromMode: displayedMode,
        toMode: nextMode,
        fromPending: displayedPending,
        toPending: displayedPending,
      })
      displayedMode = nextMode
      changed = true
    }

    const nextEnabled = props.enabled()
    if (displayedEnabled !== nextEnabled) {
      props.log?.("status.enabled", { from: displayedEnabled, to: nextEnabled })
      displayedEnabled = nextEnabled
      changed = true
    }

    if (changed) updateModeText()
    syncPending(nextPending)
    if (changed) props.requestRender?.()
  }

  const unsubscribe = props.subscribe(sync)
  const timer = setInterval(sync, STATUS_SYNC_MS)
  onCleanup(() => {
    unsubscribe()
    clearInterval(timer)
    if (pendingTimer) clearTimeout(pendingTimer)
    modeText = undefined
    pendingText = undefined
  })

  return (
    <box paddingRight={1} flexDirection="row">
      <text
        ref={(ref: TextRenderable) => {
          pendingText = ref
          updatePendingText()
        }}
        fg={props.theme.info}
      >
        {displayedPending ? `${displayedPending} ` : ""}
      </text>
      <text
        ref={(ref: TextRenderable) => {
          modeText = ref
          updateModeText()
        }}
        fg={modeColor(displayedMode, displayedEnabled, props.theme, props.disabled)}
      >
        {displayedEnabled ? modeLabel(displayedMode) : ""}
      </text>
    </box>
  )

  function updateModeText() {
    if (!modeText) return
    modeText.content = displayedEnabled ? modeLabel(displayedMode) : ""
    modeText.fg = modeColor(displayedMode, displayedEnabled, props.theme, props.disabled)
  }

  function updatePendingText() {
    if (!pendingText) return
    pendingText.content = displayedEnabled && displayedPending ? `${displayedPending} ` : ""
  }

  function syncPending(nextPending: string | undefined) {
    if (!nextPending) {
      if (pendingTimer) clearTimeout(pendingTimer)
      pendingTimer = undefined
      scheduledPending = undefined
      setDisplayedPending(undefined)
      return
    }

    if (displayedPending === nextPending || scheduledPending === nextPending) return

    if (pendingTimer) clearTimeout(pendingTimer)
    scheduledPending = nextPending
    const delay = props.pendingDisplayDelay ?? 120
    if (delay <= 0) {
      scheduledPending = undefined
      setDisplayedPending(nextPending)
      return
    }

    pendingTimer = setTimeout(() => {
      pendingTimer = undefined
      scheduledPending = undefined
      if (props.pending() === nextPending) setDisplayedPending(nextPending)
    }, delay)
  }

  function setDisplayedPending(nextPending: string | undefined) {
    if (displayedPending === nextPending) return
    props.log?.("status.sync", {
      fromMode: displayedMode,
      toMode: displayedMode,
      fromPending: displayedPending,
      toPending: nextPending,
    })
    displayedPending = nextPending
    updatePendingText()
    props.requestRender?.()
  }
}

function modeColor(mode: VimMode, enabled: boolean, theme: VimStatusProps["theme"], disabled?: boolean) {
  if (!enabled) return undefined
  if (disabled) return theme.textMuted
  return mode === "insert" ? theme.success : theme.warning
}

function modeLabel(mode: VimMode) {
  if (mode === "visual") return "VISUAL"
  if (mode === "visual-line") return "VISUAL LINE"
  return mode === "normal" ? "NORMAL" : "INSERT"
}
