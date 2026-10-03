/** @jsxImportSource @opentui/solid */
import { Show } from "solid-js"
import { subagentSnapshot, type SubagentSource } from "./data"
import { TextReader } from "../text"
import type { ReaderProps } from "../types"

export function SubagentReader(props: ReaderProps & { source: SubagentSource }) {
  const source = props.source
  const messages =
    source.type === "tool" && source.state.status === "completed" && source.state.metadata?.status === "running"
      ? props.context.data.session.message.list(props.sessionID)
      : []
  const snapshot = subagentSnapshot(source, messages)
  const theme = () => props.context.theme.surface("dialog")
  return (
    <TextReader
      {...props}
      title="Subagent response"
      label="Response"
      status={snapshot.status}
      text={snapshot.response}
      details={
        <Show when={snapshot.description}>
          <box paddingLeft={2} paddingRight={2}>
            <text fg={theme().text.muted} truncate>
              {snapshot.description}
            </text>
          </box>
        </Show>
      }
    />
  )
}
