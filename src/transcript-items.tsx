// Native transcript structure lives here: SessionRowView, GroupAnchor and
// EntryAnchor in OpenCode's routes/session/{rows,group-view,anchor-view}.tsx.
// TSX keeps OpenTUI classes shared with the host under the runtime loader.
import type { Context } from "@opencode/plugin/tui/context"
import { MarkdownRenderable, TextBufferRenderable, type Renderable } from "@opentui/core"

type Message = ReturnType<Context["data"]["session"]["message"]["list"]>[number]
type GroupKind = "reasoning" | "exploration" | "activity" | "instructions"
export type TranscriptItem = { id: string; author: string; text: string }
export type TranscriptRange = TranscriptItem & {
  node: Renderable
  top: number
  bottom: number
  toggle?: Renderable
  parentID?: string
}

type Part = TranscriptItem & { messageID: string; kind: string; group?: GroupKind }

function parts(messages: Message[]) {
  const result: Part[] = []
  for (const message of messages) {
    if (message.type === "assistant") {
      const ordinal = { text: 0, reasoning: 0 }
      for (const part of message.content) {
        const partID = part.type === "tool" ? part.id : `${part.type}:${ordinal[part.type]++}`
        let text = part.type === "tool" ? "" : part.text
        if (part.type === "reasoning") text = text.replace("[REDACTED]", "")
        if (part.type !== "tool" && !text.trim()) continue
        result.push({ id: `session-part:${message.id}:${partID}`, messageID: message.id, kind: part.type,
          author: part.type === "text" ? "Assistant" : part.type === "reasoning" ? "Reasoning" : part.name,
          text,
          group: part.type === "reasoning" ? "reasoning"
            : part.type === "tool" && ["read", "glob", "grep", "webfetch", "websearch"].includes(part.name.toLowerCase())
              ? "exploration" : undefined })
      }
      // A completed turn's footer terminates a native group before the next
      // assistant message, even when their parts have the same group kind.
      if ((message.finish && message.finish !== "tool-calls" && message.finish !== "unknown") || message.error || message.retry) {
        result.push({ id: `footer:${message.id}`, messageID: message.id, kind: "footer", author: "", text: "" })
      }
    } else {
      // Non-content messages also delimit native groups, even if they render no text.
      result.push({ id: message.id, messageID: message.id, kind: "message", author: message.type === "user" ? "You" : message.type,
        text: message.type === "user" ? message.text : "" })
    }
  }
  return result
}

// Prefer original Markdown, including code fences, over its rendered children.
function textOf(node: Renderable): string {
  if (!node.visible) return ""
  if (node instanceof MarkdownRenderable) return node.content
  if (node instanceof TextBufferRenderable) return node.plainText
  let text = ""
  let previous: Renderable | undefined
  for (const child of node.getChildren()) {
    const value = textOf(child)
    if (!value) continue
    if (text) text += previous?.y === child.y ? " " : "\n"
    text += value
    previous = child
  }
  return text
}

function groupAt(node: Renderable) {
  const header = node.getChildren()[0]
  if (!header) return
  // InlineToolRow contains the icon and label in a horizontal row. Do not
  // interpret arbitrary tool output or Markdown as a disclosure control.
  const cells = header.getChildren()[0]?.getChildren() ?? []
  if (cells.length < 2 || !cells.every((cell) => cell instanceof TextBufferRenderable)) return
  const label = cells.slice(1).map((cell) => (cell as TextBufferRenderable).plainText).join(" ").trim()
  let kind: GroupKind
  if (/^(Thought|Thinking)(?:$|[: ·…])/.test(label)) kind = "reasoning"
  else if (/^Explor(?:ed|ing):/.test(label)) kind = "exploration"
  else if (/^Instructions:/.test(label)) kind = "instructions"
  else if (/^(?:\d+ (?:commands?|edits?|thoughts?|reads?|tools?|instructions?)(?:, |$))+$/.test(label)
    || /^(?:Running|Preparing) .+…$/.test(label)) kind = "activity"
  else return
  return { header, kind, label, children: node.getChildren().slice(1) }
}

export function transcriptItems(rows: Renderable[], messages: Message[]) {
  const sources = parts(messages)
  const ranges: TranscriptRange[] = []
  let cursor = 0
  let lastSource = -1

  function add(node: Renderable, source?: Part, parentID?: string) {
    const text = source?.text || textOf(node)
    if (!text.trim()) return
    ranges.push({ id: source?.id ?? node.id, author: source?.author ?? "Tool", text, node,
      top: node.y, bottom: node.y + node.height, parentID })
  }

  function group(node: Renderable, parentID?: string): boolean {
    const info = groupAt(node)
    if (!info) return false
    const id = node.id
    ranges.push({ id, author: info.label, text: info.label, node: info.header,
      top: info.header.y, bottom: info.header.y + info.header.height, toggle: info.header, parentID })
    let children = info.children
    // Reasoning/activity/instruction bodies have a padding/gap wrapper;
    // exploration's EntryAnchors are direct children of the GroupAnchor.
    if (info.kind !== "exploration" && children.length) {
      children = [...children[0].getChildren(), ...children.slice(1)]
    }
    for (const child of children) {
      if (!child.visible || !child.height) continue
      if (!group(child, id)) add(child, undefined, id)
    }
    return true
  }

  for (const row of rows) {
    if (row.id === "session-navigation-slack") break
    if (!row.visible || !row.height) continue
    // A group can consume the first parts of a later message without claiming
    // that message's boundary ID. Its next standalone row then owns that ID.
    let index = sources.findIndex((part) => part.id === row.id)
    if (index === -1) index = sources.findIndex((part, position) => position >= cursor && part.messageID === row.id)
    if (index !== -1) cursor = index
    const anchor = row.getChildren()[0]
    const info = anchor && groupAt(anchor)
    if (!info && index === -1 && sources[cursor]?.kind === "footer") {
      lastSource = cursor++
      continue
    }
    const container = anchor && !(anchor instanceof TextBufferRenderable) && !(anchor instanceof MarkdownRenderable)
    if (index === -1 && !info && sources[cursor]?.group && container) index = cursor
    if (anchor && info) {
      group(anchor)
      // A collapsed group can span several stored assistant messages. Count
      // its source extent only to detect whether newer cached rows are unmounted.
      while (cursor < sources.length) {
        const part = sources[cursor]
        if (info.kind === "activity" ? part.kind !== "tool" && part.kind !== "reasoning" : part.group !== info.kind) break
        lastSource = cursor++
      }
    } else if (index !== -1) {
      const source = sources[index]
      // With grouping disabled, the GroupAnchor holds individual EntryAnchors.
      if (source.kind === "footer") {
        lastSource = cursor++
      } else if (source.group && container && anchor.getChildren().length) {
        for (const child of anchor.getChildren()) {
          add(child, sources[cursor])
          cursor++
        }
        lastSource = cursor - 1
      } else {
        add(row, source)
        lastSource = cursor++
      }
    }
    // Anonymous footers and usage summaries are not separate content items.
  }
  let last = sources.length - 1
  while (last >= 0 && (sources[last].kind === "message" || sources[last].kind === "footer") && !sources[last].text) last--
  return { ranges, hasLatest: lastSource >= last }
}
