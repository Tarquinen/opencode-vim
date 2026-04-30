import type { TuiPromptInfo, TuiPromptRef } from "@opencode-ai/plugin/tui"
import type { PromptContext } from "../../prompt/types"
import type { VimAction } from "./state"
import type { createVimState } from "./state"

type VimState = ReturnType<typeof createVimState>

export function runVimAction(action: VimAction, state: VimState, ctx: PromptContext) {
    const ref = ctx.prompt()

    switch (action) {
        case "normal":
            state.setMode("normal")
            return true
        case "insert":
        case "append":
            state.setMode("insert")
            ref?.focus()
            return true
        case "appendEnd":
            state.setMode("insert")
            ref?.focus()
            return true
        case "deleteChar":
            if (!ref) return true
            setInput(ref, ref.current.input.slice(1))
            return true
        case "clear":
            if (!ref) return true
            setInput(ref, "")
            return true
        case "clearInsert":
            if (ref) setInput(ref, "")
            state.setMode("insert")
            ref?.focus()
            return true
        case "submit":
            ref?.submit()
            return true
        case "left":
        case "right":
        case "lineStart":
        case "lineEnd":
        case "wordNext":
        case "wordPrev":
            return true
    }
}

function setInput(ref: TuiPromptRef, input: string) {
    ref.set(toPromptInfo(ref, input))
}

function toPromptInfo(ref: TuiPromptRef, input: string): TuiPromptInfo {
    return {
        input,
        mode: ref.current.mode,
        parts: [...ref.current.parts],
    }
}
