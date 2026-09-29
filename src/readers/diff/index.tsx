/** @jsxImportSource @opentui/solid */
import { pathToFiletype, type LineColorConfig, type LineSign } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createMemo, createSignal, For, onCleanup, Show } from "solid-js"
import type { DiffView } from "../../modules/vim/config"
import { createReaderSyntax, highlightCode } from "../syntax"
import { TextReader } from "../text"
import type { ReaderProps } from "../types"
import { availableViews, diffContent, type DiffSnapshot } from "./data"

export function DiffReader(props: ReaderProps & { snapshot: DiffSnapshot }) {
  const data = props.snapshot
  const views = availableViews(data)
  const labels = { after: "After", before: "Before", diff: "Diff" }
  const initial = views.includes(props.config.diffView) ? props.config.diffView : views[0]
  const [view, setView] = createSignal(initial)
  const dimensions = useTerminalDimensions()
  const syntax = createReaderSyntax(props.context)
  const filetype = pathToFiletype(data.path)
  const positions = new Map<DiffView, number>([[initial, props.offset]])

  function switchView() {
    setView(views[(views.indexOf(view()) + 1) % views.length])
  }

  return <box><Show when={view()} keyed>{(current) => {
    const content = diffContent(data.hunks, current)
    const controller = new AbortController()
    onCleanup(() => controller.abort())
    const theme = () => props.context.theme.surface("dialog")
    const signs = new Map<number, LineSign>()
    for (const [row, sign] of content.signs) signs.set(row, {
      after: sign, afterColor: sign === "+" ? theme().diff.text.added : theme().diff.text.removed,
    })
    const lineColors = createMemo(() => {
      if (current !== "diff") return
      const colors = new Map<number, LineColorConfig>()
      for (const [row, sign] of content.signs) {
        const kind = sign === "+" ? "added" : "removed"
        colors.set(row, { content: theme().diff.background[kind], gutter: theme().diff.lineNumber.background[kind] })
      }
      return colors
    })
    const title = current === "after" ? "Code after change" : current === "before" ? "Code before change" : "Changes"
    const range = content.empty ? " · No lines" : data.hunks.length > 1 ? " · Saved excerpts"
      : current === "diff" ? "" : ` · Lines ${content.start}–${content.end}`
    return <TextReader {...props} title={props.context.ui.format.path(data.path)} text={content.text}
      switchLabel="switch view"
      label={`${title}${range}`} status={`${data.status === "added" ? "Added" : data.status === "deleted" ? "Deleted" : "Modified"} · +${data.additions} −${data.deletions}`}
      maxHeight={Math.max(1, Math.min(30, dimensions().height - 12))}
      gutter={{ lineNumbers: content.numbers, lineSigns: signs, hideLineNumbers: content.hideLineNumbers, lineColors: lineColors() }}
      offset={positions.get(current) ?? 0} remember={(offset) => {
        positions.set(current, offset)
        if (current === initial) props.remember(offset)
      }} change={{ run: switchView, controls: () => (
        <box paddingLeft={2} paddingRight={2} flexDirection="row" gap={1}>
          <text fg={theme().text.muted}>View</text>
          <For each={views}>{(value) => <text id={`vim-change-view-${value}`}
            fg={value === current ? theme().text.action.primary.focused : theme().text.muted}
            bg={value === current ? theme().background.action.primary.focused : undefined}
            onMouseUp={(event) => { event.stopPropagation(); setView(value) }}>
            <b>{` ${labels[value]} `}</b>
          </text>}</For>
        </box>
      ) }} highlight={(input) => {
        if (filetype) void highlightCode(input, syntax, filetype, controller.signal, props.context.renderer.widthMethod)
      }} />
  }}</Show></box>
}
