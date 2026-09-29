/** @jsxImportSource @opentui/solid */
import { TextReader } from "./text"
import type { ReaderProps } from "./types"

export function DefaultReader(props: ReaderProps) {
  return <TextReader {...props} title={props.message.author} text={props.message.text} />
}
