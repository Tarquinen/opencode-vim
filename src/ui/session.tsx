/** @jsxImportSource @opentui/solid */
import type { Context } from "@opencode/plugin/tui/context"
import { BoxRenderable, type KeyEvent } from "@opentui/core"
import { createEffect, createSignal, onCleanup, onMount, untrack } from "solid-js"
import type { VimConfig } from "../vim/config"
import { YANK_FLASH_MS } from "../vim/vimee"
import { Reader } from "../readers"
import { createSessionKeymaps, pageCommand, sessionModeKey } from "./session-keys"
import { createTranscriptSelection } from "../transcript"
import type { TranscriptItem } from "../transcript-items"
import type { VimClipboard } from "../clipboard"

export const SESSION_MODE = "opencode-vim.session"

export function createSessionMode(context: Context, config: VimConfig, clipboard: VimClipboard) {
  const mappings = createSessionKeymaps(config, false)
  const [active, setActive] = createSignal(false)
  const [reading, setReading] = createSignal<TranscriptItem>()
  const [notice, setNotice] = createSignal("")
  const positions = new Map<string, number>()
  let sessionID = ""
  let selectedID: string | undefined
  let prompt: Context["renderer"]["currentFocusedEditor"] = null
  let focusTarget: BoxRenderable | undefined
  let transcript: ReturnType<typeof createTranscriptSelection> | undefined
  let popMode: (() => void) | undefined
  let prefix = ""
  let count = ""
  let disposed = false
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  let yankTimer: ReturnType<typeof setTimeout> | undefined
  let yankID: string | undefined

  context.keymap.layer(() => ({
    mode: SESSION_MODE,
    bindings: ["agent.cycle", "agent.cycle.reverse"],
  }))

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
    if (reading()) context.ui.dialog.clear()
    setActive(false)
    context.renderer.removePostProcessFn(draw)
    popMode?.()
    popMode = undefined
    focusTarget?.destroy()
    focusTarget = undefined
    transcript = undefined
    const route = context.ui.router.current()
    if (
      context.keymap.mode.current() === "base" &&
      route.type === "session" &&
      route.sessionID === sessionID &&
      prompt &&
      !prompt.isDestroyed
    )
      prompt.focus()
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
    // Dialogs remember their previous focus, even after they close. Own that
    // target so destroying it on exit prevents a later refocus from stealing input.
    focusTarget = new BoxRenderable(context.renderer, {
      id: "vim-session-focus",
      position: "absolute",
      width: 0,
      height: 0,
      focusable: true,
    })
    context.renderer.root.add(focusTarget)
    focusTarget.focus()
    transcript.latest()
    context.renderer.addPostProcessFn(draw)
    context.renderer.requestRender()
    return true
  }

  const draw: Parameters<Context["renderer"]["addPostProcessFn"]>[0] = (buffer) => {
    if (active() && !reading() && context.keymap.mode.current() === SESSION_MODE) transcript?.draw(buffer, yankID)
  }

  async function copy(text: string) {
    const copied = await clipboard.write(text)
    if (disposed) return
    if (noticeTimer) clearTimeout(noticeTimer)
    setNotice(copied ? "Copied" : "Yanked · clipboard unavailable")
    noticeTimer = setTimeout(() => setNotice(""), 1500)
  }

  function openMessage(message: TranscriptItem) {
    focusTarget?.focus()
    setReading(message)
    context.ui.dialog.show(
      () => (
        <Reader
          context={context}
          config={config}
          sessionID={sessionID}
          message={message}
          offset={positions.get(message.id) ?? 0}
          copy={copy}
          notice={notice}
          remember={(offset) => positions.set(message.id, offset)}
          back={() => context.ui.dialog.clear()}
          close={close}
        />
      ),
      () => {
        setReading(undefined)
        setNotice("")
      },
    )
  }

  const onKey = (event: KeyEvent) => {
    if (!active() || reading()) return
    const key = sessionModeKey(context, event, config.sessionKey, SESSION_MODE, mappings.accepts)
    if (!key) return
    if (mappings.resolve(key) === "passthrough") return
    event.preventDefault()
    event.stopPropagation()
    clearYankFlash()
    setNotice("")
    if (key === config.sessionKey || key === "<Esc>" || key === "<C-[>") {
      close()
      return
    }
    if (/^[0-9]$/.test(key) && (count || key !== "0")) {
      count = (count + key).slice(0, 6)
      return
    }
    const amount = Number(count) || 1
    count = ""
    const previous = prefix
    prefix = ""
    let command = pageCommand(key)
    if (key === "j" || key === "<Down>") {
      transcript?.move("next", amount)
      return
    } else if (key === "k" || key === "<Up>") {
      transcript?.move("previous", amount)
      return
    } else if (key === "G") {
      transcript?.latest()
      return
    } else if (key === "g" && previous === "g") command = "session.first"
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
  })

  return {
    active,
    enter,
    close,
    Status() {
      return (
        <text fg={context.theme.text.feedback.info.base} flexShrink={0} wrapMode="none">
          {notice() || `SESSION · Enter open · yy copy · ${config.sessionKey} prompt`}
        </text>
      )
    },
  }
}
