import type { LineInfo, RGBA, WidthMethod } from "@opentui/core"

export type EditorContext = {
  input: () => EditorInput | undefined
  widthMethod: WidthMethod
  colors: { selection: RGBA; yank: RGBA; background: RGBA }
  setText: (text: string) => void
  submit: () => void
  blur: () => void
  dispatchCommand: (command: string) => { ok: boolean }
  requestRender: () => void
}

export type EditorInput = {
  isDestroyed?: boolean
  cursorOffset: number
  plainText: string
  visualCursor?: { visualCol: number }
  editorView?: {
    getLogicalLineInfo?: () => LineInfo
    setSelection?: (start: number, end: number, bgColor?: RGBA, fgColor?: RGBA) => void
    resetSelection?: () => void
  }
  selectionBg?: RGBA
  selectionFg?: RGBA
  setSelection?: (start: number, end: number) => void
  insertText?: (text: string) => void
  setSelectionInclusive?: (start: number, end: number) => void
  clearSelection?: () => void
}
