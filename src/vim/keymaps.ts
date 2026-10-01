import {
  createKeybindMap,
  parseKeySequence,
  type KeybindDefinition,
  type KeybindMap,
  type ValidKeySequence,
  type VimAction,
} from "@vimee/core"
import type { VimConfig } from "./config"
import { keyToken } from "./keys"
import type { VimLog } from "./log"

type HostKeybindAction = "normal" | "submit" | "command"
export type HostKeybindDefinition = KeybindDefinition & { hostAction?: HostKeybindAction; command?: string }

export function hasNormalKeyPrefix(config: VimConfig, key: string) {
  for (const sequence of Object.keys(config.keymaps.normal ?? {})) {
    try {
      if (keyToken(parseKeySequence(sequence)[0] ?? "") === key) return true
    } catch {}
  }
  return false
}

export function createKeybinds(config: VimConfig, log: VimLog): KeybindMap | undefined {
  const map = createKeybindMap()
  let count = 0

  for (const mode of ["insert", "normal", "visual", "visual-line"] as const) {
    const keymaps = config.keymaps[mode]
    if (!keymaps) continue
    for (const [keys, action] of Object.entries(keymaps)) {
      try {
        const tokens = parseKeySequence(keys)
        if (tokens.length > 1 && tokens[0] === "<CR>") throw new Error("<CR> cannot start a multi-key mapping")
        map.addKeybind(mode, keys as ValidKeySequence<typeof keys>, keybindAction(action))
        count++
      } catch (error) {
        log("vimee.keymap.invalid", {
          mode,
          keys,
          action,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  return count > 0 ? map : undefined
}

export function insertHostAction(definition: KeybindDefinition): HostKeybindAction | undefined {
  const action = (definition as HostKeybindDefinition).hostAction
  if (action) return action
  if ("execute" in definition) return undefined
  if (definition.keys === "<Esc>" || definition.keys === "<C-[>" || definition.keys === "Escape") return "normal"
  return undefined
}

export function mappedCommand(action: string): string | undefined {
  if (action.startsWith("command:")) {
    const command = action.slice(8).trim()
    if (!command) throw new Error("Command name is required")
    return command
  }
}

function keybindAction(action: string): HostKeybindDefinition {
  const command = mappedCommand(action)
  if (command) {
    return {
      execute: () => [{ type: "command", command } as unknown as VimAction],
      hostAction: "command",
      command,
    }
  }
  switch (action) {
    case "normal":
      return { keys: "<Esc>", hostAction: "normal" }
    case "insert":
      return { keys: "i" }
    case "submit":
      return { execute: () => [{ type: "submit" } as unknown as VimAction], hostAction: "submit" }
    default:
      return { keys: action }
  }
}
