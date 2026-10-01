/** @jsxImportSource @opentui/solid */
import type { Context } from "@opencode/plugin/tui/context"
import { EmbeddedTerminalRenderable, type KeyEvent } from "@opentui/core"
import { createSignal, onCleanup, untrack } from "solid-js"
import { paneEventKey } from "../vim/keys"
import type { VimConfig } from "../vim/config"
import type { VimLog } from "../vim/log"
import { createPaneKeymaps, TERMINAL_TOGGLE } from "./pane-keys"
import { SESSION_MODE } from "./session"

export function createTerminalControls(
  context: Context,
  config: VimConfig,
  log: VimLog,
  enabled: () => boolean,
  normal: () => boolean,
) {
  const mappings = createPaneKeymaps(config, log)
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

  function handle(event: KeyEvent) {
    const mode = context.keymap.mode.current()
    if ((mode !== "base" && mode !== SESSION_MODE) || context.keymap.pending().length) return false
    const key = paneEventKey(event)
    const command = key ? mappings.command(key) : undefined
    if (!command) return false
    const available = context.keymap.commands()
    if (!available.some((item) => item.id === command)) return false
    if (command === TERMINAL_TOGGLE && !available.some((item) => item.id === "terminal.toggle")) return false
    // The same command mappings run in the prompt and raw terminal. Unmapped
    // keys still belong to Vim editing or the child application respectively.
    event.preventDefault()
    event.stopPropagation()
    context.keymap.dispatch(command)
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
        id: TERMINAL_TOGGLE,
        title: "Toggle terminal (Vim)",
        palette: true,
        enabled: () => focused() || normal(),
        run: () => {
          if (!toggle()) return false
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
        {mappings.hint}
      </text>
    )
  }
}
