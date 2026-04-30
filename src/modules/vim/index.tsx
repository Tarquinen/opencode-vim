/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid"
import { onCleanup } from "solid-js"
import type { PromptContext, PromptModule } from "../../prompt/types"
import { runVimAction } from "./actions"
import type { VimConfig } from "./config"
import { createVimConfig } from "./config"
import { resolveKeymap } from "./keymap"
import { isTextSequence, keyNotation } from "./keys"
import { createVimLog } from "./log"
import type { VimLog } from "./log"
import { createVimState } from "./state"
import { VimStatus } from "./view"

export function createVimModule(options?: unknown): PromptModule {
    const config = createVimConfig(options)
    const log = createVimLog(config)
    const state = createVimState(config.defaultMode, log)
    log("module.create", { defaultMode: config.defaultMode, timeoutlen: config.timeoutlen })

    return {
        id: "vim",
        order: 0,
        setup(ctx) {
            log("module.setup", { kind: ctx.kind, sessionID: ctx.sessionID, workspaceID: ctx.workspaceID })
            return ctx.api.command.register(() => [
                {
                    title: "Vim normal mode",
                    value: "vim-prompt.normal",
                    keybind: "escape",
                    category: "Prompt",
                    hidden: true,
                    enabled: state.mode() === "insert",
                    onSelect() {
                        log("command.normal", { mode: state.mode(), pending: state.pending() })
                        state.setMode("normal")
                        state.setPending("")
                        ctx.requestRender()
                    },
                },
            ])
        },
        renderAbove(ctx) {
            return <VimKeyboard ctx={ctx} config={config} state={state} log={log} />
        },
        renderRight(ctx) {
            return <VimStatus mode={state.mode} pending={() => readablePending(state.pending())} disabled={ctx.disabled} log={log} requestRender={ctx.requestRender} />
        },
    }
}

function VimKeyboard(props: { ctx: PromptContext; config: VimConfig; state: ReturnType<typeof createVimState>; log: VimLog }) {
    let timer: ReturnType<typeof setTimeout> | undefined
    props.log("keyboard.mount", { kind: props.ctx.kind })

    useKeyboard((event) => {
        props.log("keyboard.event", {
            name: event.name,
            ctrl: event.ctrl,
            meta: event.meta,
            shift: event.shift,
            defaultPrevented: event.defaultPrevented,
            propagationStopped: event.propagationStopped,
            mode: props.state.mode(),
            pending: props.state.pending(),
        })

        if (props.ctx.disabled || props.ctx.visible === false) {
            props.log("keyboard.skip", { disabled: props.ctx.disabled, visible: props.ctx.visible })
            return
        }

        const key = keyNotation(event)
        if (!key) {
            props.log("keyboard.no_key")
            return
        }

        const mode = props.state.mode()
        const sequence = props.state.pending() + key
        const result = resolveKeymap(props.config, mode, sequence)
        props.log("keyboard.resolve", { key, mode, sequence, result: result.kind, action: result.kind === "action" ? result.action : undefined })

        if (result.kind === "none") {
            if (mode === "insert") flushPending(props.ctx)
            clearPending()
            if (mode === "normal") {
                event.preventDefault()
                event.stopPropagation()
            }
            return
        }

        event.preventDefault()
        event.stopPropagation()

        if (result.kind === "pending") {
            props.state.setPending(result.sequence)
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => {
                if (mode === "insert") flushPending(props.ctx)
                clearPending()
                props.ctx.requestRender()
            }, props.config.timeoutlen)
            return
        }

        clearPending()
        props.log("keyboard.action", { action: result.action, mode: props.state.mode() })
        runVimAction(result.action, props.state, props.ctx)
        props.ctx.requestRender()
    })

    onCleanup(() => {
        props.log("keyboard.cleanup", { kind: props.ctx.kind })
        if (timer) clearTimeout(timer)
    })

    return <box height={0} />

    function clearPending() {
        if (timer) clearTimeout(timer)
        timer = undefined
        props.state.setPending("")
    }

    function flushPending(ctx: PromptContext) {
        const pending = props.state.pending()
        const ref = ctx.prompt()
        if (pending || !ref) props.log("keyboard.flush_pending", { pending, hasRef: !!ref, textSequence: isTextSequence(pending) })
        if (!ref || !pending || !isTextSequence(pending)) return
        ref.set({
            input: `${ref.current.input}${pending}`,
            mode: ref.current.mode,
            parts: [...ref.current.parts],
        })
    }
}

function readablePending(sequence: string) {
    if (!sequence) return undefined
    if (isTextSequence(sequence)) return sequence
    return sequence.replaceAll("><", " ")
}
