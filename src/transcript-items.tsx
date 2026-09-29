// Mirrors OpenCode's routes/session/{rows,group-view,anchor-view}.tsx.
// TSX keeps OpenTUI classes shared with the host under the runtime loader.
import type { Context } from "@opencode/plugin/tui/context"
import { MarkdownRenderable, TextBufferRenderable, type Renderable } from "@opentui/core"

type Message = ReturnType<Context["data"]["session"]["message"]["list"]>[number]
type GroupKind = "reasoning" | "exploration" | "activity" | "instructions"
export type TranscriptSource = Message | Extract<Message, { type: "assistant" }>["content"][number]
export type TranscriptItem = { id: string; author: string; text: string; source?: TranscriptSource; fileIndex?: number }
export type TranscriptRange = TranscriptItem & {
  node: Renderable
  top: number
  bottom: number
  toggle?: Renderable
  parentID?: string
}

type Part = TranscriptItem & { messageID: string; kind: string; group?: GroupKind; label?: string }

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
          text, source: part,
          group: part.type === "reasoning" ? "reasoning"
            : part.type === "tool" && ["read", "glob", "grep", "webfetch", "websearch"].includes(part.name.toLowerCase())
              ? "exploration" : undefined })
      }
      // Turn footers prevent groups from spanning into the next assistant turn.
      if ((message.finish && message.finish !== "tool-calls" && message.finish !== "unknown") || message.error || message.retry) {
        result.push({ id: `footer:${message.id}`, messageID: message.id, kind: "footer", author: "", text: "" })
      }
    } else if (message.type === "synthetic" && message.metadata?.source === "shell" && message.description?.trim()) {
      const state = message.metadata.state
      const status = state === "completed" ? "finished" : state === "error" ? "failed" : state ?? "finished"
      result.push({ id: message.id, messageID: message.id, kind: "message", author: "Shell", text: message.text, source: message,
        label: `${state === "completed" ? "↳" : "!"} Shell ${status} · ${message.description.replace(/\s+/g, " ").trim()}` })
    } else {
      result.push({ id: message.id, messageID: message.id, kind: "message", author: message.type === "user" ? "You" : message.type,
        text: message.type === "user" ? message.text : "", source: message })
    }
  }
  return result
}

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

export function groupAt(node: Renderable) {
  const header = node.getChildren()[0]
  if (!header) return
  const body = header.getChildren()[0]
  let label: string
  if (body instanceof TextBufferRenderable) {
    if (!body.plainText.startsWith("⋯ ")) return
    label = body.plainText.slice(2).trim()
  } else {
    const cells = body?.getChildren() ?? []
    if (cells.length < 2 || !cells.slice(1).every((cell) => cell instanceof TextBufferRenderable)) return
    label = cells.slice(1).map((cell) => (cell as TextBufferRenderable).plainText).join(" ").trim()
  }
  let kind: GroupKind
  if (/^(Thought|Thinking)(?:$|[: ·…])/.test(label)) kind = "reasoning"
  else if (/^Explor(?:ed|ing):/.test(label)) kind = "exploration"
  else if (/^Instructions:/.test(label)) kind = "instructions"
  else if (/^(?:\d+ (?:commands?|edits?|thoughts?|reads?|tools?|instructions?)(?:, |$))+$/.test(label)
    || /^(?:Running|Preparing) .+…$/.test(label)) kind = "activity"
  else return
  return { header, kind, label, children: node.getChildren().slice(1) }
}

function patchFiles(node: Renderable): Renderable[] {
  if (!node.visible || !node.height) return []
  const header = node.getChildren()[0]
  const label = header?.getChildren()[0]
  if (label instanceof TextBufferRenderable && ["← Patched", "# Created", "# Deleted"].includes(label.plainText)) {
    return [node]
  }
  const files: Renderable[] = []
  for (const child of node.getChildren()) files.push(...patchFiles(child))
  return files
}

export function transcriptItems(rows: Renderable[], messages: Message[], pendingTools = new Set<string>()) {
  const sources = parts(messages)
  const ranges: TranscriptRange[] = []
  let cursor = 0
  let lastSource = -1

  function add(node: Renderable, source?: Part, parentID?: string) {
    if (source?.source?.type === "tool" && source.source.name === "patch") {
      const files = patchFiles(node)
      if (files.length > 1) {
        for (const [index, file] of files.entries()) add(file, { ...source, id: `${source.id}:file:${index}`, fileIndex: index }, parentID)
        return
      }
    }
    const text = source?.text || textOf(node)
    if (!text.trim()) return
    ranges.push({ id: source?.id ?? node.id, author: source?.author ?? "Tool", text, source: source?.source, fileIndex: source?.fileIndex, node,
      top: node.y, bottom: node.y + node.height, parentID })
  }

  function belongs(part: Part, kind: GroupKind) {
    if (kind !== "activity") return part.group === kind
    if (part.source?.type === "tool" && part.source.name === "question") return false
    return part.kind === "tool" || part.kind === "reasoning"
  }

  function group(node: Renderable, items: Part[], parentID?: string, pending: Part[] = []): boolean {
    const info = groupAt(node)
    if (!info) return false
    const id = node.id
    ranges.push({ id, author: info.label, text: info.label, node: info.header,
      top: info.header.y, bottom: info.header.y + info.header.height, toggle: info.header, parentID })
    const ordinaryCount = info.children.length - pending.length
    let children = info.children.slice(0, ordinaryCount)
    // Only exploration groups have EntryAnchors directly under GroupAnchor.
    if (info.kind !== "exploration" && children.length) {
      children = children[0].getChildren()
    }
    let index = 0
    for (const child of children) {
      if (!child.visible || !child.height) continue
      const nested = groupAt(child)
      if (nested) {
        const start = index
        while (index < items.length && belongs(items[index], nested.kind)) index++
        group(child, items.slice(start, index), id)
      } else add(child, items[index++], id)
    }
    for (let index = 0; index < pending.length; index++) {
      add(info.children[ordinaryCount + index], pending[index], id)
    }
    return true
  }

  for (const row of rows) {
    if (row.id === "session-navigation-slack") break
    if (!row.visible || !row.height) continue
    const anchor = row.getChildren()[0]
    const info = anchor && groupAt(anchor)
    // Groups can consume a message's first parts without claiming its row ID.
    let index = sources.findIndex((part) => part.id === row.id)
    if (index === -1) {
      index = sources.findIndex((part, position) => position >= cursor && part.messageID === row.id)
      if (index !== -1 && !info) {
        const text = textOf(row).trim()
        const match = sources.findIndex((part, position) => position >= cursor && part.messageID === row.id && part.text.trim() === text)
        if (text && match !== -1) index = match
      }
    }
    if (index === -1 && !info) {
      // Completion notices have no native row ID; their visible label identifies the saved message.
      const text = textOf(row).trim()
      if (text) index = sources.findIndex((part, position) => position >= cursor && part.label !== undefined &&
        (part.label === text || (text.endsWith("…") && part.label.startsWith(text.slice(0, -1)))))
    }
    if (index !== -1) cursor = index
    if (!info && index === -1 && sources[cursor]?.kind === "footer") {
      lastSource = cursor++
      continue
    }
    const container = anchor && !(anchor instanceof TextBufferRenderable) && !(anchor instanceof MarkdownRenderable)
    if (index === -1 && !info && sources[cursor]?.group && container) index = cursor
    if (index === -1 && !info && sources[cursor]?.source?.type === "shell" && container) index = cursor
    if (anchor && info) {
      // Track grouped sources to detect newer cached rows that aren't mounted yet.
      const items: Part[] = []
      const pending: Part[] = []
      while (cursor < sources.length) {
        const part = sources[cursor]
        if (!belongs(part, info.kind)) break
        if (part.source?.type === "tool" && pendingTools.has(part.source.id)) pending.push(part)
        else items.push(part)
        lastSource = cursor++
      }
      // OpenCode renders permission-blocked tools after the ordinary group entries.
      group(anchor, items, undefined, pending)
    } else if (index !== -1) {
      const source = sources[index]
      if (source.kind === "footer") {
        lastSource = cursor++
      } else if (source.group && container && anchor.getChildren().length) {
        // With grouping disabled, the GroupAnchor holds individual EntryAnchors.
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
  }
  let last = sources.length - 1
  while (last >= 0 && (sources[last].kind === "footer" ||
    (sources[last].kind === "message" && sources[last].source?.type !== "shell")) && !sources[last].text) last--
  return { ranges, hasLatest: lastSource >= last }
}
