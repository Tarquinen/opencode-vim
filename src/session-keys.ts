import type { Context } from "@opencode/plugin/tui/context"
import type { KeyEvent } from "@opentui/core"
import { keyNotation } from "./modules/vim/keys"

export function readerKey(context: Context, event: KeyEvent, sessionKey: string, mode: string) {
  if (event.defaultPrevented || context.keymap.mode.current() !== mode) return
  if (context.keymap.pending().length || event.super || event.meta) return
  const key = keyNotation(event)
  if (key === "<Tab>" && event.shift) return
  if (key && (key === sessionKey || !event.ctrl || key === "<C-[>" || pageCommand(key) || (mode === "modal" && key === "<C-c>"))) return key
}

export function pageCommand(key: string) {
  if (key === "<C-d>") return "session.half.page.down"
  if (key === "<C-u>") return "session.half.page.up"
  if (key === "<C-f>" || key === "<PageDown>") return "session.page.down"
  if (key === "<C-b>" || key === "<PageUp>") return "session.page.up"
}
