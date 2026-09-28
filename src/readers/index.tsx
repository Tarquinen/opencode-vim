/** @jsxImportSource @opentui/solid */
import { DefaultReader } from "./default"
import { ShellReader } from "./shell"
import type { ReaderProps } from "./types"

export function Reader(props: ReaderProps) {
  props.context.ui.dialog.set({ size: "large", centered: true })
  const source = props.message.source
  if (source?.type === "shell" || (source?.type === "tool" && source.name === "shell")) {
    return <ShellReader {...props} source={source} />
  }
  return <DefaultReader {...props} />
}
