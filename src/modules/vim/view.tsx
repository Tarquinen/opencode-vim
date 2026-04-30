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
    theme: PromptContext["api"]["theme"]["current"]
    pendingDisplayDelay?: number
    disabled?: boolean
    log?: VimLog
    requestRender?: () => void
}

export function VimStatus(props: VimStatusProps) {
    const [mode, setMode] = createSignal(props.mode())
    const [pending, setPending] = createSignal<string | undefined>()
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

        syncPending(nextPending)
    }

    const timer = setInterval(sync, STATUS_SYNC_MS)
    onCleanup(() => {
        clearInterval(timer)
        if (pendingTimer) clearTimeout(pendingTimer)
    })

    return (
        <box paddingLeft={1} paddingRight={1} flexDirection="row">
            {pending() ? <text fg={props.theme.info}>{pending()} </text> : undefined}
            <text fg={props.disabled ? props.theme.textMuted : mode() === "normal" ? props.theme.warning : props.theme.success}>{mode() === "normal" ? "NORMAL" : "INSERT"}</text>
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
