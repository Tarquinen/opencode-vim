/** @jsxImportSource @opentui/solid */
import { useKeyboard } from "@opentui/solid"
import { onCleanup } from "solid-js"
import type { PromptContext, PromptModule } from "../../prompt/types"
import { applyVimCursorStyle } from "./actions"
import type { VimConfig } from "./config"
import { createVimConfig } from "./config"
import { keyNotation } from "./keys"
import { createVimLog } from "./log"
import type { VimLog } from "./log"
import { createVimState } from "./state"
import { createVimeeAdapter } from "./vimee"
import { VimStatus } from "./view"

export function createVimModule(options?: unknown): PromptModule {
    const config = createVimConfig(options)
    const log = createVimLog(config)
    const state = createVimState(config.defaultMode, log)
    log("module.create", { defaultMode: config.defaultMode, keymapTimeout: config.keymapTimeout })

    return {
        id: "vim",
        order: 0,
        setup(ctx) {
            log("module.setup", { kind: ctx.kind, sessionID: ctx.sessionID, workspaceID: ctx.workspaceID })
        },
        renderAbove(ctx) {
            return <VimKeyboard ctx={ctx} config={config} state={state} log={log} />
        },
        renderRight(ctx) {
            return <VimStatus mode={state.mode} pending={() => readablePending(state.pending())} theme={ctx.api.theme.current} pendingDisplayDelay={config.pendingDisplayDelay} disabled={ctx.disabled} log={log} requestRender={ctx.requestRender} />
        },
    }
}

function VimKeyboard(props: { ctx: PromptContext; config: VimConfig; state: ReturnType<typeof createVimState>; log: VimLog }) {
    let cursorStyleMode = ""
    const vimee = createVimeeAdapter(props.state, props.config, props.log)
    props.log("keyboard.mount", { kind: props.ctx.kind })

    const cursorStyleTimer = setInterval(syncCursorStyle, 50)

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

        const consumed = vimee.handle(event, key, props.ctx)
        if (consumed) {
            event.preventDefault()
            event.stopPropagation()
        }
        syncCursorStyle(true)
        props.ctx.requestRender()
    })

    onCleanup(() => {
        props.log("keyboard.cleanup", { kind: props.ctx.kind })
        vimee.cleanup()
        clearInterval(cursorStyleTimer)
    })

    return <box height={0} />

    function syncCursorStyle(force = false) {
        const mode = props.state.mode()
        if (!force && cursorStyleMode === mode) return
        if (applyVimCursorStyle(props.ctx, props.config.cursorStyles[mode])) {
            cursorStyleMode = mode
            props.log("cursor.style", { mode, style: props.config.cursorStyles[mode].style, blinking: props.config.cursorStyles[mode].blinking })
        }
    }
}

function readablePending(sequence: string) {
    if (!sequence) return undefined
    return sequence.replaceAll("><", " ")
}
