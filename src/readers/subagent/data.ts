import type { Context } from "@opencode/plugin/tui/context"
import type { TranscriptSource } from "../../transcript-items"

export type SubagentSource = Extract<TranscriptSource, { type: "tool" | "synthetic" }>
type Message = ReturnType<Context["data"]["session"]["message"]["list"]>[number]

export function subagentSnapshot(
  source: SubagentSource,
  messages: readonly Message[] = [],
): { description: string; status: string; response: string } {
  if (source.type === "synthetic") {
    const metadata = source.metadata ?? {}
    const description = source.description ?? ""
    const prefix = `<subagent sessionID="${metadata.childID}" state="${metadata.state}" description="${description}">\n`
    return {
      description,
      status: metadata.state === "error" ? "Failed" : metadata.state === "cancelled" ? "Cancelled" : "Completed",
      response: unwrap(source.text, prefix),
    }
  }

  const state = source.state
  if (state.status === "streaming") return { description: "", status: "Delegating…", response: "No response yet." }
  const description = typeof state.input.description === "string" ? state.input.description : ""
  const metadata = state.metadata ?? {}
  if (state.status === "completed" && metadata.status === "running") {
    // Background replies are saved as separate notices in the parent session.
    // Use the first matching completion, not a later continuation's response.
    for (const message of messages) {
      if (message.type === "assistant") {
        for (const part of message.content) {
          if (
            part.type === "tool" &&
            part.name === "subagent" &&
            part.time.created > source.time.created &&
            part.state.status !== "streaming" &&
            part.state.input.sessionID === metadata.sessionID
          )
            return { description, status: "Backgrounded", response: "No saved response for this subagent call." }
        }
      }
      if (
        message.type === "synthetic" &&
        message.metadata?.source === "subagent" &&
        typeof metadata.sessionID === "string" &&
        message.metadata.childID === metadata.sessionID &&
        message.description === description &&
        message.time.created >= source.time.created
      )
        return subagentSnapshot(message)
    }
    return {
      description,
      status: "Backgrounded",
      response: "No saved response yet. Reopen after the subagent finishes.",
    }
  }
  if (state.status === "running") return { description, status: "Running", response: "No response yet." }

  const prefix = `<subagent sessionID="${metadata.sessionID}" state="completed">\n`
  let response = ""
  for (const part of state.content ?? []) {
    if (part.type !== "text") continue
    if (response) response += "\n\n"
    response += unwrap(part.text, prefix)
  }
  if (state.status === "error") return { description, status: "Failed", response: response || state.error.message }
  return { description, status: "Completed", response: response || "Subagent completed without a text response." }
}

function unwrap(text: string, prefix: string) {
  const suffix = "\n</subagent>"
  if (text.startsWith(prefix) && text.endsWith(suffix)) return text.slice(prefix.length, -suffix.length)
  return text
}
