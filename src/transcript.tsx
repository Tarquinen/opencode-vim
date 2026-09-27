// TSX ensures the plugin loader shares the host's OpenTUI classes.
import type { Context } from "@opencode/plugin/tui/context"
import { MouseEvent, ScrollBoxRenderable, type OptimizedBuffer, type Renderable } from "@opentui/core"
import { transcriptItems, type TranscriptRange } from "./transcript-items"

export function createTranscriptSelection(context: Context, sessionID: string, select: (id: string | undefined) => void) {
  let scroll: ScrollBoxRenderable | undefined
  let requestedID: string | undefined
  let selectedParents: string[] = []
  let navigation: {
    from: string | undefined
    offset: number
    latest?: boolean
    loading?: { key: string; frame: number; up: boolean; height: number }
  } | undefined

  function choose(range: TranscriptRange, view: NonNullable<ReturnType<typeof inspect>>) {
    requestedID = range.id
    select(requestedID)
    let delta = 0
    if (range.bottom <= view.top) delta = range.top - view.top
    else if (range.top >= view.bottom) {
      delta = range.top - view.top - Math.max(0, view.bottom - view.top - (range.bottom - range.top))
    }
    if (delta) {
      const slack = view.scroll.getRenderable("session-navigation-slack")?.height ?? 0
      const maximum = Math.max(0, view.scroll.scrollHeight - slack - view.scroll.viewport.height)
      const position = Math.max(0, Math.min(maximum, view.scroll.scrollTop + delta))
      if (slack) context.keymap.dispatch(delta < 0 ? "session.line.up" : "session.line.down")
      view.scroll.scrollTo(position)
    }
    context.renderer.requestRender()
  }

  function advance() {
    if (!navigation) return
    const view = inspect()
    const ranges = view?.ranges ?? []
    const from = navigation.from ? ranges.findIndex((range) => range.id === navigation!.from) : ranges.length
    if (navigation.from && from === -1) { navigation = undefined; return }
    const target = navigation.latest ? ranges.length - 1 : from + navigation.offset
    const loading = navigation.loading
    // OpenCode compensates for prepended rows after two animation frames.
    if (loading && context.renderer.frameId < loading.frame) {
      context.renderer.requestRender()
      return
    }
    if (view && loading?.up && view.scroll.scrollHeight > loading.height) {
      const maximum = Math.max(0, view.scroll.scrollHeight - view.scroll.viewport.height)
      const compensated = Math.max(0, Math.min(maximum, view.scroll.scrollHeight - loading.height - 1))
      if (view.scroll.scrollTop < compensated) return
    }
    if (view && target >= 0 && target < ranges.length && (!navigation.latest || view.hasLatest)) {
      navigation = undefined
      choose(ranges[target], view)
      return
    }
    const up = !navigation.latest && target < 0
    const messages = context.data.session.message.list(sessionID)
    const key = `${messages[0]?.id}:${messages.length}:${ranges[0]?.id}:${ranges.at(-1)?.id}:${view?.scroll.scrollHeight}`
    if (loading?.key === key) return
    navigation.loading = { key, frame: context.renderer.frameId + 2, up, height: view?.scroll.scrollHeight ?? 0 }
    view?.scroll.scrollTo(up ? 0 : view.scroll.scrollHeight)
    context.keymap.dispatch(up ? "session.line.up" : "session.line.down")
    context.renderer.requestRender()
  }

  function latest() {
    if (!context.data.session.message.list(sessionID).length) {
      navigation = undefined
      requestedID = undefined
      select(undefined)
      return
    }
    navigation = { from: undefined, offset: 0, latest: true }
    advance()
  }

  function move(direction: "next" | "previous", count: number) {
    if (navigation && (navigation.latest || (navigation.offset < 0 && direction === "next") || (navigation.offset > 0 && direction === "previous"))) {
      navigation = undefined
    }
    navigation ??= { from: requestedID ?? inspect()?.selected?.id, offset: 0 }
    navigation.offset += direction === "next" ? count : -count
    if (navigation.loading) navigation.loading.key = ""
    advance()
  }

  function inspect() {
    const messages = context.data.session.message.list(sessionID)
    const ids = new Set(messages.map((message) => message.id))
    function isRow(node: Renderable) {
      return ids.has(node.id) || (node.id.startsWith("session-part:") && ids.has(node.id.split(":")[1]))
    }
    function findScroll(node: Renderable): ScrollBoxRenderable | undefined {
      if (!node.visible) return
      if (node instanceof ScrollBoxRenderable && node.getChildren().some(isRow)) return node
      for (const child of node.getChildren()) {
        const found = findScroll(child)
        if (found) return found
      }
    }
    if (!scroll || scroll.isDestroyed) scroll = findScroll(context.renderer.root)
    if (!scroll) { select(undefined); return }
    const { ranges, hasLatest } = transcriptItems(scroll.getChildren(), messages)
    const top = scroll.viewport.y
    const bottom = top + scroll.viewport.height
    let selected = ranges.find((range) => range.id === requestedID)
    if (!selected && requestedID) {
      for (const id of selectedParents) {
        selected = ranges.find((range) => range.id === id)
        if (selected) { requestedID = id; break }
      }
      if (!selected) requestedID = undefined
    }
    selected ??= ranges.find((range) => range.top <= top + 1 && range.bottom > top + 1)
      ?? ranges.find((range) => range.bottom > top && range.top < bottom)
    selectedParents = []
    let parent = selected?.parentID
    while (parent) {
      selectedParents.push(parent)
      parent = ranges.find((range) => range.id === parent)?.parentID
    }
    select(selected?.id)
    return { scroll, selected, ranges, hasLatest, top, bottom }
  }

  return {
    latest, move,
    get(id: string | undefined) {
      if (!scroll || scroll.isDestroyed) return
      return transcriptItems(scroll.getChildren(), context.data.session.message.list(sessionID)).ranges.find((range) => range.id === id)
    },
    toggle() {
      const range = inspect()?.selected
      if (!range?.toggle) return false
      navigation = undefined
      requestedID = range.id
      const node = range.toggle
      node.processMouseEvent(new MouseEvent(node, { type: "up", button: 0, x: node.x, y: node.y,
        modifiers: { shift: false, alt: false, ctrl: false } }))
      context.renderer.requestRender()
      return true
    },
    followViewport() { navigation = undefined; requestedID = undefined; selectedParents = [] },
    focus() { inspect()?.scroll.focus() },
    sync() { advance(); navigation = undefined; return inspect() },
    draw(buffer: OptimizedBuffer, yankID?: string) {
      advance()
      const view = inspect()
      if (!view?.selected) return
      const top = Math.max(0, view.top, view.selected.top)
      const bottom = Math.min(buffer.height, view.bottom, view.selected.bottom)
      if (view.selected.id === yankID) {
        const node = view.selected.node
        const left = Math.max(0, view.scroll.viewport.x, node.x)
        const right = Math.min(buffer.width, view.scroll.viewport.x + view.scroll.viewport.width, node.x + node.width)
        const foreground = context.theme.background.base.buffer
        const background = context.theme.text.feedback.info.base.buffer
        const colors = buffer.buffers
        // Change only colors to preserve wide-character continuation cells.
        for (let y = top; y < bottom; y++) {
          for (let x = left; x < right; x++) {
            const offset = (y * buffer.width + x) * 4
            colors.fg.set(foreground, offset)
            colors.bg.set(background, offset)
          }
        }
      }
      const x = view.scroll.x - 1
      if (x < 0) return
      for (let y = top; y < bottom; y++) {
        buffer.drawText("▎", x, y, context.theme.text.feedback.warning.base, context.theme.background.base)
      }
    },
  }
}
