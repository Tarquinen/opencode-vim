import { RGBA, TextareaRenderable, type KeyEvent } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import type { PromptContext } from "../src/modules/vim/actions"
import { createVimConfig, type VimOptions } from "../src/modules/vim/config"
import { editInput } from "../src/modules/vim/edit"
import { keyNotation } from "../src/modules/vim/keys"
import { createVimState } from "../src/modules/vim/state"
import { createVimeeAdapter } from "../src/modules/vim/vimee"

export async function createFixture(text = "", options: VimOptions = {}, width = 80) {
    const screen = await createTestRenderer({ width, height: 12, kittyKeyboard: true })
    const input = new TextareaRenderable(screen.renderer, {
        id: "prompt", width, height: 10, initialValue: text, wrapMode: "word",
    })
    screen.renderer.root.add(input)
    input.focus()
    await screen.renderOnce()
    const config = createVimConfig({ defaultMode: "normal", ...options })
    const state = createVimState(config.defaultMode)
    const adapter = createVimeeAdapter(state, config, () => {})
    const commands: string[] = []
    let submissions = 0
    const prompt = {
        get current() { return { input: input.plainText, mode: "normal", parts: [] } },
        set(value: { input: string }) { editInput(input, value.input) },
        submit() { submissions++ },
        blur() { input.blur() },
    }
    const context: PromptContext = {
        api: {
            renderer: screen.renderer,
            keymap: { dispatchCommand(command) { commands.push(command); return { ok: true } } },
            theme: { current: { warning: RGBA.fromHex("#ffff00"), info: RGBA.fromHex("#00ffff"), background: RGBA.fromHex("#000000") } },
        },
        prompt: () => input.focused ? prompt : undefined,
        requestRender: () => screen.renderer.requestRender(),
    }
    const onKey = (event: KeyEvent) => {
        const key = keyNotation(event)
        if (key && adapter.handle(event, key, context)) {
            event.preventDefault()
            event.stopPropagation()
        }
    }
    adapter.attach(context)
    screen.renderer.keyInput.prependListener("keypress", onKey)
    return {
        ...screen, input, state, adapter, commands,
        get submissions() { return submissions },
        async keys(keys: string) {
            for (const key of keys) screen.mockInput.pressKey(key, { shift: key !== key.toLowerCase() })
            await screen.renderOnce()
        },
        dispose() {
            screen.renderer.keyInput.off("keypress", onKey)
            adapter.cleanup()
            screen.renderer.destroy()
        },
    }
}
