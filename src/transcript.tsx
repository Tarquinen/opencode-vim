// TSX ensures the plugin loader shares the host's OpenTUI classes.
import type { Context } from "@opencode/plugin/tui/context"
import { ScrollBoxRenderable, type OptimizedBuffer, type Renderable } from "@opentui/core"

type Message = ReturnType<Context["data"]["session"]["message"]["list"]>[number]
export type ReadableMessage = { id: string; author: string; text: string }

export function readableMessage(message: Message): ReadableMessage | undefined {
  const parts: string[] = []
  if (message.type === "user") parts.push(message.text)
  else if (message.type === "assistant") {
    for (const part of message.content) if (part.type === "text") parts.push(part.text)
  }
  const text = parts.join("\n\n")
  if (text.trim()) return { id: message.id, author: message.type === "user" ? "You" : "Assistant", text }
}

// OpenCode's SessionRowView identifies message boundaries with the message ID,
// and subsequent parts with session-part:<messageID>:<partID> (routes/session/rows.ts).
// Keep this host-layout dependency here. Scroll mounted messages into view without
// the host's message-jump commands, which top-align rows and add navigation slack.
export function createTranscriptSelection(context: Context, sessionID: string, select: (id: string | undefined) => void) {
  let scroll: ScrollBoxRenderable | undefined
  let requestedID: string | undefined
  let navigation: {
    from: string | undefined
    offset: number
    loading?: { key: string; frame: number; up: boolean; height: number }
  } | undefined

  function readableMessages() {
    const result: Message[] = []
    for (const message of context.data.session.message.list(sessionID)) {
      if (readableMessage(message)) result.push(message)
    }
    return result
  }

  function advance() {
    if (!navigation) return
    const messages = readableMessages()
    const view = inspect()
    const from = navigation.from ? messages.findIndex((message) => message.id === navigation!.from) : messages.length
    if (navigation.from && from === -1) { navigation = undefined; return }
    const target = Math.min(from + navigation.offset, messages.length - 1)

    // Prepending history moves existing rows before the host restores their
    // screen position after layout. Wait for that compensation before scrolling.
    const loading = navigation.loading
    if (loading && context.renderer.frameId < loading.frame) {
      context.renderer.requestRender()
      return
    }
    if (view && loading?.up && view.scroll.scrollHeight > loading.height) {
      const maximum = Math.max(0, view.scroll.scrollHeight - view.scroll.viewport.height)
      const compensated = Math.max(0, Math.min(maximum, view.scroll.scrollHeight - loading.height - 1))
      if (view.scroll.scrollTop < compensated) return
    }

    if (target >= 0) {
      requestedID = messages[target].id
      select(requestedID)
      const range = view?.ranges.find((range) => range.id === requestedID)
      if (view && range) {
        navigation = undefined
        let delta = 0
        if (range.bottom <= view.top) delta = range.top - view.top
        else if (range.top >= view.bottom) {
          // Short messages fit against the bottom edge; long ones start at the
          // top because they need the entire viewport. Never add blank space.
          delta = range.top - view.top - Math.max(0, view.bottom - view.top - (range.bottom - range.top))
        }
        if (delta) {
          const slack = view.scroll.getRenderable("session-navigation-slack")?.height ?? 0
          const maximum = Math.max(0, view.scroll.scrollHeight - slack - view.scroll.viewport.height)
          const position = Math.max(0, Math.min(maximum, view.scroll.scrollTop + delta))
          if (slack) context.keymap.dispatch(delta < 0 ? "session.line.up" : "session.line.down")
          view.scroll.scrollTo(position)
          context.renderer.requestRender()
        }
        return
      }
    }

    // Only ordinary scrolling asks OpenCode to mount/fetch more history. Retry
    // when rows change, not every frame, so an exhausted history stays idle.
    const first = view?.ranges[0]
    const firstIndex = messages.findIndex((message) => message.id === first?.id)
    const up = target < 0 || target < firstIndex
    const key = `${messages[0]?.id}:${messages.length}:${first?.id}:${view?.ranges.at(-1)?.id}:${view?.scroll.scrollHeight}`
    if (loading?.key === key) return
    navigation.loading = {
      key,
      frame: context.renderer.frameId + 2,
      up,
      height: view?.scroll.scrollHeight ?? 0,
    }
    view?.scroll.scrollTo(up ? 0 : view.scroll.scrollHeight)
    context.keymap.dispatch(up ? "session.line.up" : "session.line.down")
    context.renderer.requestRender()
  }

  function latest() {
    const messages = readableMessages()
    requestedID = messages.at(-1)?.id
    select(requestedID)
    navigation = requestedID ? { from: requestedID, offset: 0 } : undefined
    advance()
  }

  function move(direction: "next" | "previous", count: number) {
    if (navigation && ((navigation.offset < 0 && direction === "next") || (navigation.offset > 0 && direction === "previous"))) {
      navigation = undefined
    }
    navigation ??= { from: requestedID ?? inspect()?.selected?.id, offset: 0 }
    navigation.offset += direction === "next" ? count : -count
    if (navigation.loading) navigation.loading.key = "" // A new key can retry a failed history request.
    advance()
  }

  function inspect() {
    const messages = new Map<string, Message>()
    for (const message of context.data.session.message.list(sessionID)) messages.set(message.id, message)
    if (requestedID && !messages.has(requestedID)) requestedID = undefined
    function messageID(node: Renderable) {
      if (messages.has(node.id)) return node.id
      const match = /^session-part:([^:]+):/.exec(node.id)
      if (match && messages.has(match[1])) return match[1]
    }
    function findScroll(node: Renderable): ScrollBoxRenderable | undefined {
      if (!node.visible) return
      if (node instanceof ScrollBoxRenderable && node.getChildren().some((child) => messageID(child))) return node
      for (const child of node.getChildren()) {
        const found = findScroll(child)
        if (found) return found
      }
    }
    if (!scroll || scroll.isDestroyed) scroll = findScroll(context.renderer.root)
    if (!scroll) { select(requestedID); return }

    const ranges: Array<{ id: string; top: number; bottom: number }> = []
    let current: (typeof ranges)[number] | undefined
    for (const row of scroll.getChildren()) {
      if (row.id === "session-navigation-slack") break
      if (!row.visible || row.height === 0) continue
      const id = messageID(row)
      if (id && id !== current?.id) {
        current = { id, top: row.y, bottom: row.y + row.height }
        ranges.push(current)
      } else if (current) current.bottom = row.y + row.height
    }
    const top = scroll.viewport.y
    const bottom = top + scroll.viewport.height
    const visible = ranges.filter((range) => range.bottom > top && range.top < bottom && readableMessage(messages.get(range.id)!))
    // Assistant jumps align one row before their first part. Otherwise use the
    // message crossing the viewport's top, including the middle of a long reply.
    let selected: (typeof ranges)[number] | undefined = visible.find((range) => range.top <= top + 1 && range.bottom > top + 1) ?? visible[0]
    if (requestedID) selected = ranges.find((range) => range.id === requestedID)
    select(selected?.id ?? requestedID)
    return { scroll, selected, ranges, top, bottom }
  }

  return {
    latest,
    move,
    followViewport() { navigation = undefined; requestedID = undefined },
    focus() { inspect()?.scroll.focus() },
    sync() { advance(); navigation = undefined; return inspect() },
    draw(buffer: OptimizedBuffer) {
      advance()
      const view = inspect()
      if (!view?.selected) return
      const x = view.scroll.x - 1
      if (x < 0) return
      const top = Math.max(0, view.top, view.selected.top)
      const bottom = Math.min(buffer.height, view.bottom, view.selected.bottom)
      for (let y = top; y < bottom; y++) {
        buffer.drawText("▎", x, y, context.theme.text.feedback.warning.base, context.theme.background.base)
      }
    },
  }
}
