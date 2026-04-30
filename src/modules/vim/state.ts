import { createSignal } from "solid-js"
import type { VimLog } from "./log"

export type VimMode = "normal" | "insert"

export function createVimState(defaultMode: VimMode, log: VimLog = () => {}) {
    const [mode, setMode] = createSignal<VimMode>(defaultMode)
    const [pending, setPending] = createSignal("")

    log("state.init", { mode: defaultMode })

    return {
        mode,
        setMode(next: VimMode) {
            if (mode() !== next) log("state.mode", { from: mode(), to: next })
            setMode(next)
        },
        pending,
        setPending(next: string) {
            if (pending() !== next) log("state.pending", { from: pending(), to: next })
            setPending(next)
        },
    }
}
