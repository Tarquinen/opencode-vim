import type { TuiPromptInfo, TuiPromptRef } from "@opencode-ai/plugin/tui"
import type { PromptContext } from "../../prompt/types"
import type { VimCursorStyle } from "./config"
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
    editorView?: {
        getVisualEOL?: () => {
            visualRow: number
            visualCol: number
            logicalRow: number
            logicalCol: number
            offset: number
        }
    }
    plainText?: string
    cursorStyle?: VimCursorStyle
    moveCursorLeft?: () => boolean
    moveCursorRight?: () => boolean
    moveCursorUp?: () => boolean
    moveCursorDown?: () => boolean
    gotoLineStart?: () => void
    gotoLineEnd?: () => void
    gotoVisualLineEnd?: () => boolean
    moveWordForward?: () => boolean
    moveWordBackward?: () => boolean
    deleteChar?: () => boolean
    gotoBufferEnd?: () => boolean | void
}

export function applyVimCursorStyle(ctx: PromptContext, style: VimCursorStyle) {
    const input = focusedInput(ctx)
    if (!input) return false
    input.cursorStyle = style
    return true
}

export function runVimAction(action: VimAction, state: VimState, ctx: PromptContext) {
    const ref = ctx.prompt()

    switch (action) {
        case "normal":
            state.setMode("normal")
            movePromptCursor(ctx, "left")
            return true
        case "insert":
            state.setMode("insert")
            ref?.focus()
            return true
        case "append":
            moveAppendCursor(ctx)
            state.setMode("insert")
            ref?.focus()
            return true
        case "appendEnd":
            moveToAppendLineEnd(ctx)
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
            return moveToNormalLineEnd(input)
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

    if (moved && direction === "right" && isAtVisualLineEnd(input)) {
        input.cursorOffset = beforeOffset
        return false
    }

    return moved
}

function moveAppendCursor(ctx: PromptContext) {
    const input = focusedInput(ctx)
    if (!input) return false
    return input.moveCursorRight?.() ?? false
}

function moveToAppendLineEnd(ctx: PromptContext) {
    const input = focusedInput(ctx)
    if (!input) return false
    return input.gotoVisualLineEnd?.() ?? false
}

function moveToNormalLineEnd(input: EditBufferLike) {
    const moved = input.gotoVisualLineEnd?.() ?? false
    clampNormalLineEnd(input)
    return moved || typeof input.gotoVisualLineEnd === "function"
}

function clampNormalLineEnd(input: EditBufferLike) {
    const cursor = input.visualCursor
    if (!cursor || cursor.visualCol === 0 || input.cursorOffset === undefined) return
    moveBoundedHorizontal(input, "left")
}

function isAtVisualLineEnd(input: EditBufferLike) {
    const cursor = input.visualCursor
    const eol = input.editorView?.getVisualEOL?.()
    if (!cursor || !eol) return false
    return cursor.visualRow === eol.visualRow && cursor.offset === eol.offset
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
