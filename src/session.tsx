/** @jsxImportSource @opentui/solid */
import type { Context } from "@opencode/plugin/tui/context"
import { createClipboard, createHostClipboard, createRendererClipboardAdapter, type KeyEvent, type TextareaRenderable } from "@opentui/core"
import { createEffect, createSignal, onCleanup, onMount, Show, untrack } from "solid-js"
import type { PromptContext } from "./modules/vim/actions"
import type { VimConfig } from "./modules/vim/config"
import { keyNotation } from "./modules/vim/keys"
import { displayWidth } from "./modules/vim/map"
import { createVimState } from "./modules/vim/state"
import { createVimeeAdapter } from "./modules/vim/vimee"
import { createTranscriptSelection, readableMessage, type ReadableMessage } from "./transcript"

export const SESSION_MODE = "opencode-vim.session"

export function createSessionMode(context: Context, config: VimConfig, onYank: (text: string) => void) {
  const [active, setActive] = createSignal(false)
  const [selectedID, setSelectedID] = createSignal<string>()
  const [reading, setReading] = createSignal<ReadableMessage>()
  const [notice, setNotice] = createSignal("")
  const positions = new Map<string, number>()
  const clipboard = createClipboard({ host: createHostClipboard(), terminal: createRendererClipboardAdapter(context.renderer) })
  let sessionID = ""
  let prompt: Context["renderer"]["currentFocusedEditor"] = null
  let transcript: ReturnType<typeof createTranscriptSelection> | undefined
  let popMode: (() => void) | undefined
  let prefix = ""
  let count = ""
  let disposed = false
  let noticeTimer: ReturnType<typeof setTimeout> | undefined

  function selected() {
    const message = context.data.session.message.list(sessionID).find((message) => message.id === selectedID())
    return message && readableMessage(message)
  }

  function close() {
    if (!active()) return
    setReading(undefined)
    setActive(false)
    context.renderer.removePostProcessFn(draw)
    popMode?.()
    popMode = undefined
    transcript = undefined
    const route = context.ui.router.current()
    if (route.type === "session" && route.sessionID === sessionID && prompt && !prompt.isDestroyed) prompt.focus()
    prompt = null
    context.renderer.requestRender()
  }

  function enter() {
    const route = context.ui.router.current()
    if (route.type !== "session") return false
    sessionID = route.sessionID
    prompt = context.renderer.currentFocusedEditor
    prefix = count = ""
    positions.clear()
    setNotice("")
    popMode = context.keymap.mode.push(SESSION_MODE)
    transcript = createTranscriptSelection(context, sessionID, (id) => {
      if (id === selectedID()) return
      setSelectedID(id)
      // Geometry is read after layout; footer updates need the following frame.
      queueMicrotask(() => { if (!disposed) context.renderer.requestRender() })
    })
    setActive(true)
    prompt?.blur()
    transcript.focus()
    transcript.latest()
    context.renderer.addPostProcessFn(draw)
    context.renderer.requestRender()
    return true
  }

  const draw: Parameters<Context["renderer"]["addPostProcessFn"]>[0] = (buffer) => {
    if (active() && !reading() && context.keymap.mode.current() === SESSION_MODE) transcript?.draw(buffer)
  }

  async function copy(text: string) {
    onYank(text)
    let message = "Copied"
    try {
      const result = await clipboard.writeText(text.replaceAll("\0", ""), { destination: "all-available", selection: "clipboard" })
      if (result.host.status !== "written" && result.terminal.status !== "attempted") message = "Yanked · clipboard unavailable"
    } catch { message = "Yanked · clipboard unavailable" }
    if (disposed) return
    if (noticeTimer) clearTimeout(noticeTimer)
    setNotice(message)
    noticeTimer = setTimeout(() => setNotice(""), 1500)
  }

  function leaveMessage(offset: number) {
    const message = reading()
    if (message) positions.set(message.id, offset)
    setReading(undefined)
    setNotice("")
    transcript?.focus()
  }

  const onKey = (event: KeyEvent) => {
    if (!active() || reading()) return
    const key = readerKey(context, event)
    if (!key) return
    event.preventDefault()
    event.stopPropagation()
    setNotice("")
    if (key === "s" || key === "<Esc>" || key === "<C-[>") { close(); return }
    if (/^[0-9]$/.test(key) && (count || key !== "0")) { count = (count + key).slice(0, 6); return }
    const amount = Number(count) || 1
    count = ""
    const previous = prefix
    prefix = ""
    let command = pageCommand(key)
    if (key === "j" || key === "<Down>") { transcript?.move("next", amount); return }
    else if (key === "k" || key === "<Up>") { transcript?.move("previous", amount); return }
    else if (key === "G") { transcript?.latest(); return }
    else if (key === "g" && previous === "g") command = "session.first"
    else if (key === "y" && previous === "y") {
      const message = selected()
      if (message) void copy(message.text)
    } else if (key === "g" || key === "y") prefix = key
    else if (key === "<CR>") {
      transcript?.sync()
      const message = selected()
      if (message) setReading(message)
    }
    if (command) {
      transcript?.followViewport()
      for (let index = 0; index < amount; index++) context.keymap.dispatch(command)
    }
  }

  createEffect(() => {
    const route = context.ui.router.current()
    if (active() && (route.type !== "session" || route.sessionID !== sessionID)) untrack(close)
  })
  onMount(() => context.renderer.keyInput.prependListener("keypress", onKey))
  onCleanup(() => {
    disposed = true
    close()
    if (noticeTimer) clearTimeout(noticeTimer)
    context.renderer.keyInput.off("keypress", onKey)
    void clipboard.dispose()
  })

  return {
    active, enter, close,
    Status() {
      return <text fg={context.theme.text.feedback.warning.base}>
        {notice() || `SESSION · ${selected()?.author ?? "No message selected"} · j/k · Enter read · yy copy · s prompt`}
      </text>
    },
    View() {
      return <Show when={reading()} keyed>{(message) => (
        <MessageReader context={context} config={config} message={message} offset={positions.get(message.id) ?? 0}
          copy={copy} notice={notice} back={leaveMessage} close={close} />
      )}</Show>
    },
  }
}

function MessageReader(props: {
  context: Context
  config: VimConfig
  message: ReadableMessage
  offset: number
  copy: (text: string) => void
  notice: () => string
  back: (offset: number) => void
  close: () => void
}) {
  const context = props.context
  const state = createVimState("normal")
  const [line, setLine] = createSignal(1)
  let input!: TextareaRenderable
  const adapter = createVimeeAdapter(state, props.config, () => {}, { readOnly: true, onYank: props.copy })
  const editorContext: PromptContext = {
    api: {
      renderer: { get currentFocusedRenderable() { return input } },
      keymap: { dispatchCommand: () => ({ ok: false }) },
      theme: { get current() { return {
        warning: context.theme.text.feedback.warning.base,
        info: context.theme.text.feedback.info.base,
        background: context.theme.background.base,
      } } },
    },
    prompt: () => ({
      get current() { return { input: input.plainText, mode: "normal", parts: [] } },
      set() {}, submit() {}, blur() {},
    }),
    requestRender: () => context.renderer.requestRender(),
  }
  createEffect(() => {
    if (context.keymap.mode.current() === SESSION_MODE) untrack(() => input.focus())
  })
  const onKey = (event: KeyEvent) => {
    const key = readerKey(context, event)
    if (!key) return
    event.preventDefault()
    event.stopPropagation()
    if (!input.focused) input.focus()
    if (key === "s" && state.mode() === "normal" && !adapter.isPending()) { props.close(); return }
    if ((key === "<Esc>" || key === "<C-[>") && state.mode() === "normal" && !adapter.isPending()) {
      props.back(input.cursorOffset)
      return
    }
    if (pageCommand(key)) {
      const down = key === "<C-d>" || key === "<C-f>" || key === "<PageDown>"
      const half = key === "<C-d>" || key === "<C-u>"
      const rows = Math.max(1, Math.floor(input.height / (half ? 2 : 1)))
      for (let row = 0; row < rows; row++) adapter.handle({ ...event, ctrl: false } as KeyEvent, down ? "j" : "k", editorContext)
    } else adapter.handle(event, key, editorContext)
    setLine(input.logicalCursor.row + 1)
  }
  onMount(() => {
    input.cursorOffset = Math.min(props.offset, displayWidth(input.plainText))
    adapter.attach(editorContext)
    setLine(input.logicalCursor.row + 1)
    context.renderer.keyInput.prependListener("keypress", onKey)
  })
  onCleanup(() => {
    context.renderer.keyInput.off("keypress", onKey)
    adapter.cleanup()
  })

  function modeLabel() {
    if (state.mode() === "visual") return "VISUAL"
    if (state.mode() === "visual-line") return "VISUAL LINE"
    return "MESSAGE"
  }
  return (
    <box id="vim-message-reader" position="absolute" top={0} left={0} width="100%" height="100%" zIndex={100}
      paddingLeft={1} paddingRight={1} backgroundColor={context.theme.background.base}>
      <box height={1} flexShrink={0} flexDirection="row" gap={2}>
        <text fg={context.theme.text.feedback.warning.base}>{modeLabel()}</text>
        <text fg={context.theme.text.muted}>{props.message.author} · {line()}/{input?.lineCount ?? 1}</text>
      </box>
      <textarea id="vim-session-message" ref={(value: TextareaRenderable) => {
        input = value
        input.handleKeyPress = () => true
        input.handlePaste = () => {}
      }} initialValue={props.message.text} flexGrow={1} minHeight={0} wrapMode="word" showCursor
        cursorStyle={props.config.cursorStyles.normal} textColor={context.theme.text.base}
        backgroundColor={context.theme.background.base} focusedBackgroundColor={context.theme.background.base}
        focusedTextColor={context.theme.text.base} />
      <text height={1} flexShrink={0} fg={context.theme.text.muted}>
        {props.notice() || (state.mode() !== "normal" ? "y copy · Esc cancel" : "v select · V lines · Esc back · s prompt")}
      </text>
    </box>
  )
}

function readerKey(context: Context, event: KeyEvent) {
  if (event.defaultPrevented || context.keymap.mode.current() !== SESSION_MODE) return
  if (context.keymap.pending().length || event.super || event.meta) return
  const key = keyNotation(event)
  if (key && (!event.ctrl || key === "<C-[>" || pageCommand(key))) return key
}

function pageCommand(key: string) {
  if (key === "<C-d>") return "session.half.page.down"
  if (key === "<C-u>") return "session.half.page.up"
  if (key === "<C-f>" || key === "<PageDown>") return "session.page.down"
  if (key === "<C-b>" || key === "<PageUp>") return "session.page.up"
}
