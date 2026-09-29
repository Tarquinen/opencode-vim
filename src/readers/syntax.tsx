import { getTreeSitterClient, SyntaxStyle, type StyleDefinitionInput, type TextareaRenderable, type WidthMethod } from "@opentui/core"
import type { Context } from "@opencode/plugin/tui/context"
import { createEffect, onCleanup } from "solid-js"
import { createPromptMap, hostPosition } from "../modules/vim/map"

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

export async function highlightCode(input: TextareaRenderable, style: SyntaxStyle, filetype: string, signal: AbortSignal, widthMethod: WidthMethod) {
  const text = input.plainText
  let result
  try {
    result = await getTreeSitterClient().highlightOnce(text, filetype)
  } catch {
    return
  }
  if (signal.aborted || input.isDestroyed || !result.highlights?.length) return
  input.syntaxStyle = style
  const map = createPromptMap(text, undefined, widthMethod)
  for (const [start, end, scope] of result.highlights) {
    const styleId = style.getStyleId(scope)
    if (styleId === null) continue
    input.addHighlightByCharRange({
      start: highlightOffset(start), end: highlightOffset(end), styleId,
    })
  }
  input.requestRender()

  function highlightOffset(index: number) {
    const offset = map.vimToDisplay[map.hostToVim[index]]
    // Highlight ranges exclude newlines; editor cursor offsets include them.
    return offset - hostPosition(map, offset).line
  }
}
