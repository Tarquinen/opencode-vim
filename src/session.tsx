/** @jsxImportSource @opentui/solid */
import type { Context } from "@opencode/plugin/tui/context"
import { createClipboard, createHostClipboard, createRendererClipboardAdapter, type KeyEvent, type TextareaRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/solid"
import { createEffect, createSignal, onCleanup, onMount, untrack } from "solid-js"
import type { PromptContext } from "./modules/vim/actions"
import type { VimConfig } from "./modules/vim/config"
import { keyNotation } from "./modules/vim/keys"
import { displayWidth } from "./modules/vim/map"
import { createVimState } from "./modules/vim/state"
import { createVimeeAdapter, YANK_FLASH_MS } from "./modules/vim/vimee"
import { createTranscriptSelection } from "./transcript"
import type { TranscriptItem } from "./transcript-items"

export const SESSION_MODE = "opencode-vim.session"

export function createSessionMode(context: Context, config: VimConfig, onYank: (text: string) => void) {
  const [active, setActive] = createSignal(false)
  const [reading, setReading] = createSignal<TranscriptItem>()
  const [notice, setNotice] = createSignal("")
  const positions = new Map<string, number>()
  const clipboard = createClipboard({ host: createHostClipboard(), terminal: createRendererClipboardAdapter(context.renderer) })
  let sessionID = ""
  let selectedID: string | undefined
  let prompt: Context["renderer"]["currentFocusedEditor"] = null
  let transcript: ReturnType<typeof createTranscriptSelection> | undefined
  let popMode: (() => void) | undefined
  let prefix = ""
  let count = ""
  let disposed = false
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  let yankTimer: ReturnType<typeof setTimeout> | undefined
  let yankID: string | undefined

  function selected() {
    return transcript?.get(selectedID)
  }

  function clearYankFlash() {
    if (yankTimer) clearTimeout(yankTimer)
    yankTimer = undefined
    if (!yankID) return
    yankID = undefined
    context.renderer.requestRender()
  }

  function close() {
    if (!active()) return
    clearYankFlash()
    const wasReading = Boolean(reading())
    if (wasReading) context.ui.dialog.clear()
    setActive(false)
    context.renderer.removePostProcessFn(draw)
    popMode?.()
    popMode = undefined
    transcript = undefined
    const savedPrompt = prompt
    const savedSessionID = sessionID
    function restorePrompt() {
      const route = context.ui.router.current()
      if (!active() && context.keymap.mode.current() === "base" && route.type === "session"
        && route.sessionID === savedSessionID && savedPrompt && !savedPrompt.isDestroyed) savedPrompt.focus()
    }
    restorePrompt()
    // Restore after the dialog's deferred refocus, or it steals focus back.
    if (wasReading) setTimeout(restorePrompt, 1)
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
      selectedID = id
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
    if (active() && !reading() && context.keymap.mode.current() === SESSION_MODE) transcript?.draw(buffer, yankID)
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

  function openMessage(message: TranscriptItem) {
    transcript?.focus()
    setReading(message)
    context.ui.dialog.show(() => (
      <MessageReader context={context} config={config} message={message} offset={positions.get(message.id) ?? 0}
        copy={copy} notice={notice} remember={(offset) => positions.set(message.id, offset)}
        back={() => context.ui.dialog.clear()} close={close} />
    ), () => {
      setReading(undefined)
      setNotice("")
    })
  }

  const onKey = (event: KeyEvent) => {
    if (!active() || reading()) return
    const key = readerKey(context, event, config.sessionKey)
    if (!key) return
    event.preventDefault()
    event.stopPropagation()
    clearYankFlash()
    setNotice("")
    if (key === config.sessionKey || key === "<Esc>" || key === "<C-[>") { close(); return }
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
      if (message) {
        yankID = message.id
        yankTimer = setTimeout(clearYankFlash, YANK_FLASH_MS)
        context.renderer.requestRender()
        void copy(message.text)
      }
    } else if (key === "g" || key === "y") prefix = key
    else if (key === "<CR>") {
      transcript?.sync()
      if (transcript?.toggle()) return
      const message = selected()
      if (message) openMessage(message)
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
        {notice() || `SESSION · Enter open · yy copy · ${config.sessionKey} prompt`}
      </text>
    },
  }
}

function MessageReader(props: {
  context: Context
  config: VimConfig
  message: TranscriptItem
  offset: number
  copy: (text: string) => void
  notice: () => string
  remember: (offset: number) => void
  back: () => void
  close: () => void
}) {
  const context = props.context
  context.ui.dialog.set({ size: "large", centered: true })
  const dimensions = useTerminalDimensions()
  const theme = () => context.theme.surface("dialog")
  const background = () => theme().background.raised.high
  const state = createVimState("normal")
  const [line, setLine] = createSignal(1)
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
    setLine(input.logicalCursor.row + 1)
  }
  onMount(() => {
    input.cursorOffset = Math.min(props.offset, displayWidth(input.plainText))
    adapter.attach(editorContext)
    setLine(input.logicalCursor.row + 1)
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
    return "MESSAGE"
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
        <text fg={theme().text.muted}>{modeLabel()} · {line()}/{input?.lineCount ?? 1}</text>
        <text fg={theme().text.muted}>
          {props.notice() || (state.mode() !== "normal" ? "y copy · Esc cancel" : `v select · V lines · ${props.config.sessionKey} prompt`)}
        </text>
      </box>
    </box>
  )
}

function readerKey(context: Context, event: KeyEvent, sessionKey: string, mode = SESSION_MODE) {
  if (event.defaultPrevented || context.keymap.mode.current() !== mode) return
  if (context.keymap.pending().length || event.super || event.meta) return
  const key = keyNotation(event)
  if (key && (key === sessionKey || !event.ctrl || key === "<C-[>" || pageCommand(key) || (mode === "modal" && key === "<C-c>"))) return key
}

function pageCommand(key: string) {
  if (key === "<C-d>") return "session.half.page.down"
  if (key === "<C-u>") return "session.half.page.up"
  if (key === "<C-f>" || key === "<PageDown>") return "session.page.down"
  if (key === "<C-b>" || key === "<PageUp>") return "session.page.up"
}
