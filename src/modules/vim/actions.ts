import type { TuiPromptInfo, TuiPromptRef } from "@opencode-ai/plugin/tui"
import type { PromptContext } from "../../prompt/types"
import type { VimAction } from "./state"
import type { createVimState } from "./state"

type VimState = ReturnType<typeof createVimState>
type EditBufferLike = {
    focused?: boolean
    cursorOffset?: number
    visualCursor?: {
        visualRow: number
        visualCol: number
        logicalRow: number
        logicalCol: number
        offset: number
    }
    plainText?: string
    moveCursorLeft?: () => boolean
    moveCursorRight?: () => boolean
    moveCursorUp?: () => boolean
    moveCursorDown?: () => boolean
    gotoLineStart?: () => void
    gotoLineEnd?: () => void
    moveWordForward?: () => boolean
    moveWordBackward?: () => boolean
    deleteChar?: () => boolean
    gotoBufferEnd?: () => boolean | void
}

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
            movePromptCursor(ctx, "lineEnd")
            state.setMode("insert")
            ref?.focus()
            return true
        case "deleteChar":
            if (deletePromptChar(ctx)) return true
            if (ref) setInput(ref, ref.current.input.slice(1))
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
            movePromptCursor(ctx, "left")
            return true
        case "right":
            movePromptCursor(ctx, "right")
            return true
        case "up":
            movePromptCursor(ctx, "up")
            return true
        case "down":
            movePromptCursor(ctx, "down")
            return true
        case "lineStart":
            movePromptCursor(ctx, "lineStart")
            return true
        case "lineEnd":
            movePromptCursor(ctx, "lineEnd")
            return true
        case "wordNext":
            movePromptCursor(ctx, "wordNext")
            return true
        case "wordPrev":
            movePromptCursor(ctx, "wordPrev")
            return true
    }
}

function movePromptCursor(ctx: PromptContext, action: "left" | "right" | "up" | "down" | "lineStart" | "lineEnd" | "wordNext" | "wordPrev") {
    const input = focusedInput(ctx)
    if (!input) return false

    switch (action) {
        case "left":
            return moveBoundedHorizontal(input, "left")
        case "right":
            return moveBoundedHorizontal(input, "right")
        case "up":
            return input.moveCursorUp?.() ?? false
        case "down":
            return input.moveCursorDown?.() ?? false
        case "lineStart":
            input.gotoLineStart?.()
            return typeof input.gotoLineStart === "function"
        case "lineEnd":
            input.gotoLineEnd?.()
            return typeof input.gotoLineEnd === "function"
        case "wordNext":
            return input.moveWordForward?.() ?? false
        case "wordPrev":
            return input.moveWordBackward?.() ?? false
    }
}

function moveBoundedHorizontal(input: EditBufferLike, direction: "left" | "right") {
    const before = input.visualCursor
    const beforeOffset = input.cursorOffset
    const moved = direction === "left" ? (input.moveCursorLeft?.() ?? false) : (input.moveCursorRight?.() ?? false)
    const after = input.visualCursor

    if (moved && before && after && beforeOffset !== undefined && after.visualRow !== before.visualRow) {
        input.cursorOffset = beforeOffset
        return false
    }

    return moved
}

function deletePromptChar(ctx: PromptContext) {
    const input = focusedInput(ctx)
    return input?.deleteChar?.() ?? false
}

function focusedInput(ctx: PromptContext): EditBufferLike | undefined {
    const focused = ctx.api.renderer.currentFocusedRenderable as EditBufferLike | null | undefined
    if (!focused || !hasEditBufferMethods(focused)) return undefined
    return focused
}

function hasEditBufferMethods(input: EditBufferLike) {
    return typeof input.moveCursorLeft === "function" || typeof input.moveCursorRight === "function" || typeof input.moveCursorUp === "function" || typeof input.moveCursorDown === "function" || typeof input.gotoLineEnd === "function"
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
