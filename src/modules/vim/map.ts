import type { CursorPosition } from "@vimee/core"
import { createGraphemeCodec } from "./graphemes"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function graphemeWidth(value: string) {
    // Textarea offsets count newlines as one position; Bun.stringWidth counts them as zero.
    // OpenTUI's edit buffer gives tabs a fixed two-column width by default.
    if (value === "\t") return 2
    return value === "\n" ? 1 : Bun.stringWidth(value)
}

export function charToDisplay(text: string, charIndex: number): number {
    let width = 0
    const limit = Math.max(0, Math.min(charIndex, text.length))
    for (const part of graphemes.segment(text)) {
        if (part.index + part.segment.length > limit) break
        width += graphemeWidth(part.segment)
    }
    return width
}

export function displayToChar(text: string, displayOffset: number): number {
    let width = 0
    for (const part of graphemes.segment(text)) {
        const next = width + graphemeWidth(part.segment)
        if (next > displayOffset) return part.index
        width = next
    }
    return text.length
}

export function displayWidth(text: string): number {
    return charToDisplay(text, text.length)
}

export type PromptMap = {
    hostText: string
    vimText: string
    hostToVim: number[]
    vimToHost: number[]
}

export function createPromptMap(hostText: string, codec = createGraphemeCodec()): PromptMap {
    const hostToVim: number[] = []
    const vimToHost: number[] = []
    let vimText = ""
    let vimOffset = 0

    for (const { index: hostOffset, segment } of graphemes.segment(hostText)) {
        for (let index = hostOffset; index < hostOffset + segment.length; index++) hostToVim[index] = vimOffset
        vimText += codec.encode(segment)
        vimToHost[vimOffset] = hostOffset
        vimOffset++
    }

    hostToVim[hostText.length] = vimOffset
    vimToHost[vimOffset] = hostText.length
    return { hostText, vimText, hostToVim, vimToHost }
}

export function hostPosition(map: PromptMap, hostDisplayOffset: number): CursorPosition {
    const charIdx = displayToChar(map.hostText, hostDisplayOffset)
    return positionFromOffset(map.vimText, map.hostToVim[clamp(charIdx, 0, map.hostText.length)])
}

export function hostOffset(map: PromptMap, position: CursorPosition) {
    return hostFromVimOffset(map, offsetFromPosition(map.vimText, position))
}

export function hostFromVimOffset(map: PromptMap, offset: number) {
    return charToDisplay(map.hostText, map.vimToHost[clamp(offset, 0, map.vimText.length)])
}

function positionFromOffset(text: string, offset: number): CursorPosition {
    const lines = text.slice(0, offset).split("\n")
    return { line: lines.length - 1, col: lines[lines.length - 1]?.length ?? 0 }
}

function offsetFromPosition(text: string, position: CursorPosition) {
    const lines = text.split("\n")
    const line = clamp(position.line, 0, Math.max(0, lines.length - 1))
    let offset = 0
    for (let index = 0; index < line; index++) offset += lines[index].length + 1
    return offset + clamp(position.col, 0, lines[line]?.length ?? 0)
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
}
