/** @jsxImportSource @opentui/solid */
import type { Context } from "@opencode/plugin/tui/context"
import { EmbeddedTerminalRenderable, type KeyEvent } from "@opentui/core"
import { createSignal, onCleanup, untrack } from "solid-js"
import { keyNotation } from "../vim/keys"

export function createTerminalControls(context: Context, enabled: () => boolean, normal: () => boolean) {
  const [focused, setFocused] = createSignal(false)
  let terminal: EmbeddedTerminalRenderable | undefined
  let sessionID = ""

  function toggle() {
    if (!context.keymap.commands().some((command) => command.id === "terminal.toggle")) return false
    const route = context.ui.router.current()
    if (!focused() && terminal && !terminal.isDestroyed && route.type === "session" && route.sessionID === sessionID) {
      context.keymap.dispatch("pane.focus.right")
    } else {
      context.keymap.dispatch("terminal.toggle")
    }
    return true
  }

  function focusPane(direction: "left" | "right") {
    const command = `pane.focus.${direction}`
    if (!context.keymap.commands().some((item) => item.id === command)) return false
    context.keymap.dispatch(command)
    return true
  }

  function handle(event: KeyEvent) {
    if (!(context.renderer.currentFocusedRenderable instanceof EmbeddedTerminalRenderable)) return false
    if (context.keymap.pending().length || event.super || event.hyper) return false
    const key = keyNotation(event)
    let handled = false
    if (!event.ctrl && !event.shift && (key === "<M-h>" || key === "<M-l>")) {
      handled = focusPane(key === "<M-h>" ? "left" : "right")
    } else if (!event.meta && !event.option && (key === "<C-/>" || key === "<C-_>")) {
      handled = toggle()
    }
    // Native terminal input bypasses ordinary keymaps. Reserve only pane controls;
    // leave all other keys, including Escape and Ctrl+\ Ctrl+n, to the child.
    if (!handled) return false
    event.preventDefault()
    event.stopPropagation()
    return true
  }

  const onFocus = () =>
    untrack(() => {
      const target = context.renderer.currentFocusedRenderable
      setFocused(target instanceof EmbeddedTerminalRenderable)
      const route = context.ui.router.current()
      if (target instanceof EmbeddedTerminalRenderable && route.type === "session") {
        terminal = target
        sessionID = route.sessionID
      }
    })
  context.renderer.on("focused_renderable", onFocus)
  onFocus()
  context.keymap.layer(() => ({
    mode: "global",
    enabled,
    commands: [
      {
        title: "Toggle terminal (Vim)",
        bind: "ctrl+/,ctrl+_",
        enabled: () => focused() || normal(),
        run: () => {
          if (!toggle()) return false
        },
      },
      {
        title: "Focus OpenCode pane (Vim)",
        bind: "alt+h",
        run: () => {
          if (!focusPane("left")) return false
        },
      },
      {
        title: "Focus right pane (Vim)",
        bind: "alt+l",
        run: () => {
          if (!focusPane("right")) return false
        },
      },
    ],
  }))
  onCleanup(() => {
    context.renderer.off("focused_renderable", onFocus)
  })

  return { focused, handle, Status }

  function Status() {
    return (
      <text fg={context.theme.text.feedback.info.base} flexShrink={0} wrapMode="none">
        TERMINAL · Alt+h/l swap · Ctrl+/ hide
      </text>
    )
  }
}
