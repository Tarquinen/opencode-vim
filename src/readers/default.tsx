/** @jsxImportSource @opentui/solid */
import type { KeyEvent, TextareaRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { onCleanup, onMount, Show } from "solid-js"
import type { PromptContext } from "../modules/vim/actions"
import { displayWidth } from "../modules/vim/map"
import { createVimState } from "../modules/vim/state"
import { createVimeeAdapter } from "../modules/vim/vimee"
import { pageCommand, readerKey } from "../session-keys"
import type { ReaderProps } from "./types"

export function DefaultReader(props: ReaderProps) {
  const context = props.context
  context.ui.dialog.set({ size: "large", centered: true })
  const dimensions = useTerminalDimensions()
  const theme = () => context.theme.surface("dialog")
  const background = () => theme().background.raised.high
  const state = createVimState("normal")
  let input!: TextareaRenderable
  const adapter = createVimeeAdapter(state, props.config, () => {}, { readOnly: true, onYank: props.copy })
  const editorContext: PromptContext = {
    api: {
      renderer: { get currentFocusedRenderable() { return input } },
      keymap: { dispatchCommand: () => ({ ok: false }) },
      theme: { get current() { return {
        warning: theme().text.feedback.warning.base,
        info: theme().text.feedback.info.base,
        background: background(),
      } } },
    },
    prompt: () => ({
      get current() { return { input: input.plainText, mode: "normal", parts: [] } },
      set() {}, submit() {}, blur() {},
    }),
    requestRender: () => context.renderer.requestRender(),
  }
  const onKey = (event: KeyEvent) => {
    if (context.renderer.currentFocusedEditor !== input) return
    const key = readerKey(context, event, props.config.sessionKey, "modal")
    if (!key) return
    event.preventDefault()
    event.stopPropagation()
    if (key === props.config.sessionKey && state.mode() === "normal" && !adapter.isPending()) { props.close(); return }
    // The host's Ctrl+C clears the editor unless we intercept it.
    if (key === "<C-c>") { props.back(); return }
    if ((key === "<Esc>" || key === "<C-[>") && state.mode() === "normal" && !adapter.isPending()) {
      props.back()
      return
    }
    if (pageCommand(key)) {
      const down = key === "<C-d>" || key === "<C-f>" || key === "<PageDown>"
      const half = key === "<C-d>" || key === "<C-u>"
      const rows = Math.max(1, Math.floor(input.height / (half ? 2 : 1)))
      for (let row = 0; row < rows; row++) adapter.handle({ ...event, ctrl: false } as KeyEvent, down ? "j" : "k", editorContext)
    } else adapter.handle(event, key, editorContext)
  }
  onMount(() => {
    input.cursorOffset = Math.min(props.offset, displayWidth(input.plainText))
    adapter.attach(editorContext)
    input.focus()
    context.renderer.keyInput.prependListener("keypress", onKey)
  })
  onCleanup(() => {
    props.remember(input.cursorOffset)
    context.renderer.keyInput.off("keypress", onKey)
    adapter.cleanup()
  })

  function modeLabel() {
    if (state.mode() === "visual") return "VISUAL"
    if (state.mode() === "visual-line") return "VISUAL LINE"
    return ""
  }
  return (
    <box id="vim-message-reader" gap={1}>
      <box paddingLeft={2} paddingRight={2} flexDirection="row" justifyContent="space-between">
        <text fg={theme().text.base}><b>{props.message.author}</b></text>
        <text id="vim-message-close" fg={theme().text.muted} onMouseUp={props.back}>esc</text>
      </box>
      <box paddingLeft={2} paddingRight={2} paddingTop={1} paddingBottom={1} backgroundColor={background()}>
        <textarea id="vim-session-message" ref={(value: TextareaRenderable) => {
          input = value
          input.handleKeyPress = () => true
          input.handlePaste = () => {}
        }} initialValue={props.message.text} minHeight={1} maxHeight={Math.max(1, Math.min(20, dimensions().height - 10))}
          wrapMode="word" showCursor cursorStyle={props.config.cursorStyles.normal} textColor={theme().text.base}
          backgroundColor={background()} focusedBackgroundColor={background()} focusedTextColor={theme().text.base} />
      </box>
      <box paddingLeft={2} paddingRight={2} paddingBottom={1} flexDirection="row" flexWrap="wrap" columnGap={3}>
        <Show when={modeLabel()}>
          <text fg={theme().text.muted}>{modeLabel()}</text>
        </Show>
        <text fg={theme().text.muted}>
          {props.notice() || (state.mode() !== "normal" ? "y copy · Esc cancel" : `v select · ${props.config.sessionKey} prompt`)}
        </text>
      </box>
    </box>
  )
}
