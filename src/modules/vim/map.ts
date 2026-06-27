import type { CursorPosition } from "@vimee/core"
import type { EditBufferLike } from "./actions"

const WIDE_RANGES: [number, number][] = [
    [0x1100, 0x115F], // Hangul Jamo
    [0x2329, 0x232A],
    [0x2E80, 0x303E], // CJK Radicals, Kangxi, CJK Symbols
    [0x3040, 0x33BF], // Hiragana, Katakana, Bopomofo, etc.
    [0x3400, 0x4DBF], // CJK Extension A
    [0x4E00, 0xA4CF], // CJK Unified Ideographs, Yi
    [0xA960, 0xA97F], // Hangul Jamo Extended-A
    [0xAC00, 0xD7AF], // Hangul Syllables
    [0xD7B0, 0xD7FF], // Hangul Jamo Extended-B
    [0xF900, 0xFAFF], // CJK Compatibility Ideographs
    [0xFE10, 0xFE19], // Vertical Forms
    [0xFE30, 0xFE6F], // CJK Compatibility Forms
    [0xFF01, 0xFF60], // Fullwidth Forms
    [0xFFE0, 0xFFE6],
    [0x1B000, 0x1B0FF], // Kana Supplement
    [0x1B100, 0x1B12F], // Kana Extended-A
    [0x20000, 0x2FFFF], // CJK Extension B-F
    [0x30000, 0x3FFFF], // CJK Extension G-H
]

export function charDisplayWidth(char: string): number {
    const code = char.charCodeAt(0)
    if (code < 0x7F) return 1
    for (const [start, end] of WIDE_RANGES) {
        if (code >= start && code <= end) return 2
    }
    return 1
}

export function charToDisplay(text: string, charIndex: number): number {
    let width = 0
    const len = Math.min(charIndex, text.length)
    for (let i = 0; i < len; i++) {
        width += charDisplayWidth(text[i])
    }
    return width
}

export function displayToChar(text: string, displayOffset: number): number {
    let width = 0
    for (let i = 0; i < text.length; i++) {
        const w = charDisplayWidth(text[i])
        if (width + w > displayOffset) return i
        width += w
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
    vimToHost: Array<number | undefined>
}

export function createPromptMap(hostText: string, input?: EditBufferLike): PromptMap {
    return buildPromptMap(hostText, input ? visualWrapOffsets(input, hostText) : [])
}

export function derivePromptMap(map: PromptMap, vimText: string): PromptMap {
    const prefix = commonPrefix(map.vimText, vimText)
    const suffix = commonSuffix(map.vimText, vimText, prefix)
    const inserted = vimText.slice(prefix, vimText.length - suffix)
    const synthetic = new Set<number>()
    let hostText = ""

    for (let vimOffset = 0; vimOffset < vimText.length; vimOffset++) {
        const oldOffset = previousOffset(map, vimOffset, vimText.length, prefix, suffix)
        if (oldOffset !== undefined && map.vimToHost[oldOffset] === undefined && preserveSynthetic(vimOffset, prefix, suffix, vimText.length, inserted)) {
            synthetic.add(vimOffset)
            continue
        }

        hostText += vimText[vimOffset]
    }

    return buildPromptMapFromSynthetic(hostText, vimText, synthetic)
}

function preserveSynthetic(vimOffset: number, prefix: number, suffix: number, vimLength: number, inserted: string) {
    if (!inserted.includes("\n")) return true
    return vimOffset !== prefix - 1 && vimOffset !== vimLength - suffix
}

export function hostPosition(map: PromptMap, hostDisplayOffset: number): CursorPosition {
    const charIdx = displayToChar(map.hostText, hostDisplayOffset)
    return positionFromOffset(map.vimText, map.hostToVim[clamp(charIdx, 0, map.hostText.length)] ?? 0)
}

export function hostOffset(map: PromptMap, position: CursorPosition, bias: "previous" | "next" = "next") {
    const charIdx = hostOffsetFromVimOffset(map, offsetFromPosition(map.vimText, position), bias)
    return charToDisplay(map.hostText, charIdx)
}

function buildPromptMap(hostText: string, wraps: number[]): PromptMap {
    const hostToVim: number[] = []
    const vimToHost: Array<number | undefined> = []
    const wrapOffsets = new Set(wraps.filter((offset) => offset > 0 && offset < hostText.length && hostText[offset - 1] !== "\n"))
    let vimText = ""
    let vimOffset = 0

    for (let hostOffset = 0; hostOffset < hostText.length; hostOffset++) {
        if (wrapOffsets.has(hostOffset)) {
            vimText += "\n"
            vimToHost[vimOffset] = undefined
            vimOffset++
        }
        hostToVim[hostOffset] = vimOffset
        vimText += hostText[hostOffset]
        vimToHost[vimOffset] = hostOffset
        vimOffset++
    }

    hostToVim[hostText.length] = vimOffset
    return { hostText, vimText, hostToVim, vimToHost }
}

function buildPromptMapFromSynthetic(hostText: string, vimText: string, synthetic: Set<number>): PromptMap {
    const hostToVim: number[] = []
    const vimToHost: Array<number | undefined> = []
    let hostOffset = 0

    for (let vimOffset = 0; vimOffset < vimText.length; vimOffset++) {
        if (synthetic.has(vimOffset)) {
            vimToHost[vimOffset] = undefined
            continue
        }

        hostToVim[hostOffset] = vimOffset
        vimToHost[vimOffset] = hostOffset
        hostOffset++
    }

    hostToVim[hostText.length] = vimText.length
    return { hostText, vimText, hostToVim, vimToHost }
}

function previousOffset(map: PromptMap, vimOffset: number, vimLength: number, prefix: number, suffix: number) {
    if (vimOffset < prefix) return vimOffset
    if (vimOffset >= vimLength - suffix) return map.vimText.length - (vimLength - vimOffset)
    return undefined
}

function visualWrapOffsets(input: EditBufferLike, text: string) {
    const original = input.cursorOffset
    const wraps: number[] = []
    let previousRow: number | undefined

    for (let charIdx = 0; charIdx <= text.length; charIdx++) {
        input.cursorOffset = charToDisplay(text, charIdx)
        const row = input.visualCursor?.visualRow
        if (row === undefined) {
            wraps.length = 0
            break
        }
        if (previousRow !== undefined && row > previousRow && text[charIdx - 1] !== "\n") wraps.push(charIdx)
        previousRow = row
    }

    input.cursorOffset = original
    return wraps
}

function hostOffsetFromVimOffset(map: PromptMap, vimOffset: number, bias: "previous" | "next") {
    const offset = clamp(vimOffset, 0, map.vimText.length)
    if (offset === map.vimText.length) return map.hostText.length

    const host = map.vimToHost[offset]
    if (host !== undefined) return host

    if (bias === "previous") {
        for (let previous = offset - 1; previous >= 0; previous--) {
            const previousHost = map.vimToHost[previous]
            if (previousHost !== undefined) return previousHost
        }
    }

    for (let next = offset + 1; next < map.vimToHost.length; next++) {
        const nextHost = map.vimToHost[next]
        if (nextHost !== undefined) return nextHost
    }
    return map.hostText.length
}

function commonPrefix(left: string, right: string) {
    let index = 0
    while (index < left.length && index < right.length && left[index] === right[index]) index++
    return index
}

function commonSuffix(left: string, right: string, prefix: number) {
    let length = 0
    while (length + prefix < left.length && length + prefix < right.length && left[left.length - length - 1] === right[right.length - length - 1]) length++
    return length
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
