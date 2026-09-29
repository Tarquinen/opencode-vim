import type { Context } from "@opencode/plugin/tui/context"
import { KeyEvent, PasteEvent, type CursorStyleOptions } from "@opentui/core"
import { createEffect, onCleanup, Show, untrack } from "solid-js"
import type { PromptContext } from "./modules/vim/actions"
import type { VimConfig } from "./modules/vim/config"
import { editInput } from "./modules/vim/edit"
import { keyNotation } from "./modules/vim/keys"
import type { VimLog } from "./modules/vim/log"
import { createVimState } from "./modules/vim/state"
import { createVimeeAdapter } from "./modules/vim/vimee"
import { VimStatus } from "../view"

export function createFormMode(context: Context, config: VimConfig, log: VimLog, enabled: () => boolean) {
    const state = createVimState("normal", log)
    const adapter = createVimeeAdapter(state, config, log)
    const active = () => enabled() && context.keymap.mode.current() === "form"
    let input: typeof context.renderer.currentFocusedEditor = null
    let cursorStyle: CursorStyleOptions | undefined
    let forwarding = false
    let opening: Array<KeyEvent | PasteEvent> | undefined
    const ctx: PromptContext = {
        api: {
            renderer: context.renderer,
            keymap: {
                dispatchCommand(command) {
                    const ok = context.keymap.commands().some((item) => item.id === command)
                    if (ok) context.keymap.dispatch(command)
                    return { ok }
                },
            },
            theme: { get current() { return {
                background: context.theme.background.base,
                info: context.theme.text.feedback.info.base,
                warning: context.theme.text.feedback.warning.base,
            } } },
        },
        prompt: () => input ? {
            current: { input: input.plainText, mode: "normal", parts: [] },
            set: (value) => { if (input) editInput(input, value.input, context.renderer.widthMethod) },
            submit: () => sendKey("return", "\r"),
            blur: () => input?.blur(),
        } : undefined,
        requestRender: () => context.renderer.requestRender(),
    }

    const removeStatus = context.ui.slot({
        append: "session.composer.top",
        render: () => <Show when={active()}>
            <box paddingLeft={2} flexDirection="row">
                <VimStatus mode={state.mode} enabled={enabled} theme={{
                    success: context.theme.text.feedback.success.base,
                    warning: context.theme.text.feedback.warning.base,
                }} />
                <text fg={context.theme.text.muted}>
                    {state.mode() === "normal" ? "j/k select · i type an answer" : "esc normal"}
                </text>
            </box>
        </Show>,
    })

    createEffect(() => {
        if (!active()) opening = undefined
        untrack(focus)
    })
    createEffect(() => {
        const style = config.cursorStyles[state.mode()]
        if (input && !input.isDestroyed) input.cursorStyle = style
    })
    onCleanup(() => {
        opening = undefined
        adapter.cleanup()
        restoreCursor()
        removeStatus()
    })

    function restoreCursor() {
        if (input && !input.isDestroyed && cursorStyle) input.cursorStyle = cursorStyle
    }

    function focus() {
        const next = active() ? context.renderer.currentFocusedEditor : null
        if (next === input) return
        adapter.suspend()
        restoreCursor()
        input = next
        cursorStyle = input?.cursorStyle
        state.setMode(input ? "insert" : "normal")
        if (input) input.cursorStyle = config.cursorStyles[state.mode()]
    }

    function consume(event: KeyEvent | PasteEvent) {
        event.preventDefault()
        event.stopPropagation()
    }

    function sendKey(name: string, sequence: string) {
        // Form actions are inline host bindings, without dispatchable command IDs.
        forwarding = true
        try {
            context.renderer.keyInput.emit("keypress", new KeyEvent({
                name, sequence, raw: sequence, ctrl: false, meta: false, shift: false,
                option: false, number: false, eventType: "press", source: "raw",
            }))
        } finally {
            forwarding = false
        }
    }

    function waitForEditor() {
        const queued: Array<KeyEvent | PasteEvent> = []
        opening = queued
        // OpenCode publishes a newly opened answer editor in a microtask. Keep
        // burst typing here so its first keys also use the configured mappings.
        queueMicrotask(() => queueMicrotask(() => {
            if (opening !== queued) return
            opening = undefined
            focus()
            for (const event of queued) {
                if (!active()) break
                if (event instanceof PasteEvent) context.renderer.keyInput.emit("paste", event)
                else context.renderer.keyInput.emit("keypress", event)
            }
        }))
    }

    function paste(event: PasteEvent) {
        if (!active()) return
        if (opening) {
            opening.push(new PasteEvent(event.bytes, event.metadata))
            consume(event)
        } else if (!input) {
            waitForEditor()
        }
    }

    function handle(event: KeyEvent) {
        if (!active()) return false
        if (forwarding) return true
        if (opening) {
            opening.push(new KeyEvent(event))
            consume(event)
            return true
        }
        if (context.keymap.pending().length) return true
        const key = keyNotation(event as never)
        if (!key) return true

        if (state.mode() === "insert") {
            const editor = input
            const handled = adapter.handle(event as never, key, ctx)
            if (handled) consume(event)
            if (state.mode() === "normal" && input === editor) {
                // Escape closes a custom answer, but dismisses a text-only form.
                // Only forward it when the host exposes the close-edit action.
                if (context.keymap.active().some((item) => item.group === "Form" && item.description === "Close answer edit")) {
                    sendKey("escape", "\x1b")
                }
            }
            return true
        }

        if (event.ctrl || event.meta || event.option || event.super || event.hyper) {
            if (key === "<C-[>") {
                consume(event)
                sendKey("escape", "\x1b")
            }
            return true
        }
        if (key === "i") {
            consume(event)
            if (input) state.setMode("insert")
            else {
                // An empty native paste selects and opens the custom answer
                // without inserting a character or submitting another option.
                context.renderer.keyInput.emit("paste", new PasteEvent(new Uint8Array()))
            }
            return true
        }
        const arrows: Record<string, [string, string]> = {
            h: ["left", "\x1b[D"], j: ["down", "\x1b[B"],
            k: ["up", "\x1b[A"], l: ["right", "\x1b[C"],
        }
        const arrow = arrows[key]
        if (arrow) {
            consume(event)
            sendKey(...arrow)
            return true
        }
        if (key === "<CR>" && !input) waitForEditor()
        if (/^[1-9]$/.test(key) || key === "<Space>") {
            consume(event)
            // Keep the native selection shortcut, without triggering the
            // custom row's printable-character interceptor.
            sendKey(event.name, "")
            if (!input) waitForEditor()
        } else if (event.sequence && !/[\p{C}]/u.test(event.sequence) && key !== "<CR>" && key !== "<Tab>") {
            consume(event)
        }
        return true
    }

    return { handle, focus, paste }
}
