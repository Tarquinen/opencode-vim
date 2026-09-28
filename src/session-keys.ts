import type { Context } from "@opencode/plugin/tui/context"
import type { KeyEvent } from "@opentui/core"
import { createKeybindMap, parseKeySequence, type KeybindDefinition } from "@vimee/core"
import type { SessionAction, VimConfig } from "./modules/vim/config"
import { keyNotation } from "./modules/vim/keys"

export function sessionModeKey(context: Context, event: KeyEvent, sessionKey: string, mode: string, mapped?: (key: string) => boolean) {
  if (event.defaultPrevented || context.keymap.mode.current() !== mode) return
  if (context.keymap.pending().length || event.super || event.meta) return
  const key = keyNotation(event)
  if (key === "<Tab>" && event.shift) return
  if (key && (mapped?.(key) || key === sessionKey || !event.ctrl || key === "<C-[>" || pageCommand(key) || (mode === "modal" && key === "<C-c>"))) return key
}

export function pageCommand(key: string) {
  if (key === "<C-d>") return "session.half.page.down"
  if (key === "<C-u>") return "session.half.page.up"
  if (key === "<C-f>" || key === "<PageDown>") return "session.page.down"
  if (key === "<C-b>" || key === "<PageUp>") return "session.page.up"
}

type SessionBinding = KeybindDefinition & { action: SessionAction }

export function createSessionKeymaps(config: VimConfig, sections: boolean) {
  const map = createKeybindMap()
  const prefixes = new Set<string>()
  let deadline = 0
  let hint = ""
  const bindings: Record<string, SessionAction> = { "<Tab>": "switch-section", ...config.keymaps.session }
  for (const [keys, action] of Object.entries(bindings)) {
    if (action === "switch-section" && !sections) continue
    try {
      const tokens = parseKeySequence(keys)
      if (action === "passthrough" && tokens.length !== 1) continue
      const binding: SessionBinding = { keys, action }
      map.addKeybind("normal", keys, binding)
      prefixes.add(tokens[0]!)
      if (action === "switch-section" && !hint) hint = keys === "<Tab>" ? "tab" : keys
    } catch {}
  }

  function cancel() {
    map.cancel()
    deadline = 0
  }

  function accepts(key: string) {
    if (Date.now() >= deadline) cancel()
    return map.isPending() || prefixes.has(key)
  }

  function resolve(key: string): SessionAction | "pending" | undefined {
    if (Date.now() >= deadline) cancel()
    const result = map.resolve(key, "normal")
    if (result.status === "pending") {
      deadline = Date.now() + config.keymapTimeout
      return "pending"
    }
    deadline = 0
    if (result.status === "matched") return (result.definition as SessionBinding).action
  }

  return { accepts, resolve, cancel, hint }
}
