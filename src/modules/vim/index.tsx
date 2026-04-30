/** @jsxImportSource @opentui/solid */
import type { KeyEvent, ParsedKey } from "@opentui/core"
import { useKeyboard } from "@opentui/solid"
import { onCleanup } from "solid-js"
import type { PromptContext, PromptModule } from "../../prompt/types"
import { applyVimCursorStyle, focusedInput } from "./actions"
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

        if (passThroughKey(event, key, props.state.mode())) {
            preparePassThroughKey(props.ctx, key, props.state.mode())
            syncCursorStyle(true)
            props.ctx.requestRender()
            return
        }

        if (sendNavigationKey(event, props.ctx, key, props.state.mode())) {
            syncCursorStyle(true)
            props.ctx.requestRender()
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

function passThroughKey(event: KeyEvent, key: string, mode: string) {
    if (mode !== "normal") return false
    return event.super === true || isArrowKey(key) || key === "<CR>" || key === "<C-c>"
}

function preparePassThroughKey(ctx: PromptContext, key: string, mode: string) {
    if (mode !== "normal" || key !== "<CR>") return
    const input = focusedInput(ctx)
    if (!input?.plainText || input.cursorOffset === undefined) return
    input.cursorOffset = Math.min(input.cursorOffset + 1, input.plainText.length)
}

function sendNavigationKey(event: KeyEvent, ctx: PromptContext, key: string, mode: string) {
    if (mode !== "normal") return false
    const forwarded = navigationKey(key)
    if (!forwarded) return false

    event.preventDefault()
    event.stopPropagation()
    ctx.api.renderer.keyInput.processParsedKey(forwarded)
    return true
}

function navigationKey(key: string): ParsedKey | undefined {
    if (key === "h") return arrowKey("left", "\u001B[D")
    if (key === "j") return arrowKey("down", "\u001B[B")
    if (key === "k") return arrowKey("up", "\u001B[A")
    if (key === "l") return arrowKey("right", "\u001B[C")
    return undefined
}

function isArrowKey(key: string) {
    return key === "<Left>" || key === "<Down>" || key === "<Up>" || key === "<Right>"
}

function arrowKey(name: string, sequence: string): ParsedKey {
    return {
        name,
        ctrl: false,
        meta: false,
        shift: false,
        option: false,
        sequence,
        number: false,
        raw: sequence,
        eventType: "press",
        source: "raw",
        super: false,
    }
}
