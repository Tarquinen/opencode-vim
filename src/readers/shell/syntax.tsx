import type { SyntaxStyle, TextareaRenderable, WidthMethod } from "@opentui/core"
import { displayWidth } from "../../vim/map"

export function highlightDiff(input: TextareaRenderable, style: SyntaxStyle, widthMethod: WidthMethod) {
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
    input.addHighlight(row, { start: 0, end: displayWidth(line, widthMethod), styleId: style.getStyleId(token)! })
  }
}
