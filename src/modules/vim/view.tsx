/** @jsxImportSource @opentui/solid */
import { createSignal, onCleanup } from "solid-js"
import type { Accessor } from "solid-js"
import type { VimLog } from "./log"
import type { VimMode } from "./state"

const STATUS_SYNC_MS = 50

type VimStatusProps = {
    mode: Accessor<VimMode>
    pending: Accessor<string | undefined>
    disabled?: boolean
    log?: VimLog
    requestRender?: () => void
}

export function VimStatus(props: VimStatusProps) {
    const [mode, setMode] = createSignal(props.mode())
    const [pending, setPending] = createSignal(props.pending())

    const sync = () => {
        const nextMode = props.mode()
        const nextPending = props.pending()
        if (mode() !== nextMode || pending() !== nextPending) {
            props.log?.("status.sync", { fromMode: mode(), toMode: nextMode, fromPending: pending(), toPending: nextPending })
            setMode(nextMode)
            setPending(nextPending)
            props.requestRender?.()
        }
    }

    const timer = setInterval(sync, STATUS_SYNC_MS)
    onCleanup(() => clearInterval(timer))

    return (
        <box paddingLeft={1} paddingRight={1} flexDirection="row">
            {pending() ? <text fg="cyan">{pending()} </text> : undefined}
            <text fg={props.disabled ? "gray" : mode() === "normal" ? "yellow" : "green"}>{mode() === "normal" ? "NORMAL" : "INSERT"}</text>
        </box>
    )
}
