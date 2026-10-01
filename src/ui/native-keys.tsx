// .tsx lets source plugins share the host's OpenTUI runtime.
import type { Context } from "@opencode/plugin/tui/context"
import { KeyEvent } from "@opentui/core"

export const vimArrowKeys: Record<string, [string, string]> = {
  h: ["left", "\x1b[D"],
  j: ["down", "\x1b[B"],
  k: ["up", "\x1b[A"],
  l: ["right", "\x1b[C"],
}

// Inline host bindings have no dispatchable command IDs. Forward native keys
// so OpenCode still owns navigation, selection and closing.
export function sendNativeKey(context: Context, name: string, sequence: string) {
  context.renderer.keyInput.emit(
    "keypress",
    new KeyEvent({
      name,
      sequence,
      raw: sequence,
      ctrl: false,
      meta: false,
      shift: false,
      option: false,
      number: false,
      eventType: "press",
      source: "raw",
    }),
  )
}
