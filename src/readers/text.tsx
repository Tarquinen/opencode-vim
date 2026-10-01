/** @jsxImportSource @opentui/solid */
import { LineNumberRenderable, type KeyEvent, type LineNumberOptions, type TextareaRenderable } from "@opentui/core"
import { useTerminalDimensions, type JSX } from "@opentui/solid"
import { createEffect, onCleanup, onMount, Show, untrack } from "solid-js"
import type { EditorContext } from "../vim/editor"
import { displayWidth } from "../vim/map"
import { createVimState } from "../vim/state"
import { createVimeeAdapter } from "../vim/vimee"
import { createSessionKeymaps, pageCommand, sessionModeKey } from "../ui/session-keys"
import type { ReaderProps } from "./types"

export function TextReader(
  props: ReaderProps & {
    title: string
    text: string
    status?: string
    details?: JSX.Element
    label?: string
    maxHeight?: number
    highlight?: (input: TextareaRenderable) => void
    switchLabel?: string
    leading?: () => TextareaRenderable
    firstLine?: number
    gutter?: Pick<LineNumberOptions, "lineNumbers" | "lineSigns" | "hideLineNumbers" | "lineColors">
    change?: { run: () => void; controls: () => JSX.Element }
  },
) {
  const context = props.context
  const dimensions = useTerminalDimensions()
  const theme = () => context.theme.surface("dialog")
  const background = () => (props.label ? theme().background.base : theme().background.raised.high)
  const editorBackground = () => (props.gutter?.lineColors ? "transparent" : background())
  const state = createVimState("normal")
  const mappings = createSessionKeymaps(props.config, !!props.leading || !!props.change)
  let input!: TextareaRenderable
  let output!: TextareaRenderable
  const adapter = createVimeeAdapter(state, props.config, () => {}, { readOnly: true, onYank: props.copy })
  const editorContext: EditorContext = {
    input: () => input,
    get widthMethod() {
      return context.renderer.widthMethod
    },
    get colors() {
      return {
        selection: theme().text.feedback.warning.base,
        yank: theme().text.feedback.info.base,
        background: background(),
      }
    },
    setText() {},
    submit() {},
    blur() {},
    dispatchCommand: () => ({ ok: false }),
    requestRender: () => context.renderer.requestRender(),
  }
  const onKey = (event: KeyEvent) => {
    if (context.renderer.currentFocusedEditor !== input) return
    const key = sessionModeKey(context, event, props.config.sessionKey, "modal", mappings.accepts)
    if (!key) {
      mappings.cancel()
      return
    }
    if (key === "<Esc>" || key === "<C-[>") mappings.cancel()
    const action = !adapter.isPending() ? mappings.resolve(key) : undefined
    if (action === "passthrough") return
    event.preventDefault()
    event.stopPropagation()
    if (action === "pending") return
    if (action === "switch-panel") {
      if (props.change) {
        adapter.suspend()
        props.change.run()
      } else {
        const next = input === output ? props.leading!() : output
        next.focus()
      }
      return
    }
    if (key === props.config.sessionKey && state.mode() === "normal" && !adapter.isPending()) {
      props.close()
      return
    }
    // The host's Ctrl+C clears the editor unless we intercept it.
    if (key === "<C-c>") {
      props.back()
      return
    }
    if ((key === "<Esc>" || key === "<C-[>") && state.mode() === "normal" && !adapter.isPending()) {
      props.back()
      return
    }
    if (pageCommand(key)) {
      const down = key === "<C-d>" || key === "<C-f>" || key === "<PageDown>"
      const half = key === "<C-d>" || key === "<C-u>"
      const rows = Math.max(1, Math.floor(input.height / (half ? 2 : 1)))
      for (let row = 0; row < rows; row++)
        adapter.handle({ ...event, ctrl: false } as KeyEvent, down ? "j" : "k", editorContext)
    } else adapter.handle(event, key, editorContext)
  }
  const onFocus = () =>
    untrack(() => {
      mappings.cancel()
      const focused = context.renderer.currentFocusedEditor
      if (focused !== output && focused !== props.leading?.()) return
      input = focused as TextareaRenderable
      adapter.attach(editorContext)
    })
  onMount(() => {
    props.highlight?.(output)
    output.cursorOffset = Math.min(props.offset, displayWidth(output.plainText, context.renderer.widthMethod))
    input = props.leading?.() ?? output
    input.handleKeyPress = () => true
    input.handlePaste = () => {}
    adapter.attach(editorContext)
    context.renderer.on("focused_editor", onFocus)
    input.focus()
    context.renderer.keyInput.prependListener("keypress", onKey)
  })
  onCleanup(() => {
    props.remember(output.cursorOffset)
    context.renderer.off("focused_editor", onFocus)
    context.renderer.keyInput.off("keypress", onKey)
    adapter.cleanup()
  })

  function modeLabel() {
    if (state.mode() === "visual") return "VISUAL"
    if (state.mode() === "visual-line") return "VISUAL LINE"
    return ""
  }
  const height = () => props.maxHeight ?? Math.max(1, Math.min(20, dimensions().height - 10))
  const editor = (
    <textarea
      id="vim-session-message"
      ref={(value: TextareaRenderable) => {
        output = value
        output.handleKeyPress = () => true
        output.handlePaste = () => {}
      }}
      initialValue={props.text}
      minHeight={1}
      maxHeight={height()}
      flexGrow={props.firstLine === undefined && !props.gutter ? undefined : 1}
      minWidth={0}
      wrapMode="word"
      showCursor
      cursorStyle={props.config.cursorStyles.normal}
      textColor={theme().text.base}
      backgroundColor={editorBackground()}
      focusedBackgroundColor={editorBackground()}
      focusedTextColor={theme().text.base}
    />
  )
  let body = editor
  if (props.firstLine !== undefined || props.gutter) {
    let lastLine = (props.firstLine ?? 1) + props.text.split("\n").length - 1
    for (const line of props.gutter?.lineNumbers?.values() ?? []) lastLine = Math.max(lastLine, line)
    const gutter = new LineNumberRenderable(context.renderer, {
      id: "vim-file-lines",
      lineNumberOffset: (props.firstLine ?? 1) - 1,
      minWidth: String(lastLine).length + 2,
      ...props.gutter,
    })
    gutter.add(output)
    createEffect(() => {
      gutter.fg = theme().text.muted
      gutter.bg = background()
      gutter.maxHeight = height()
      if (props.gutter?.lineColors) gutter.setLineColors(props.gutter.lineColors)
    })
    body = gutter as unknown as JSX.Element
  }
  return (
    <box id="vim-message-reader" gap={1}>
      <ReaderHeader context={context} title={props.title} back={props.back} />
      {props.change?.controls()}
      {props.details}
      <box
        paddingLeft={2}
        paddingRight={2}
        paddingTop={props.label ? 0 : 1}
        paddingBottom={props.label ? 0 : 1}
        backgroundColor={background()}
      >
        <Show when={props.label}>
          <box flexDirection="row" gap={2}>
            <text fg={theme().text.muted}>
              <b>{props.label}</b>
            </text>
            <Show when={props.status}>
              <text fg={theme().text.muted}>{props.status}</text>
            </Show>
          </box>
        </Show>
        {body}
      </box>
      <box paddingLeft={2} paddingRight={2} paddingBottom={1} flexDirection="row" flexWrap="wrap" columnGap={3}>
        <Show when={modeLabel()}>
          <text fg={theme().text.muted}>{modeLabel()}</text>
        </Show>
        <text fg={theme().text.muted}>
          {props.notice() ||
            (state.mode() !== "normal"
              ? "y copy · Esc cancel"
              : `v select${mappings.hint && props.switchLabel ? ` · ${mappings.hint} ${props.switchLabel}` : ""} · ${props.config.sessionKey} prompt`)}
        </text>
      </box>
    </box>
  )
}

export function ReaderHeader(props: Pick<ReaderProps, "context" | "back"> & { title: string }) {
  const theme = () => props.context.theme.surface("dialog")
  return (
    <box paddingLeft={2} paddingRight={2} flexDirection="row" gap={2}>
      <text fg={theme().text.base} flexGrow={1} flexShrink={1} minWidth={0} truncate>
        <b>{props.title}</b>
      </text>
      <text id="vim-message-close" fg={theme().text.muted} onMouseUp={props.back}>
        esc
      </text>
    </box>
  )
}
