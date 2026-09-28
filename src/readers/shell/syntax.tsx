import { getTreeSitterClient, SyntaxStyle, type StyleDefinitionInput, type TextareaRenderable } from "@opentui/core"
import type { Context } from "@opencode/plugin/tui/context"
import { createEffect, onCleanup } from "solid-js"
import { charToDisplay, displayWidth } from "../../modules/vim/map"

export function createReaderSyntax(context: Context) {
  const style = SyntaxStyle.create()
  createEffect(() => {
    const theme = context.theme.surface("dialog")
    const tokens: Record<string, StyleDefinitionInput> = { default: { fg: theme.text.base } }
    for (const [name, color] of Object.entries(theme.syntax)) tokens[name] = { fg: color }
    tokens["diff.plus"] = { fg: theme.diff.text.added }
    tokens["diff.minus"] = { fg: theme.diff.text.removed }
    tokens["diff.header"] = { fg: theme.diff.text.hunkHeader }
    for (const [name, token] of Object.entries(tokens)) style.registerStyle(name, token)
    context.renderer.requestRender()
  })
  onCleanup(() => style.destroy())
  return style
}

export async function highlightCommand(input: TextareaRenderable, style: SyntaxStyle, signal: AbortSignal) {
  const text = input.plainText
  let result
  try {
    result = await getTreeSitterClient().highlightOnce(text, "bash")
  } catch {
    return
  }
  if (signal.aborted || input.isDestroyed) return
  input.syntaxStyle = style
  for (const [start, end, scope] of result.highlights ?? []) {
    const styleId = style.getStyleId(scope)
    if (styleId === null) continue
    input.addHighlightByCharRange({ start: charToDisplay(text, start), end: charToDisplay(text, end), styleId })
  }
  input.requestRender()
}

export function highlightDiff(input: TextareaRenderable, style: SyntaxStyle) {
  const text = input.plainText
  if (!/^--- .+\n\+\+\+ .+/m.test(text) || !/^@@ /m.test(text)) return
  input.syntaxStyle = style
  const lines = text.split("\n")
  for (let row = 0; row < lines.length; row++) {
    const line = lines[row]
    let token: string
    if (/^(diff --git |index |--- |\+\+\+ |@@ )/.test(line)) token = "diff.header"
    else if (line.startsWith("+")) token = "diff.plus"
    else if (line.startsWith("-")) token = "diff.minus"
    else continue
    input.addHighlight(row, { start: 0, end: displayWidth(line), styleId: style.getStyleId(token)! })
  }
}
