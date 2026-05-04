/** @jsxImportSource @opentui/solid */
import { createSignal, onCleanup } from "solid-js"
import type { Accessor } from "solid-js"
import type { PromptContext } from "../../prompt/types"
import type { VimLog } from "./log"
import type { VimMode } from "./state"

const STATUS_SYNC_MS = 50

type VimStatusProps = {
    mode: Accessor<VimMode>
    pending: Accessor<string | undefined>
    enabled: Accessor<boolean>
    theme: PromptContext["api"]["theme"]["current"]
    pendingDisplayDelay?: number
    disabled?: boolean
    log?: VimLog
    requestRender?: () => void
}

export function VimStatus(props: VimStatusProps) {
    const [mode, setMode] = createSignal(props.mode())
    const [pending, setPending] = createSignal<string | undefined>()
    const [enabled, setEnabled] = createSignal(props.enabled())
    let pendingTimer: ReturnType<typeof setTimeout> | undefined
    let scheduledPending: string | undefined

    const sync = () => {
        const nextMode = props.mode()
        const nextPending = props.pending()

        if (mode() !== nextMode) {
            props.log?.("status.sync", { fromMode: mode(), toMode: nextMode, fromPending: pending(), toPending: pending() })
            setMode(nextMode)
            props.requestRender?.()
        }

        const nextEnabled = props.enabled()
        if (enabled() !== nextEnabled) {
            props.log?.("status.enabled", { from: enabled(), to: nextEnabled })
            setEnabled(nextEnabled)
            props.requestRender?.()
        }

        syncPending(nextPending)
    }

    const timer = setInterval(sync, STATUS_SYNC_MS)
    onCleanup(() => {
        clearInterval(timer)
        if (pendingTimer) clearTimeout(pendingTimer)
    })

    return (
        <box paddingLeft={1} paddingRight={1} flexDirection="row">
            {enabled() && pending() ? <text fg={props.theme.info}>{pending()} </text> : undefined}
            {enabled() ? <text fg={props.disabled ? props.theme.textMuted : mode() === "insert" ? props.theme.success : props.theme.warning}>{modeLabel(mode())}</text> : undefined}
        </box>
    )

    function syncPending(nextPending: string | undefined) {
        if (!nextPending) {
            if (pendingTimer) clearTimeout(pendingTimer)
            pendingTimer = undefined
            scheduledPending = undefined
            setDisplayedPending(undefined)
            return
        }

        if (pending() === nextPending) return
        if (scheduledPending === nextPending) return

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
        if (pending() === nextPending) return
        props.log?.("status.sync", { fromMode: mode(), toMode: mode(), fromPending: pending(), toPending: nextPending })
        setPending(nextPending)
        props.requestRender?.()
    }
}

function modeLabel(mode: VimMode) {
    if (mode === "visual") return "VISUAL"
    if (mode === "visual-line") return "VISUAL LINE"
    return mode === "normal" ? "NORMAL" : "INSERT"
}
