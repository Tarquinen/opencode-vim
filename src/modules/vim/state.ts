import { createSignal } from "solid-js"
import type { VimLog } from "./log"

export type VimMode = "normal" | "insert" | "visual" | "visual-line"
export type VimStateListener = () => void

export function createVimState(defaultMode: VimMode, log: VimLog = () => {}) {
    const [mode, setMode] = createSignal<VimMode>(defaultMode)
    const [pending, setPending] = createSignal("")
    const listeners = new Set<VimStateListener>()

    log("state.init", { mode: defaultMode })

    return {
        mode,
        setMode(next: VimMode) {
            const changed = mode() !== next
            if (changed) log("state.mode", { from: mode(), to: next })
            setMode(next)
            if (changed) notify()
        },
        pending,
        setPending(next: string) {
            const changed = pending() !== next
            if (changed) log("state.pending", { from: pending(), to: next })
            setPending(next)
            if (changed) notify()
        },
        subscribe(listener: VimStateListener) {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
    }

    function notify() {
        for (const listener of listeners) listener()
    }
}
