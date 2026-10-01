import {
  executeOperatorOnRange,
  resetContext,
  type TextBuffer,
  type CursorPosition,
  type MotionRange,
  type Operator,
  type VimAction,
  type VimContext,
  type VimMode,
} from "@vimee/core"

export function textObjectAlias(key: string, ctx: VimContext) {
  if (ctx.phase !== "text-object-pending") return undefined
  if (key === "b") return "("
  if (key === "B") return "{"
  return undefined
}

export function textObjectOperator(operator: Operator): operator is "y" | "d" | "c" {
  return operator === "y" || operator === "d" || operator === "c"
}

export function resolvePromptTextObject(
  modifier: "i" | "a",
  key: string,
  cursor: CursorPosition,
  buffer: TextBuffer,
): MotionRange | null {
  if (key === "q") return quoteRange(modifier, cursor, buffer)
  if (key !== "p") return null
  return paragraphRange(modifier, cursor, buffer)
}

function quoteRange(modifier: "i" | "a", cursor: CursorPosition, buffer: TextBuffer): MotionRange | null {
  const pair = quoteObjectPair(cursor, buffer)
  if (!pair) return null
  const start = modifier === "i" ? pair.open + 1 : pair.open
  const end = modifier === "i" ? pair.close - 1 : pair.close
  return {
    start: { line: cursor.line, col: start },
    end: { line: cursor.line, col: Math.max(start, end) },
    linewise: false,
    inclusive: end >= start,
  }
}

function paragraphRange(modifier: "i" | "a", cursor: CursorPosition, buffer: TextBuffer): MotionRange | null {
  const count = buffer.getLineCount()
  if (count === 0) return null

  const line = Math.max(0, Math.min(count - 1, cursor.line))
  let start = line
  while (start < count && blankLine(buffer.getLine(start))) start++
  if (start >= count) {
    start = line
    while (start >= 0 && blankLine(buffer.getLine(start))) start--
  }
  if (start < 0 || start >= count) return null

  let end = start
  while (start > 0 && !blankLine(buffer.getLine(start - 1))) start--
  while (end < count - 1 && !blankLine(buffer.getLine(end + 1))) end++

  if (modifier === "a") {
    if (end < count - 1 && blankLine(buffer.getLine(end + 1))) {
      end++
      while (end < count - 1 && blankLine(buffer.getLine(end + 1))) end++
    } else {
      while (start > 0 && blankLine(buffer.getLine(start - 1))) start--
    }
  }

  return {
    start: { line: start, col: 0 },
    end: { line: end, col: Math.max(0, buffer.getLineLength(end) - 1) },
    linewise: true,
    inclusive: true,
  }
}

function quoteObjectPair(cursor: CursorPosition, buffer: TextBuffer) {
  let best: { open: number; close: number; distance: number } | undefined
  for (const quote of ['"', "'", "`"] as const) {
    const pair = quotePair(cursor, buffer, quote)
    if (!pair) continue
    if (!best || pair.distance < best.distance) best = pair
  }
  return best
}

function quotePair(cursor: CursorPosition, buffer: TextBuffer, quote: string) {
  const line = buffer.getLine(cursor.line)
  let open = -1
  let close = -1
  let inQuote = false
  let quoteStart = -1

  for (let index = 0; index < line.length; index++) {
    if (line[index] !== quote || escaped(line, index)) continue
    if (!inQuote) {
      quoteStart = index
      inQuote = true
      continue
    }
    if (cursor.col >= quoteStart && cursor.col <= index) {
      return { open: quoteStart, close: index, distance: 0 }
    }
    inQuote = false
  }

  for (let index = cursor.col; index < line.length; index++) {
    if (line[index] !== quote || escaped(line, index)) continue
    if (open === -1) open = index
    else {
      close = index
      break
    }
  }
  if (open !== -1 && close !== -1) return { open, close, distance: open - cursor.col }

  close = -1
  open = -1
  for (let index = cursor.col; index >= 0; index--) {
    if (line[index] !== quote || escaped(line, index)) continue
    if (close === -1) close = index
    else {
      open = index
      break
    }
  }
  if (open !== -1 && close !== -1) return { open, close, distance: cursor.col - close }
  return undefined
}

export function executeTextObject(operator: Operator, range: MotionRange, buffer: TextBuffer, ctx: VimContext) {
  if (operator !== "y") buffer.saveUndoPoint(ctx.cursor)
  if (operator === ">" || operator === "<") {
    const result = executeOperatorOnRange(operator, range, buffer, ctx.cursor, {
      style: ctx.indentStyle,
      width: ctx.indentWidth,
    })
    const cursor = { line: result.newCursor.line, col: Math.max(0, buffer.getLine(result.newCursor.line).search(/\S/)) }
    return {
      actions: [...result.actions, { type: "cursor-move", position: cursor }] as VimAction[],
      context: { ...resetContext(ctx), cursor },
      yankedText: "",
    }
  }
  const result = range.linewise
    ? executeLinewiseTextObject(operator, range, buffer, ctx.cursor)
    : executeCharwiseTextObject(operator, range, buffer)
  const registers = ctx.selectedRegister
    ? { ...ctx.registers, [ctx.selectedRegister]: result.yankedText }
    : ctx.registers
  const context = {
    ...resetContext(ctx),
    mode: result.mode,
    cursor: result.cursor,
    register: result.yankedText,
    registers,
    statusMessage: result.statusMessage,
  }
  const actions: VimAction[] = [
    { type: "yank", text: result.yankedText },
    ...result.actions,
    { type: "mode-change", mode: result.mode },
    { type: "cursor-move", position: result.cursor },
  ]
  return { actions, context, yankedText: result.yankedText }
}

function executeLinewiseTextObject(operator: Operator, range: MotionRange, buffer: TextBuffer, cursor: CursorPosition) {
  const startLine = Math.min(range.start.line, range.end.line)
  const endLine = Math.max(range.start.line, range.end.line)
  const lineCount = endLine - startLine + 1
  const yankedText =
    buffer
      .getLines()
      .slice(startLine, endLine + 1)
      .join("\n") + "\n"
  if (operator === "y") {
    const col = Math.min(cursor.col, Math.max(0, buffer.getLineLength(startLine) - 1))
    return {
      actions: [] as VimAction[],
      cursor: { line: startLine, col },
      mode: "normal" as VimMode,
      yankedText,
      statusMessage: lineCount >= 2 ? `${lineCount} lines yanked` : "",
    }
  }

  buffer.deleteLines(startLine, lineCount)
  if (operator === "c") buffer.insertLine(startLine, "")
  else if (buffer.getLineCount() === 0) buffer.insertLine(0, "")
  const line = Math.min(startLine, buffer.getLineCount() - 1)
  return {
    actions: [{ type: "content-change", content: buffer.getContent() }] as VimAction[],
    cursor: { line, col: 0 },
    mode: (operator === "c" ? "insert" : "normal") as VimMode,
    yankedText,
    statusMessage: lineCount >= 2 ? `${lineCount} fewer lines` : "",
  }
}

function executeCharwiseTextObject(operator: Operator, range: MotionRange, buffer: TextBuffer) {
  const ordered = orderedRange(range)
  const endCol = range.inclusive ? ordered.end.col + 1 : ordered.end.col
  const yankedText = textInRange(buffer, ordered.start, { line: ordered.end.line, col: endCol })
  if (operator === "y") {
    return {
      actions: [] as VimAction[],
      cursor: ordered.start,
      mode: "normal" as VimMode,
      yankedText,
      statusMessage: yankedText.split("\n").length >= 2 ? `${yankedText.split("\n").length} lines yanked` : "",
    }
  }

  const linesBefore = buffer.getLineCount()
  buffer.deleteRange(ordered.start.line, ordered.start.col, ordered.end.line, endCol)
  const linesRemoved = linesBefore - buffer.getLineCount()
  return {
    actions: [{ type: "content-change", content: buffer.getContent() }] as VimAction[],
    cursor: {
      line: ordered.start.line,
      col:
        operator === "c"
          ? ordered.start.col
          : Math.min(ordered.start.col, Math.max(0, buffer.getLineLength(ordered.start.line) - 1)),
    },
    mode: (operator === "c" ? "insert" : "normal") as VimMode,
    yankedText,
    statusMessage: linesRemoved >= 2 ? `${linesRemoved} fewer lines` : "",
  }
}

export function orderedRange(range: MotionRange) {
  if (range.start.line > range.end.line || (range.start.line === range.end.line && range.start.col > range.end.col)) {
    return { start: range.end, end: range.start }
  }
  return { start: range.start, end: range.end }
}

function textInRange(buffer: TextBuffer, start: CursorPosition, end: CursorPosition) {
  if (start.line === end.line) return buffer.getLine(start.line).slice(start.col, end.col)
  const lines = [buffer.getLine(start.line).slice(start.col)]
  for (let line = start.line + 1; line < end.line; line++) lines.push(buffer.getLine(line))
  lines.push(buffer.getLine(end.line).slice(0, end.col))
  return lines.join("\n")
}

function blankLine(line: string) {
  return line.trim().length === 0
}

function escaped(line: string, index: number) {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor--) slashCount++
  return slashCount % 2 === 1
}
