import type { KeyEvent } from "@opentui/core"
import { TextBuffer, createInitialContext, createKeybindMap, parseKeySequence, processKeystroke } from "@vimee/core"
import type { CursorPosition, KeybindDefinition, KeybindMap, ValidKeySequence, VimAction as VimeeAction, VimContext, VimMode as VimeeMode } from "@vimee/core"
import type { PromptContext } from "../../prompt/types"
import { focusedInput, setInput } from "./actions"
import type { VimConfig } from "./config"
import type { VimLog } from "./log"
import { createPromptMap, derivePromptMap, hostOffset, hostPosition, type PromptMap } from "./map"
import type { createVimState } from "./state"

type VimState = ReturnType<typeof createVimState>
type HostAction = VimeeAction | { type: "submit" }

export type VimeeAdapter = ReturnType<typeof createVimeeAdapter>

export function createVimeeAdapter(state: VimState, config: VimConfig, log: VimLog) {
    let buffer = new TextBuffer("")
    let activeMap = createPromptMap("")
    const maps = new Map([[activeMap.vimText, activeMap]])
    let vim = createInitialContext({ line: 0, col: 0 })
    const keybinds = createKeybinds(config, log)
    let timer: ReturnType<typeof setTimeout> | undefined
    let pendingInsert = ""
    let nativeInsertUndoSaved = false

    return {
        handle(event: KeyEvent, key: string, ctx: PromptContext) {
            const ref = ctx.prompt()
            if (!ref) return false

            const input = focusedInput(ctx)
            const text = input?.plainText ?? ref.current.input
            const offset = clamp(input?.cursorOffset ?? text.length, 0, text.length)
            const map = mapForHostText(text, input)
            const cursor = hostPosition(map, offset)
            const vimeeKey = keyForVimee(event, key)
            if (!vimeeKey) return false

            if (state.mode() === "normal" && key === "<CR>") {
                ref.submit()
                return true
            }

            if (state.mode() === "insert" && key === "<CR>") {
                cancelPendingInsert(ctx, offset)
                return false
            }

            if (state.mode() === "insert") {
                const consumed = handleInsertMode(event, vimeeKey, ctx, map, cursor, offset)
                return consumed ?? false
            }

            const wasPending = keybinds?.isPending() ?? false
            const pendingBefore = pendingInsert
            sync(map, cursor)

            const result = processKeystroke(vimeeKey, vim, buffer, event.ctrl, false, keybinds)
            vim = result.newCtx
            applyActions(result.actions as HostAction[], ctx, map)
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

    function sync(map: PromptMap, cursor: CursorPosition) {
        if (buffer.getContent() !== map.vimText) buffer.replaceContent(map.vimText)
        vim = { ...vim, cursor, mode: state.mode() }
    }

    function mapForHostText(text: string, input: ReturnType<typeof focusedInput>) {
        if (activeMap.hostText === text) return activeMap
        activeMap = createPromptMap(text, input)
        rememberMap(activeMap)
        if (state.mode() === "insert") {
            if (!nativeInsertUndoSaved) {
                buffer.saveUndoPoint(vim.cursor)
                nativeInsertUndoSaved = true
            }
            buffer.replaceContent(activeMap.vimText)
        } else {
            buffer = new TextBuffer(activeMap.vimText)
            nativeInsertUndoSaved = false
        }
        return activeMap
    }

    function rememberMap(map: PromptMap) {
        maps.set(map.vimText, map)
    }

    function nextMap(map: PromptMap, vimText: string) {
        const known = maps.get(vimText)
        if (known) return known
        const next = derivePromptMap(map, vimText)
        rememberMap(next)
        return next
    }

    function applyActions(actions: HostAction[], ctx: PromptContext, map: PromptMap) {
        const ref = ctx.prompt()
        const input = focusedInput(ctx)
        let currentMap = map
        if (!ref) return

        for (const action of actions) {
            switch (action.type) {
                case "content-change":
                    rememberMap(currentMap)
                    currentMap = nextMap(currentMap, action.content)
                    activeMap = currentMap
                    setInput(ref, currentMap.hostText)
                    buffer.replaceContent(action.content)
                    break
                case "cursor-move":
                    if (input) input.cursorOffset = hostOffset(currentMap, action.position)
                    break
                case "mode-change":
                    nativeInsertUndoSaved = false
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

        if (input) input.cursorOffset = hostOffset(currentMap, vim.cursor)
    }

    function handleInsertMode(event: KeyEvent, key: string, ctx: PromptContext, map: PromptMap, cursor: CursorPosition, offset: number) {
        if (key === "Escape") {
            cancelPendingInsert(ctx, offset)
            sync(map, cursor)
            const result = processKeystroke(key, vim, buffer, event.ctrl, false)
            vim = result.newCtx
            applyActions(result.actions as HostAction[], ctx, map)
            syncMode(state, vim.mode)
            state.setPending("")
            log("vimee.key", { key, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: result.actions.map((action) => action.type) })
            return true
        }

        if (!keybinds?.hasKeybinds("insert") && !keybinds?.isPending()) return undefined

        const wasPending = keybinds.isPending()
        const pendingBefore = pendingInsert
        const resolved = keybinds.resolve(key, "insert", event.ctrl)

        switch (resolved.status) {
            case "pending":
                pendingInsert = plainPending(resolved.display)
                state.setPending(resolved.display)
                updateTimeout(ctx)
                return true
            case "matched": {
                sync(map, cursor)
                const actions = applyKeybind(resolved.definition, map)
                applyActions(actions, ctx, map)
                syncMode(state, vim.mode)
                pendingInsert = ""
                state.setPending("")
                updateTimeout(ctx)
                log("vimee.keybind", { key, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: actions.map((action) => action.type) })
                return true
            }
            case "none":
                if (wasPending && pendingBefore) flushPendingInsert(ctx, pendingBefore, offset)
                pendingInsert = ""
                state.setPending("")
                updateTimeout(ctx)
                return wasPending ? false : undefined
        }
    }

    function applyKeybind(definition: KeybindDefinition, map: PromptMap) {
        if ("execute" in definition) {
            const actions = definition.execute(vim, buffer) as HostAction[]
            vim = { ...vim, cursor: hostPosition(map, hostOffset(map, vim.cursor)) }
            return actions
        }

        let actions: HostAction[] = []
        for (const token of parseKeySequence(definition.keys)) {
            const result = processKeystroke(keyToken(token), vim, buffer, tokenCtrl(token), false)
            vim = result.newCtx
            actions = [...actions, ...(result.actions as HostAction[])]
        }
        return actions
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

    function cancelPendingInsert(ctx: PromptContext, offset?: number) {
        if (!keybinds?.isPending()) return
        if (timer) clearTimeout(timer)
        timer = undefined
        keybinds.cancel()
        flushPendingInsert(ctx, pendingInsert, offset)
        pendingInsert = ""
        state.setPending("")
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
        activeMap = createPromptMap(next, input)
        rememberMap(activeMap)
        buffer.replaceContent(activeMap.vimText)
        const nextOffset = currentOffset >= insertAt ? currentOffset + value.length : currentOffset
        if (input) input.cursorOffset = nextOffset
        vim = { ...vim, cursor: hostPosition(activeMap, nextOffset) }
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
    const token = keyToken(key)
    return token.startsWith("<") ? undefined : token
}

function keyToken(token: string) {
    if (token === "<Esc>" || token === "<C-[>") return "Escape"
    if (token === "<CR>") return "Enter"
    if (token === "<Tab>") return "Tab"
    if (token === "<BS>") return "Backspace"
    if (token === "<Del>") return "Delete"
    if (token === "<Space>") return " "
    if (token === "<Up>") return "ArrowUp"
    if (token === "<Down>") return "ArrowDown"
    if (token === "<Left>") return "ArrowLeft"
    if (token === "<Right>") return "ArrowRight"
    if (token === "<Home>") return "Home"
    if (token === "<End>") return "End"
    if (token.startsWith("<C-") && token.endsWith(">")) return token.slice(3, -1).toLowerCase()
    return token
}

function tokenCtrl(token: string) {
    return token.startsWith("<C-") && token !== "<C-[>"
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

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
}
