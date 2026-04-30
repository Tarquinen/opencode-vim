import type { KeyEvent } from "@opentui/core"
import { TextBuffer, createInitialContext, createKeybindMap, processKeystroke } from "@vimee/core"
import type { CursorPosition, KeybindDefinition, KeybindMap, ValidKeySequence, VimAction as VimeeAction, VimContext, VimMode as VimeeMode } from "@vimee/core"
import type { PromptContext } from "../../prompt/types"
import { focusedInput, setInput } from "./actions"
import type { VimConfig } from "./config"
import type { VimLog } from "./log"
import type { createVimState } from "./state"

type VimState = ReturnType<typeof createVimState>
type HostAction = VimeeAction | { type: "submit" }

export type VimeeAdapter = ReturnType<typeof createVimeeAdapter>

export function createVimeeAdapter(state: VimState, config: VimConfig, log: VimLog) {
    let buffer = new TextBuffer("")
    let vim = createInitialContext({ line: 0, col: 0 })
    const keybinds = createKeybinds(config, log)
    let timer: ReturnType<typeof setTimeout> | undefined
    let pendingInsert = ""

    return {
        handle(event: KeyEvent, key: string, ctx: PromptContext) {
            const ref = ctx.prompt()
            if (!ref) return false

            const input = focusedInput(ctx)
            const text = input?.plainText ?? ref.current.input
            const offset = clamp(input?.cursorOffset ?? text.length, 0, text.length)
            const cursor = positionFromOffset(text, offset)
            const vimeeKey = keyForVimee(event, key)
            if (!vimeeKey) return false

            if (state.mode() === "normal" && key === "<CR>") {
                ref.submit()
                return true
            }

            const wasPending = keybinds?.isPending() ?? false
            const pendingBefore = pendingInsert
            sync(text, cursor)
            const result = processKeystroke(vimeeKey, vim, buffer, event.ctrl, false, keybinds)
            vim = result.newCtx
            applyActions(result.actions as HostAction[], ctx)
            syncMode(state, vim.mode)
            const keybindPending = keybinds?.isPending() ?? false
            if (wasPending && !keybindPending && pendingBefore && state.mode() === "insert") flushPendingInsert(ctx, pendingBefore, offset)
            pendingInsert = keybindPending && state.mode() === "insert" ? plainPending(vim.statusMessage) : ""
            state.setPending(pendingDisplay(vim, keybindPending))
            updateTimeout(ctx)
            log("vimee.key", { key, vimeeKey, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: result.actions.map((action) => action.type) })
            return consumesKey(vimeeKey, result.actions, vim, keybindPending)
        },
        cleanup() {
            if (timer) clearTimeout(timer)
        },
    }

    function sync(text: string, cursor: CursorPosition) {
        if (buffer.getContent() !== text) buffer = new TextBuffer(text)
        vim = { ...vim, cursor, mode: state.mode() }
    }

    function applyActions(actions: HostAction[], ctx: PromptContext) {
        const ref = ctx.prompt()
        const input = focusedInput(ctx)
        if (!ref) return

        for (const action of actions) {
            switch (action.type) {
                case "content-change":
                    setInput(ref, action.content)
                    buffer.replaceContent(action.content)
                    break
                case "cursor-move":
                    if (input) input.cursorOffset = offsetFromPosition(buffer.getContent(), action.position)
                    break
                case "mode-change":
                    syncMode(state, action.mode)
                    break
                case "quit":
                    ref.blur()
                    break
                case "submit":
                    ref.submit()
                    break
            }
        }

        if (input) input.cursorOffset = offsetFromPosition(buffer.getContent(), vim.cursor)
    }

    function updateTimeout(ctx: PromptContext) {
        if (timer) clearTimeout(timer)
        timer = undefined
        if (!keybinds?.isPending()) return
        timer = setTimeout(() => {
            keybinds.cancel()
            flushPendingInsert(ctx, pendingInsert)
            pendingInsert = ""
            state.setPending("")
            ctx.requestRender()
        }, config.keymapTimeout)
    }

    function flushPendingInsert(ctx: PromptContext, value: string, offset?: number) {
        if (!value || state.mode() !== "insert") return
        const ref = ctx.prompt()
        if (!ref) return
        const input = focusedInput(ctx)
        const text = input?.plainText ?? ref.current.input
        const insertAt = clamp(offset ?? input?.cursorOffset ?? text.length, 0, text.length)
        const currentOffset = input?.cursorOffset ?? insertAt
        const next = text.slice(0, insertAt) + value + text.slice(insertAt)
        setInput(ref, next)
        buffer.replaceContent(next)
        const nextOffset = currentOffset >= insertAt ? currentOffset + value.length : currentOffset
        if (input) input.cursorOffset = nextOffset
        vim = { ...vim, cursor: positionFromOffset(next, nextOffset) }
    }
}

function createKeybinds(config: VimConfig, log: VimLog): KeybindMap | undefined {
    const map = createKeybindMap()
    let count = 0

    for (const [mode, keymaps] of Object.entries(config.keymaps) as Array<[VimeeMode, Record<string, string> | undefined]>) {
        if (!keymaps) continue
        for (const [keys, action] of Object.entries(keymaps)) {
            try {
                map.addKeybind(mode, keys as ValidKeySequence<typeof keys>, keybindAction(action))
                count++
            } catch (error) {
                log("vimee.keymap.invalid", { mode, keys, action, error: error instanceof Error ? error.message : String(error) })
            }
        }
    }

    return count > 0 ? map : undefined
}

function keybindAction(action: string): KeybindDefinition {
    switch (action) {
        case "normal":
            return { keys: "<Esc>" }
        case "insert":
            return { keys: "i" }
        case "submit":
            return { execute: () => [{ type: "submit" } as unknown as VimeeAction] }
        default:
            return { keys: action }
    }
}

function keyForVimee(event: KeyEvent, key: string) {
    if (event.ctrl) return event.name?.toLowerCase()
    if (key === "<Esc>" || key === "<C-[>") return "Escape"
    if (key === "<CR>") return "Enter"
    if (key === "<Tab>") return "Tab"
    if (key === "<BS>") return "Backspace"
    if (key === "<Del>") return "Delete"
    if (key === "<Space>") return " "
    if (key === "<Up>") return "ArrowUp"
    if (key === "<Down>") return "ArrowDown"
    if (key === "<Left>") return "ArrowLeft"
    if (key === "<Right>") return "ArrowRight"
    if (key === "<Home>") return "Home"
    if (key === "<End>") return "End"
    if (key.startsWith("<")) return undefined
    return key
}

function syncMode(state: VimState, mode: VimContext["mode"]) {
    state.setMode(mode === "insert" ? "insert" : "normal")
}

function pendingDisplay(ctx: VimContext, keybindPending: boolean) {
    if (ctx.phase === "operator-pending") return ctx.operator ?? ""
    if (ctx.phase === "text-object-pending") return ctx.textObjectModifier ?? ""
    if (keybindPending) return ctx.statusMessage
    return ""
}

function plainPending(value: string) {
    return value.includes("<") || value.includes(">") ? "" : value
}

function consumesKey(key: string, actions: VimeeAction[], ctx: VimContext, keybindPending: boolean) {
    if (actions.length > 0) return true
    if (keybindPending) return true
    if (ctx.phase !== "idle") return true
    return ctx.mode !== "insert" || key === "Escape"
}

function positionFromOffset(text: string, offset: number): CursorPosition {
    const lines = text.slice(0, offset).split("\n")
    return { line: lines.length - 1, col: lines[lines.length - 1]?.length ?? 0 }
}

function offsetFromPosition(text: string, position: CursorPosition) {
    const lines = text.split("\n")
    const line = clamp(position.line, 0, Math.max(0, lines.length - 1))
    let offset = 0
    for (let index = 0; index < line; index++) offset += lines[index].length + 1
    return offset + clamp(position.col, 0, lines[line]?.length ?? 0)
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
}
