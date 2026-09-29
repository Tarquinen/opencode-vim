import { afterAll, afterEach, spyOn } from "bun:test"
import * as OpenTUI from "@opentui/core"
import { RGBA, TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { render, type JSX } from "@opentui/solid"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"
import { Plugin } from "@opencode/plugin/tui"
import { createSignal, Show } from "solid-js"
import type { VimOptions } from "../../src/modules/vim/config"
import { createClipboardFixture } from "./clipboard-fixture"
import { testTheme } from "./theme"

// Call once in each suite, so hooks belong to that suite rather than this cached module.
export function usePluginFixture() {
    let clipboard = createClipboardFixture()
    // Install before the runtime loader snapshots OpenTUI's shared exports.
    const factory = spyOn(OpenTUI, "createHostClipboard").mockImplementation(() => clipboard.host)
    afterAll(() => factory.mockRestore())
    let dispose: (() => void) | undefined
    afterEach(() => { dispose?.(); dispose = undefined })

    return async function mount(options: VimOptions = {}) {
        clipboard = createClipboardFixture()
        const entrypoint = process.env.OPENCODE_VIM_TEST_ENTRYPOINT
        if (entrypoint) ensureRuntimePluginSupport({ additional: { "@opencode/plugin/tui": { Plugin } } })
        const { default: plugin }: typeof import("../../tui") = await import(entrypoint ?? "../../tui")
        const screen = await createTestRenderer({ width: 80, height: 16, kittyKeyboard: true })
        dispose = () => screen.renderer.destroy()
        const input = new TextareaRenderable(screen.renderer, { id: "prompt", height: 3, width: 40, initialValue: "hello" })
        screen.renderer.root.add(input)
        input.focus()
        const [enabled, setEnabled] = createSignal(true)
        const [success, setSuccess] = createSignal(RGBA.fromHex("#00ff00"))
        const [pending, setPending] = createSignal<Array<{ key: string }>>([])
        const [mode, setMode] = createSignal("base")
        const [commands, setCommands] = createSignal([{ id: "prompt.submit" }])
        const [route, setRoute] = createSignal<{ type: "home" } | { type: "session"; sessionID: string }>({ type: "home" })
        const [mounted, setMounted] = createSignal(true)
        const [footer, setFooter] = createSignal<() => JSX.Element>(() => null)
        const copied: string[] = []
        const dispatched: string[] = []
        let toggle = () => {}
        Object.defineProperty(screen.renderer, "capabilities", { value: { remote: false, osc52_support: "supported" }, configurable: true })
        screen.renderer.copyToClipboardOSC52 = (text) => { copied.push(text); return true }
        // These are controlled inputs and recorded outputs, not implementations of
        // OpenCode commands, dialogs, navigation, or transcript rendering.
        const context = {
            renderer: screen.renderer,
            options: { defaultMode: "normal", pendingDisplayDelay: 0, ...options },
            get theme() { return testTheme(success()) },
            storage: { store: () => [{ get enabled() { return enabled() } }, (fn: (draft: { enabled: boolean }) => void) => {
                const draft = { enabled: enabled() }; fn(draft); setEnabled(draft.enabled)
            }] },
            keymap: {
                pending, mode: { current: mode }, commands,
                dispatch(command: string) { dispatched.push(command) },
                layer(fn: () => { commands?: Array<{ run: () => void }> }) {
                    const command = fn().commands?.[0]
                    if (command) toggle = command.run
                },
            },
            ui: {
                router: { current: route }, toast: { show() {} },
                slot(slot: { append?: string; render: (props: any) => JSX.Element }) {
                    if (slot.append === "app") void render(() => <box>
                        <Show when={mounted()}>{slot.render({ mode: "normal" })}</Show>{footer()()}
                    </box>, screen.renderer)
                    else setFooter(() => () => slot.render({ mode: "normal" }))
                    return () => setFooter(() => () => null)
                },
            },
        }
        plugin.setup(context as unknown as Parameters<typeof plugin.setup>[0])
        async function renderOnce() {
            // Let already-resolved clipboard reads/writes finish their promise
            // chains. Deliberately deferred operations remain under test control.
            await new Promise<void>((resolve) => setImmediate(resolve))
            await screen.renderOnce()
        }
        await renderOnce()
        return {
            ...screen, renderOnce, input, clipboard, copied, dispatched, toggle, setSuccess, setPending, setMode, setCommands, setRoute,
            unmount: () => setMounted(false),
            async keys(keys: string) {
                for (const key of keys) screen.mockInput.pressKey(key, { shift: key !== key.toLowerCase() })
                await renderOnce()
            },
        }
    }
}
