import type { TranscriptSource } from "../../transcript-items"

type ReadSource = Extract<TranscriptSource, { type: "tool" }>

export type ReadSnapshot = {
  path: string
  text: string
  start: number
  end: number
  partial: boolean
  clipped: boolean
}

export function readSnapshot(source: ReadSource): ReadSnapshot | undefined {
  const state = source.state
  if (state.status !== "completed" || state.content.length !== 1) return
  const content = state.content[0]
  if (content.type !== "text") return
  const rows = content.text.replace(/\r\n/g, "\n").split("\n")
  const header = /^Read file (.+), (?:lines ([1-9]\d*)-([1-9]\d*)|0 lines)$/.exec(rows[0])
  if (!header) return
  const start = Number(header[2] ?? 1)
  const end = Number(header[3] ?? 0)
  const continuation = /^\[Output truncated\. Continue reading with offset: \d+\]$/.test(rows.at(-1)!)
  if (continuation) rows.pop()
  const count = header[2] ? end - start + 1 : 0
  if ((header[2] && end < start) || rows.length !== count + 1) return

  const lines: string[] = []
  let clipped = false
  for (let index = 0; index < count; index++) {
    const prefix = `${start + index}: `
    const row = rows[index + 1]
    if (!row.startsWith(prefix)) return
    const line = row.slice(prefix.length)
    if (line.endsWith("... (line truncated to 2000 chars)")) clipped = true
    lines.push(line)
  }
  return {
    path: header[1],
    text: lines.join("\n"),
    start,
    end,
    partial: start > 1 || continuation || state.metadata?.truncated === true || clipped,
    clipped,
  }
}
