import { parsePatch, type StructuredPatchHunk } from "diff"
import type { DiffView } from "../../modules/vim/config"
import type { TranscriptItem } from "../../transcript-items"

export type DiffSnapshot = {
  path: string
  status: "added" | "deleted" | "modified"
  additions: number
  deletions: number
  hunks: StructuredPatchHunk[]
}

export function diffSnapshot(message: TranscriptItem): DiffSnapshot | undefined {
  const source = message.source
  if (source?.type !== "tool" || (source.name !== "edit" && source.name !== "patch") || source.state.status !== "completed") return
  const raw = source.state.metadata?.files
  if (!Array.isArray(raw)) return
  const files: Array<Omit<DiffSnapshot, "hunks"> & { patch: string }> = []
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const path = item.file ?? item.relativePath
    const status = item.status ?? (item.type === "add" ? "added" : item.type === "delete" ? "deleted" : item.type === "update" ? "modified" : undefined)
    if (typeof path !== "string" || typeof item.patch !== "string" || typeof item.additions !== "number" || typeof item.deletions !== "number") continue
    if (status !== "added" && status !== "deleted" && status !== "modified") continue
    files.push({ path, status, additions: item.additions, deletions: item.deletions, patch: item.patch })
  }
  // A multi-file result needs the file selected in the native transcript.
  if (source.name === "patch" && files.length > 1 && message.fileIndex === undefined) return
  const file = files[message.fileIndex ?? 0]
  if (!file) return
  try {
    const patches = parsePatch(file.patch)
    if (patches.length !== 1 || !patches[0].hunks.length) return
    return { path: file.path, status: file.status, additions: file.additions, deletions: file.deletions, hunks: patches[0].hunks }
  } catch {
    return
  }
}

export function availableViews(snapshot: DiffSnapshot): DiffView[] {
  if (snapshot.status === "added") return ["after", "diff"]
  if (snapshot.status === "deleted") return ["before", "diff"]
  return ["after", "before", "diff"]
}

export function diffContent(hunks: StructuredPatchHunk[], view: DiffView) {
  const lines: string[] = []
  const numbers = new Map<number, number>()
  const signs = new Map<number, "+" | "-">()
  const hideLineNumbers = new Set<number>()
  let start: number | undefined
  let end = 0
  for (const hunk of hunks) {
    let before = hunk.oldStart
    let after = hunk.newStart
    let first = true
    for (const line of hunk.lines) {
      const sign = line[0]
      if (sign === "\\") continue
      const include = view === "diff" || (view === "before" ? sign !== "+" : sign !== "-")
      if (include) {
        if (first && lines.length) {
          hideLineNumbers.add(lines.length)
          lines.push("")
        }
        first = false
        const row = lines.length
        const number = sign === "-" || view === "before" ? before : after
        start ??= number
        end = number
        numbers.set(row, number)
        if (view === "diff" && (sign === "+" || sign === "-")) signs.set(row, sign)
        lines.push(line.slice(1))
      }
      if (sign !== "+") before++
      if (sign !== "-") after++
    }
  }
  if (!lines.length) hideLineNumbers.add(0)
  return { text: lines.join("\n"), numbers, signs, hideLineNumbers, start: start ?? 0, end, empty: !lines.length }
}
