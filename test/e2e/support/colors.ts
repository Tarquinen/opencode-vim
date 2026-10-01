type Cell = { text: string; foreground: string; background: string }

// Decode captured SGR colors, preserving graphemes rather than splitting emoji.
function cells(ansi: string) {
  const lines: Cell[][] = []
  let foreground = "default"
  let background = "default"
  const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })
  for (const line of ansi.split("\n")) {
    const row: Cell[] = []
    for (const part of line.split(/(\x1b\[[\d;]*m)/)) {
      if (part.startsWith("\x1b[")) {
        const codes = part.slice(2, -1).split(";").map(Number)
        for (let i = 0; i < codes.length; i++) {
          const code = codes[i]
          if (code === 0 || code === 39) foreground = "default"
          if (code === 0 || code === 49) background = "default"
          if (code !== 38 && code !== 48) continue
          let color: string
          if (codes[i + 1] === 2) {
            color =
              "#" +
              codes
                .slice(i + 2, i + 5)
                .map((n) => n.toString(16).padStart(2, "0"))
                .join("")
            i += 4
          } else {
            color = `indexed:${codes[i + 2]}`
            i += 2
          }
          if (code === 38) foreground = color
          else background = color
        }
      } else {
        for (const { segment } of graphemes.segment(part)) row.push({ text: segment, foreground, background })
      }
    }
    lines.push(row)
  }
  return lines
}

function trim(row: Cell[]) {
  let end = row.length
  while (row[end - 1]?.text === " ") end--
  return row.slice(0, end)
}

export function yankFlashMatches(before: string, after: string, colors: { foreground: string; background: string }) {
  const original = cells(before)
  const flashed = cells(after)
  let painted = false
  for (let y = 0; y < original.length; y++) {
    const row = original[y]
    const selected = row.some((cell) => cell.text === "▎")
    const actual = flashed[y]
    if (selected) {
      if (
        row
          .map((c) => c.text)
          .join("")
          .trimEnd() !==
        actual
          .map((c) => c.text)
          .join("")
          .trimEnd()
      )
        return false
      for (const cell of actual) {
        if (!cell.text.trim() || cell.text === "▎") continue
        if (cell.foreground !== colors.foreground || cell.background !== colors.background) return false
        painted = true
      }
    } else {
      if (actual.some((cell) => cell.foreground === colors.foreground && cell.background === colors.background))
        return false
      // Tabs animate independently; the session status becomes "Copied".
      if (
        y === 0 ||
        row
          .map((c) => c.text)
          .join("")
          .includes("SESSION")
      )
        continue
      if (JSON.stringify(trim(row)) !== JSON.stringify(trim(actual))) return false
    }
  }
  return painted
}
