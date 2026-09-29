import type { CursorPosition } from "@vimee/core"
import type { WidthMethod } from "@opentui/core"
import { createGraphemeCodec } from "./graphemes"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

function graphemeWidth(value: string, method: WidthMethod) {
  // Textarea offsets count newlines as one position; Bun.stringWidth counts them as zero.
  // OpenTUI's edit buffer gives tabs a fixed two-column width by default.
  if (value === "\t") return 2
  if (value === "\n") return 1
  if (method === "wcwidth") {
    let width = 0
    for (const character of value) width += Bun.stringWidth(character)
    return width
  }
  return Bun.stringWidth(value)
}

export function charToDisplay(text: string, charIndex: number, method: WidthMethod = "unicode"): number {
  let width = 0
  const limit = Math.max(0, Math.min(charIndex, text.length))
  for (const part of graphemes.segment(text)) {
    if (part.index + part.segment.length > limit) break
    width += graphemeWidth(part.segment, method)
  }
  return width
}

export function displayToChar(text: string, displayOffset: number, method: WidthMethod = "unicode"): number {
  let width = 0
  for (const part of graphemes.segment(text)) {
    const next = width + graphemeWidth(part.segment, method)
    if (next > displayOffset) return part.index
    width = next
  }
  return text.length
}

export function displayWidth(text: string, method: WidthMethod = "unicode"): number {
  return charToDisplay(text, text.length, method)
}

export type PromptMap = {
  hostText: string
  vimText: string
  hostToVim: number[]
  vimToHost: number[]
  vimToDisplay: number[]
  lineStarts: number[]
  displayWidth: number
}

export function createPromptMap(
  hostText: string,
  codec = createGraphemeCodec(),
  method: WidthMethod = "unicode",
): PromptMap {
  const hostToVim: number[] = []
  const vimToHost: number[] = []
  const vimToDisplay: number[] = []
  const lineStarts = [0]
  let vimText = ""
  let vimOffset = 0
  let width = 0

  for (const { index: hostOffset, segment } of graphemes.segment(hostText)) {
    for (let index = hostOffset; index < hostOffset + segment.length; index++) hostToVim[index] = vimOffset
    const encoded = codec.encodeGrapheme(segment)
    vimText += encoded
    vimToHost[vimOffset] = hostOffset
    vimToDisplay[vimOffset] = width
    width += graphemeWidth(segment, method)
    vimOffset++
    if (encoded === "\n") lineStarts.push(vimOffset)
  }

  hostToVim[hostText.length] = vimOffset
  vimToHost[vimOffset] = hostText.length
  vimToDisplay[vimOffset] = width
  return { hostText, vimText, hostToVim, vimToHost, vimToDisplay, lineStarts, displayWidth: width }
}

export function hostPosition(map: PromptMap, hostDisplayOffset: number): CursorPosition {
  const offset = indexAtOffset(map.vimToDisplay, hostDisplayOffset)
  const line = indexAtOffset(map.lineStarts, offset)
  return { line, col: offset - map.lineStarts[line] }
}

export function hostCharOffset(map: PromptMap, hostDisplayOffset: number) {
  return map.vimToHost[indexAtOffset(map.vimToDisplay, hostDisplayOffset)]
}

export function hostOffset(map: PromptMap, position: CursorPosition) {
  return hostFromVimOffset(map, vimOffsetFromPosition(map, position))
}

export function hostFromVimOffset(map: PromptMap, offset: number) {
  return map.vimToDisplay[clamp(offset, 0, map.vimText.length)]
}

export function vimLineLength(map: PromptMap, line: number) {
  const start = map.lineStarts[line]
  if (start === undefined) return 0
  const end = line + 1 < map.lineStarts.length ? map.lineStarts[line + 1] - 1 : map.vimText.length
  return end - start
}

export function vimOffsetFromPosition(map: PromptMap, position: CursorPosition) {
  const line = clamp(position.line, 0, map.lineStarts.length - 1)
  return map.lineStarts[line] + clamp(position.col, 0, vimLineLength(map, line))
}

// Find the last boundary at or before an offset, including zero-width graphemes.
function indexAtOffset(offsets: number[], offset: number) {
  let low = 0
  let high = offsets.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if (offsets[middle] <= offset) low = middle + 1
    else high = middle
  }
  return Math.max(0, low - 1)
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
