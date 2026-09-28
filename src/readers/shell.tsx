/** @jsxImportSource @opentui/solid */
import { createSignal, onCleanup, onMount, Show } from "solid-js"
import { loadShell, shellSnapshot, type ShellSnapshot, type ShellSource } from "./shell-data"
import { ReaderHeader, TextReader } from "./text"
import type { ReaderProps } from "./types"

export function ShellReader(props: ReaderProps & { source: ShellSource }) {
  const theme = () => props.context.theme.surface("dialog")
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  const initial = shellSnapshot(props.source)
  const [snapshot, setSnapshot] = createSignal<ShellSnapshot>()
  onMount(async () => {
    const result = await loadShell(props.context, props.sessionID, props.source, controller.signal)
    if (!controller.signal.aborted) setSnapshot(result)
  })
  return <box><Show when={snapshot()} fallback={
    <box gap={1} paddingBottom={1}>
      <ReaderHeader context={props.context} title="Shell output" status={initial.status} back={props.back} />
      <text paddingLeft={2} fg={theme().text.muted}>Loading output…</text>
    </box>
  }>{(data) => <TextReader {...props} title="Shell output" status={data().status}
    text={data().output || "No captured output."}
    details={<box paddingLeft={2} paddingRight={2} gap={1}>
      <text fg={theme().text.muted} maxHeight={3} wrapMode="word">{data().command || "Receiving command…"}</text>
      <Show when={data().workdir}>{(directory) => <text fg={theme().text.muted} maxHeight={1}>
        {props.context.ui.format.path(directory())}
      </text>}</Show>
      <Show when={data().notice}><text fg={theme().text.muted}>{data().notice}</text></Show>
    </box>} />
  }</Show></box>
}
