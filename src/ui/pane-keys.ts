import type { VimConfig } from "../vim/config"
import { paneMappingKey } from "../vim/keys"
import { mappedCommand } from "../vim/keymaps"
import type { VimLog } from "../vim/log"

export const TERMINAL_TOGGLE = "opencode-vim.terminal.toggle"

const DEFAULT_BINDINGS = {
  "<C-/>": `command:${TERMINAL_TOGGLE}`,
  "<M-h>": "command:pane.focus.left",
  "<M-l>": "command:pane.focus.right",
}

export function createPaneKeymaps(config: VimConfig, log: VimLog) {
  const commands = new Map<string, string>()
  for (const bindings of [DEFAULT_BINDINGS, config.keymaps.panes ?? {}]) {
    for (const [keys, action] of Object.entries(bindings)) {
      try {
        const key = paneMappingKey(keys)
        if (action === "passthrough") {
          commands.delete(key)
          continue
        }
        const command = mappedCommand(action)
        if (!command) throw new Error("Pane mappings support only command:<id> or passthrough")
        commands.set(key, command)
      } catch (error) {
        log("vim.pane.keymap.invalid", {
          keys,
          action,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  function label(command: string) {
    for (const [key, action] of commands) {
      if (action !== command) continue
      if (key.startsWith("<M-")) return `Alt+${key.slice(3, -1)}`
      if (key.startsWith("<C-")) return `Ctrl+${key.slice(3, -1)}`
      return key.startsWith("<") ? key.slice(1, -1) : key
    }
    return ""
  }

  const hints = ["TERMINAL"]
  const left = label("pane.focus.left")
  const right = label("pane.focus.right")
  if (left && right) {
    let swap = `${left}/${right}`
    for (const modifier of ["Alt+", "Ctrl+"]) {
      if (left.startsWith(modifier) && right.startsWith(modifier)) swap = `${left}/${right.slice(modifier.length)}`
    }
    hints.push(`${swap} swap`)
  } else if (left) {
    hints.push(`${left} prompt`)
  } else if (right) {
    hints.push(`${right} terminal`)
  }
  const toggle = label(TERMINAL_TOGGLE)
  if (toggle) hints.push(`${toggle} hide`)

  return { command: (key: string) => commands.get(key), hint: hints.join(" · ") }
}
