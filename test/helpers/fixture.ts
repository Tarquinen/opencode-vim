import { RGBA, TextareaRenderable, type KeyEvent } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import type { EditorContext } from "../../src/vim/editor"
import { createVimConfig, type VimOptions } from "../../src/vim/config"
import { editInput } from "../../src/vim/edit"
import { keyNotation } from "../../src/vim/keys"
import { createVimState } from "../../src/vim/state"
import { createVimeeAdapter } from "../../src/vim/vimee"

export async function createFixture(
  text = "",
  options: VimOptions = {},
  width = 80,
  adapterOptions: Parameters<typeof createVimeeAdapter>[3] = {},
) {
  const screen = await createTestRenderer({ width, height: 12, kittyKeyboard: true })
  const input = new TextareaRenderable(screen.renderer, {
    id: "prompt",
    width,
    height: 10,
    initialValue: text,
    wrapMode: "word",
  })
  screen.renderer.root.add(input)
  input.focus()
  await screen.renderOnce()
  const config = createVimConfig({ defaultMode: "normal", ...options })
  const state = createVimState(config.defaultMode)
  const adapter = createVimeeAdapter(state, config, () => {}, adapterOptions)
  const commands: string[] = []
  let submissions = 0
  const context: EditorContext = {
    input: () => (input.focused ? input : undefined),
    get widthMethod() {
      return screen.renderer.widthMethod
    },
    colors: { selection: RGBA.fromHex("#ffff00"), yank: RGBA.fromHex("#00ffff"), background: RGBA.fromHex("#000000") },
    setText(text) {
      editInput(input, text, screen.renderer.widthMethod)
    },
    submit() {
      submissions++
    },
    blur() {
      input.blur()
    },
    dispatchCommand(command) {
      commands.push(command)
      return { ok: true }
    },
    requestRender: () => screen.renderer.requestRender(),
  }
  let handled: boolean | Promise<boolean> = false
  const onKey = (event: KeyEvent) => {
    const key = keyNotation(event)
    handled = key ? adapter.handle(event, key, context) : false
    if (handled) {
      event.preventDefault()
      event.stopPropagation()
    }
  }
  adapter.attach(context)
  screen.renderer.keyInput.prependListener("keypress", onKey)
  return {
    ...screen,
    input,
    state,
    adapter,
    commands,
    settled: () => handled,
    get submissions() {
      return submissions
    },
    async keys(keys: string) {
      for (const key of keys) {
        screen.mockInput.pressKey(key, { shift: key !== key.toLowerCase() })
        if (typeof handled !== "boolean") await handled
      }
      await screen.renderOnce()
    },
    dispose() {
      screen.renderer.keyInput.off("keypress", onKey)
      adapter.cleanup()
      screen.renderer.destroy()
    },
  }
}
