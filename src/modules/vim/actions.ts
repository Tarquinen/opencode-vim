import type { TuiPromptInfo, TuiPromptRef } from "@opencode-ai/plugin/tui"
import type { PromptContext } from "../../prompt/types"
import type { VimCursorStyle } from "./config"

export type EditBufferLike = {
    cursorOffset?: number
    plainText?: string
    cursorStyle?: VimCursorStyle
    moveCursorLeft?: () => boolean
    moveCursorRight?: () => boolean
    moveCursorUp?: () => boolean
    moveCursorDown?: () => boolean
    gotoLineEnd?: () => void
}

export function applyVimCursorStyle(ctx: PromptContext, style: VimCursorStyle) {
    const input = focusedInput(ctx)
    if (!input) return false
    input.cursorStyle = style
    return true
}

export function focusedInput(ctx: PromptContext): EditBufferLike | undefined {
    const focused = ctx.api.renderer.currentFocusedRenderable as EditBufferLike | null | undefined
    if (!focused || !hasEditBufferMethods(focused)) return undefined
    return focused
}

export function setInput(ref: TuiPromptRef, input: string) {
    ref.set(toPromptInfo(ref, input))
}

function hasEditBufferMethods(input: EditBufferLike) {
    return typeof input.moveCursorLeft === "function" || typeof input.moveCursorRight === "function" || typeof input.moveCursorUp === "function" || typeof input.moveCursorDown === "function" || typeof input.gotoLineEnd === "function"
}

function toPromptInfo(ref: TuiPromptRef, input: string): TuiPromptInfo {
    return {
        input,
        mode: ref.current.mode,
        parts: [...ref.current.parts],
    }
}
