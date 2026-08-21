/** @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode-ai/plugin/tui"
import type { KeyEvent } from "@opentui/core"
import { onCleanup } from "solid-js"
import { applyVimCursorStyle, focusedInput } from "./src/modules/vim/actions"
import { createVimConfig } from "./src/modules/vim/config"
import { editInput } from "./src/modules/vim/edit"
import { keyNotation } from "./src/modules/vim/keys"
import { createVimLog } from "./src/modules/vim/log"
import { displayToChar } from "./src/modules/vim/map"
import { createVimState } from "./src/modules/vim/state"
import { createVimeeAdapter } from "./src/modules/vim/vimee"
import { VimStatus } from "./view"

type Context = Parameters<Parameters<typeof Plugin.define>[0]["setup"]>[0]

export default Plugin.define({
  id: "opencode-vim",
  setup(context) {
    context.ui.slot({ append: "app", render: () => <VimHost context={context} /> })
  },
})

function VimHost(props: { context: Context }) {
  const config = createVimConfig(props.context.options)
  const log = createVimLog(config)
  const state = createVimState(config.defaultMode, log)
  const vimee = createVimeeAdapter(state, config, log)
  const [saved, setSaved] = props.context.storage.store("state", { initial: { enabled: true } })
  const enabled = () => saved.enabled
  const ctx = createCompatContext(props.context)
  let cursorMode = ""
  let cursorInput = props.context.renderer.currentFocusedEditor

  const removeStatus = props.context.ui.slot({
    prepend: "prompt.footer",
    render: (footer) =>
      footer.mode === "normal" ? (
        <VimStatus
          mode={state.mode}
          pending={() => readablePending(state.pending())}
          subscribe={state.subscribe}
          enabled={enabled}
          theme={compatTheme(props.context) as never}
          pendingDisplayDelay={config.pendingDisplayDelay}
          requestRender={() => props.context.renderer.requestRender()}
        />
      ) : null,
  })

  props.context.keymap.layer(() => ({
    mode: "global",
    commands: [
      {
        id: "opencode-vim.toggle",
        title: "Toggle Vim Mode",
        description: "Enable or disable Vim key handling",
        group: "Vim",
        palette: true,
        slash: { name: "vim" },
        run() {
          const next = !enabled()
          void setSaved((draft) => {
            draft.enabled = next
          })
          if (!next) resetCursor(props.context)
          props.context.ui.toast.show({ message: `Vim mode ${next ? "enabled" : "disabled"}`, variant: "info" })
          props.context.renderer.requestRender()
        },
      },
    ],
  }))

  const onKey = (event: KeyEvent) => {
    if (!enabled() || !isPromptActive(props.context)) return
    const key = keyNotation(event as never)
    if (!key || passThroughKey(event, key, state.mode())) return
    if (key === "<Esc>" && state.mode() === "normal" && !state.pending()) return

    if (sendCompletionKey(event, props.context, key, state.mode())) {
      syncCursor(true)
      return
    }

    const before = state.mode()
    let consumed = false
    try {
      consumed = vimee.handle(event as never, key, ctx as never)
    } finally {
      if (consumed || state.mode() !== before) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    if (consumed) syncCursor(true)
  }

  props.context.renderer._internalKeyInput.onInternal("keypress", onKey)
  const cursorTimer = setInterval(() => {
    syncCursor()
  }, 50)
  onCleanup(() => {
    removeStatus()
    props.context.renderer._internalKeyInput.offInternal("keypress", onKey)
    clearInterval(cursorTimer)
    vimee.cleanup()
    resetCursor(props.context)
  })

  return null

  function syncCursor(force = false) {
    const input = props.context.renderer.currentFocusedEditor
    if (!enabled() || !isPromptActive(props.context) || !input) {
      cursorInput = null
      return
    }
    const mode = state.mode()
    const inputChanged = cursorInput !== input
    cursorInput = input
    if (!force && !inputChanged && cursorMode === mode) return
    if (applyVimCursorStyle(ctx as never, config.cursorStyles[mode])) {
      cursorMode = mode
      props.context.renderer.requestRender()
    }
  }
}

function createCompatContext(context: Context) {
  const prompt = {
    get current() {
      return { input: focusedInputValue(context), mode: "normal", parts: [] }
    },
    get focused() {
      return isPromptActive(context)
    },
    set(value: { input: string }) {
      const input = context.renderer.currentFocusedEditor
      if (input) editInput(input, value.input)
    },
    submit() {
      context.keymap.dispatch("prompt.submit")
    },
    blur() {
      context.renderer.currentFocusedEditor?.blur()
    },
  }

  return {
    api: {
      renderer: context.renderer,
      keymap: {
        dispatchCommand(command: string) {
          const ok = context.keymap.commands().some((item) => item.id === command)
          if (ok) context.keymap.dispatch(command)
          return { ok }
        },
      },
      theme: { current: compatTheme(context) },
    },
    kind: context.ui.router.current().type === "session" ? "session" : "home",
    prompt: () => (isPromptActive(context) ? prompt : undefined),
    requestRender: () => context.renderer.requestRender(),
  }
}

function isPromptActive(context: Context) {
  if (!context.renderer.currentFocusedEditor) return false
  return context.keymap.commands().some(
    (item) =>
      item.id === "prompt.submit" || item.id === "prompt.autocomplete.next" || item.id === "prompt.history.previous",
  )
}

function focusedInputValue(context: Context) {
  return context.renderer.currentFocusedEditor?.plainText ?? ""
}

function compatTheme(context: Context) {
  return {
    background: context.theme.background.default,
    info: context.theme.text.feedback.info.default,
    success: context.theme.text.feedback.success.default,
    warning: context.theme.text.feedback.warning.default,
    textMuted: context.theme.text.subdued,
  }
}

function resetCursor(context: Context) {
  const input = context.renderer.currentFocusedEditor
  if (input) input.cursorStyle = { style: "default" }
  context.renderer.requestRender()
}

function passThroughKey(event: KeyEvent, key: string, mode: string) {
  if (mode !== "normal") return false
  return event.super === true || isArrowKey(key) || key === "<C-c>"
}

function sendCompletionKey(event: KeyEvent, context: Context, key: string, mode: string) {
  if (mode !== "normal") return false
  const command = key === "j" ? "prompt.autocomplete.next" : key === "k" ? "prompt.autocomplete.prev" : undefined
  if (!command || !isCompletionToken(context) || !context.keymap.commands().some((item) => item.id === command)) return false
  event.preventDefault()
  event.stopPropagation()
  context.keymap.dispatch(command)
  return true
}

function isCompletionToken(context: Context) {
  const input = context.renderer.currentFocusedEditor
  const text = input?.plainText ?? ""
  const index = displayToChar(text, Math.max(0, input?.cursorOffset ?? 0))
  const before = text.slice(0, Math.min(index + 1, text.length))
  return /^\/\S*$/.test(before) || /(?:^|\s)@\S*$/.test(before)
}

function isArrowKey(key: string) {
  return key === "<Left>" || key === "<Down>" || key === "<Up>" || key === "<Right>"
}

function readablePending(sequence: string) {
  return sequence ? sequence.replaceAll("><", " ") : undefined
}
