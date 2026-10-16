import type { WidthMethod } from "@opentui/core"
import { charToDisplay } from "./map"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

type Input = {
  plainText: string
  cursorOffset: number
  setSelection: (start: number, end: number) => void
  insertText: (text: string) => void
  deleteChar: () => unknown
  clearSelection: () => unknown
}

export function editInput(input: Input, value: string, widthMethod: WidthMethod) {
  const before = input.plainText
  if (before === value) return
  input.clearSelection()

  // Find the changed span without allocating grapheme objects for both buffers.
  let start = 0
  while (start < before.length && start < value.length && before[start] === value[start]) start++
  const beforeSegments = graphemes.segment(before)
  const afterSegments = graphemes.segment(value)
  start = Math.min(
    segmentAt(before, beforeSegments, start)?.index ?? start,
    segmentAt(value, afterSegments, start)?.index ?? start,
  )

  let end = before.length
  let valueEnd = value.length
  while (end > start && valueEnd > start && before[end - 1] === value[valueEnd - 1]) {
    end--
    valueEnd--
  }

  // Expand the ends together until neither cuts a grapheme in the shared suffix.
  while (true) {
    const left = segmentAt(before, beforeSegments, end)
    const right = segmentAt(value, afterSegments, valueEnd)
    const leftExtra = left && left.index < end ? left.index + left.segment.length - end : 0
    const rightExtra = right && right.index < valueEnd ? right.index + right.segment.length - valueEnd : 0
    const extra = Math.max(leftExtra, rightExtra)
    if (!extra) break
    end += extra
    valueEnd += extra
  }

  const startOffset = charToDisplay(before, start, widthMethod)

  if (start === end) input.cursorOffset = startOffset
  else input.setSelection(startOffset, startOffset + charToDisplay(before.slice(start, end), end - start, widthMethod))
  const inserted = value.slice(start, valueEnd)
  if (inserted) input.insertText(inserted)
  else input.deleteChar()
}

function segmentAt(text: string, segments: Intl.Segments, index: number) {
  // Bun's containing() can include the previous grapheme at a high surrogate.
  // Query its low surrogate instead, which is inside the same grapheme.
  const point = text.codePointAt(index)
  if (point !== undefined && point > 0xffff) index++
  return segments.containing(index)
}
