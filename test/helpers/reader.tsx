import { afterEach, mock } from "bun:test"
import type { Context } from "@opencode/plugin/tui/context"
import type { TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { render } from "@opentui/solid"
import { createSignal, Show } from "solid-js"
import { createVimConfig, type VimOptions } from "../../src/modules/vim/config"
import { Reader } from "../../src/readers"
import type { TranscriptItem, TranscriptSource } from "../../src/transcript-items"
import { testTheme } from "./theme"

export function textItem(text: string): TranscriptItem {
    return { id: "message", author: "Assistant", text }
}

export function toolItem(name: string, text: string, state: Extract<TranscriptSource, { type: "tool" }>["state"]): TranscriptItem {
    return { id: "tool", author: name, text, source: { type: "tool", id: "call", name, time: { created: 1 }, state } }
}

export function useReaderFixture() {
    let dispose: (() => void) | undefined
    afterEach(() => { dispose?.(); dispose = undefined })

    return async function mount(message: TranscriptItem, options: VimOptions = {}, size = { width: 80, height: 16 }) {
        const screen = await createTestRenderer({ ...size, kittyKeyboard: true })
        dispose = () => screen.renderer.destroy()
        const [mounted, setMounted] = createSignal(true)
        const [item, setItem] = createSignal(message)
        const [pending, setPending] = createSignal<Array<{ key: string }>>([])
        const back = mock(() => {})
        const close = mock(() => {})
        const copied: string[] = []
        let offset = 0
        const setDialog = mock(() => {})
        const context = {
            renderer: screen.renderer, theme: testTheme(),
            keymap: { mode: { current: () => "modal" }, pending },
            ui: { format: { path: (value: string) => value }, dialog: { set: setDialog } },
        } as unknown as Context
        // Render our component directly. Modal placement, dismissal and focus
        // restoration are exercised by real OpenCode in test/e2e/.
        await render(() => <Show when={mounted()}>
            <Reader context={context} config={createVimConfig(options)} sessionID="session" message={item()}
                offset={offset} copy={(text) => copied.push(text)} notice={() => ""}
                remember={(value) => { offset = value }} back={back} close={close} />
        </Show>, screen.renderer)
        async function renderOnce() {
            await screen.renderOnce()
            await screen.renderOnce()
        }
        await renderOnce()
        return {
            ...screen, renderOnce, copied, back, close, setDialog, setPending, setItem,
            reader: () => screen.renderer.root.findDescendantById("vim-session-message") as TextareaRenderable,
            unmount: () => setMounted(false),
            async reopen() { setMounted(false); setMounted(true); await renderOnce() },
            async keys(keys: string) {
                for (const key of keys) screen.mockInput.pressKey(key, { shift: key !== key.toLowerCase() })
                await renderOnce()
            },
        }
    }
}
