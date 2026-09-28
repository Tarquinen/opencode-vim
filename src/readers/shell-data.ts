import { stripVTControlCharacters } from "node:util"
import type { Context } from "@opencode/plugin/tui/context"
import type { TranscriptSource } from "../transcript-items"

export type ShellSource = Extract<TranscriptSource, { type: "shell" | "tool" }>
export type ShellSnapshot = {
  command: string
  workdir?: string
  shellID?: string
  status: string
  output: string
  notice: string
}

export const OUTPUT_LIMIT = 1024 * 1024

export function shellSnapshot(source: ShellSource): ShellSnapshot {
  if (source.type === "shell") return {
    command: source.command, shellID: source.shellID,
    status: shellStatus(source.status, source.exit),
    output: cleanOutput(source.output?.output ?? ""),
    notice: source.output?.truncated ? "Saved output is truncated" : "",
  }
  const state = source.state
  if (state.status === "streaming") return { command: "", status: "Receiving command…", output: "", notice: "" }
  const metadata = state.metadata ?? {}
  let output = ""
  if (state.status === "completed" || state.status === "error") {
    for (const part of state.content ?? []) {
      if (part.type !== "text") continue
      if (output) output += "\n\n"
      output += part.text
    }
  }
  let status = state.status === "running" ? "Running · snapshot" : "Completed"
  if (state.status === "error") {
    status = "Failed"
    if (!output) output = state.error.message
  } else if (metadata.timeout === true) status = "Timed out"
  else if (typeof metadata.signal === "string") status = `Killed · ${metadata.signal}`
  else if (metadata.status === "running") status = "Backgrounded"
  else if (typeof metadata.exit === "number") status = shellStatus("exited", metadata.exit)
  return {
    command: typeof state.input.command === "string" ? state.input.command : "",
    workdir: typeof state.input.workdir === "string" ? state.input.workdir : undefined,
    shellID: typeof metadata.shellID === "string" ? metadata.shellID : undefined,
    status, output: cleanOutput(output), notice: metadata.truncated === true ? "Saved output is truncated" : "",
  }
}

function shellStatus(status: string, exit?: number | string) {
  if (status === "running") return "Running · snapshot"
  if (status === "timeout") return "Timed out"
  if (status === "killed") return "Killed"
  return exit === undefined ? "Exited" : `Exited · code ${exit}`
}

function cleanOutput(text: string) {
  return stripVTControlCharacters(text).replace(/\r\n?/g, "\n")
}

export async function loadShell(context: Context, sessionID: string, source: ShellSource, signal: AbortSignal) {
  const snapshot = shellSnapshot(source)
  if (!snapshot.shellID) return snapshot
  const location = context.data.session.get(sessionID)?.location ?? context.location
  const input = { id: snapshot.shellID, location }
  try {
    const [shell, output] = await Promise.all([
      context.client.shell.get(input, { signal }),
      context.client.shell.output({ ...input, cursor: 0, limit: OUTPUT_LIMIT }, { signal }),
    ])
    const info = shell.data
    const page = output.data
    return {
      ...snapshot, command: info.command, workdir: info.cwd, status: shellStatus(info.status, info.exit),
      output: cleanOutput(page.output),
      notice: page.cursor < page.size ? "Output truncated · showing first 1 MiB" : "",
    }
  } catch {
    if (signal.aborted) return snapshot
    snapshot.notice = snapshot.notice
      ? `Capture unavailable · showing saved result · ${snapshot.notice}`
      : "Capture unavailable · showing saved result"
    return snapshot
  }
}
