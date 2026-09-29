/** @jsxImportSource @opentui/solid */
import { DefaultReader } from "./default"
import { ShellReader } from "./shell"
import { ReadReader } from "./read"
import { readSnapshot } from "./read/data"
import { DiffReader } from "./diff"
import { diffSnapshot } from "./diff/data"
import type { ReaderProps } from "./types"

export function Reader(props: ReaderProps) {
  props.context.ui.dialog.set({ size: "large", centered: true })
  const source = props.message.source
  if (source?.type === "shell" || (source?.type === "tool" && source.name === "shell")) {
    return <ShellReader {...props} source={source} />
  }
  if (source?.type === "tool" && source.name === "read") {
    const snapshot = readSnapshot(source)
    if (snapshot) return <ReadReader {...props} snapshot={snapshot} />
  }
  if (source?.type === "tool" && (source.name === "edit" || source.name === "patch")) {
    const snapshot = diffSnapshot(props.message)
    if (snapshot) return <DiffReader {...props} snapshot={snapshot} />
  }
  return <DefaultReader {...props} />
}
