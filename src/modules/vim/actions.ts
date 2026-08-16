import type { RGBA } from "@opentui/core"
import type { VimCursorStyle } from "./config"

type PromptInfo = {
    input: string
    mode: string
    parts: unknown[]
}

type PromptRef = {
    current: PromptInfo
    set: (value: PromptInfo) => void
    submit: () => void
    blur: () => void
}

export type PromptContext = {
    api: {
        renderer: { currentFocusedRenderable?: unknown }
        keymap: { dispatchCommand: (command: string) => { ok: boolean } }
        theme: { current: { warning: RGBA; info: RGBA; background: RGBA } }
    }
    prompt: () => PromptRef | undefined
    requestRender: () => void
}

export type EditBufferLike = {
    cursorOffset?: number
    plainText?: string
    visualCursor?: VisualCursorLike
    editorView?: { getVisualEOL?: () => VisualCursorLike | undefined; setSelection?: (start: number, end: number, bgColor?: RGBA, fgColor?: RGBA) => void; resetSelection?: () => void }
    cursorStyle?: VimCursorStyle
    selectionBg?: RGBA
    selectionFg?: RGBA
    moveCursorLeft?: () => boolean
    moveCursorRight?: () => boolean
    moveCursorUp?: () => boolean
    moveCursorDown?: () => boolean
    setSelection?: (start: number, end: number) => void
    setSelectionInclusive?: (start: number, end: number) => void
    clearSelection?: () => void
    gotoVisualLineEnd?: () => boolean
    gotoLineEnd?: () => void
}

export type VisualCursorLike = {
    visualRow?: number
    visualCol?: number
    logicalRow?: number
    logicalCol?: number
    offset?: number
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

export function setInput(ref: PromptRef, input: string) {
    ref.set(toPromptInfo(ref, input))
}

function hasEditBufferMethods(input: EditBufferLike) {
    return typeof input.moveCursorLeft === "function" || typeof input.moveCursorRight === "function" || typeof input.moveCursorUp === "function" || typeof input.moveCursorDown === "function" || typeof input.gotoLineEnd === "function"
}

function toPromptInfo(ref: PromptRef, input: string): PromptInfo {
    return {
        input,
        mode: ref.current.mode,
        parts: [...ref.current.parts],
    }
}
