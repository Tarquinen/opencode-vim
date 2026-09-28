/** @jsxImportSource @opentui/solid */
import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { useTerminalDimensions } from "@opentui/solid"
import type { TextareaRenderable } from "@opentui/core"
import { loadShell, type ShellSnapshot, type ShellSource } from "./data"
import { ReaderHeader, TextReader } from "../text"
import type { ReaderProps } from "../types"
import { createReaderSyntax, highlightCode } from "../syntax"
import { highlightDiff } from "./syntax"

export function ShellReader(props: ReaderProps & { source: ShellSource }) {
  const theme = () => props.context.theme.surface("dialog")
  const dimensions = useTerminalDimensions()
  const syntax = createReaderSyntax(props.context)
  let command!: TextareaRenderable
  const commandHeight = () => Math.max(1, Math.min(4, Math.floor(dimensions().height / 6)))
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const [snapshot, setSnapshot] = createSignal<ShellSnapshot>()
  onMount(async () => {
    const result = await loadShell(props.context, props.sessionID, props.source, controller.signal)
    if (!controller.signal.aborted) setSnapshot(result)
  })
  return <box><Show when={snapshot()} fallback={
    <box gap={1} paddingBottom={1}>
      <ReaderHeader context={props.context} title="Shell output" back={props.back} />
      <text paddingLeft={2} fg={theme().text.muted}>Loading output…</text>
    </box>
  }>{(data) => <TextReader {...props} title="Shell output" status={data().status}
    text={data().output ? data().output.replace(/\n$/, "") : "No captured output."}
    label="Output" leading={() => command} highlight={(input) => highlightDiff(input, syntax, props.context.renderer.widthMethod)}
    maxHeight={Math.max(1, Math.min(30, dimensions().height - commandHeight() - (data().notice ? 12 : 10)))}
    details={<box paddingLeft={2} paddingRight={2}>
      <box flexDirection="row" gap={2}>
        <text fg={theme().text.muted}><b>Command</b></text>
        <Show when={data().workdir}>{(directory) => <text fg={theme().text.muted} flexGrow={1} flexShrink={1} minWidth={0} truncate>
          {props.context.ui.format.path(directory())}
        </text>}</Show>
      </box>
      <textarea id="vim-shell-command" ref={(input: TextareaRenderable) => {
        command = input
        onMount(() => { void highlightCode(input, syntax, "bash", controller.signal, props.context.renderer.widthMethod) })
      }} initialValue={data().command || "Receiving command…"} minHeight={1} maxHeight={commandHeight()}
        wrapMode="word" showCursor cursorStyle={props.config.cursorStyles.normal}
        textColor={theme().text.base} focusedTextColor={theme().text.base}
        backgroundColor={theme().background.base} focusedBackgroundColor={theme().background.base} />
      <Show when={data().notice}><text fg={theme().text.muted} marginTop={1} wrapMode="word">{data().notice}</text></Show>
    </box>} />
  }</Show></box>
}
