/** @jsxImportSource @opentui/solid */
import { pathToFiletype } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { onCleanup } from "solid-js"
import { createReaderSyntax, highlightCode } from "../syntax"
import { TextReader } from "../text"
import type { ReaderProps } from "../types"
import type { ReadSnapshot } from "./data"

export function ReadReader(props: ReaderProps & { snapshot: ReadSnapshot }) {
  const data = props.snapshot
  const dimensions = useTerminalDimensions()
  const syntax = createReaderSyntax(props.context)
  const filetype = pathToFiletype(data.path)
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  return (
    <TextReader
      {...props}
      title={props.context.ui.format.path(data.path)}
      text={data.text}
      label={data.end ? `Lines ${data.start}–${data.end}` : "Empty file"}
      status={data.clipped ? "Partial file · Long lines truncated" : data.partial ? "Partial file" : undefined}
      firstLine={data.end ? data.start : undefined}
      maxHeight={Math.max(1, Math.min(30, dimensions().height - 8))}
      highlight={(input) => {
        if (filetype) void highlightCode(input, syntax, filetype, controller.signal, props.context.renderer.widthMethod)
      }}
    />
  )
}
