import type { KeyEvent } from "@opentui/core"
import { TextBuffer, createInitialContext, createKeybindMap, parseKeySequence, processKeystroke } from "@vimee/core"
import type { CursorPosition, KeybindDefinition, KeybindMap, ValidKeySequence, VimAction as VimeeAction, VimContext, VimMode as VimeeMode } from "@vimee/core"
import type { PromptContext } from "../../prompt/types"
import { focusedInput, setInput, type EditBufferLike } from "./actions"
import type { VimConfig } from "./config"
import type { VimLog } from "./log"
import type { createVimState } from "./state"

type VimState = ReturnType<typeof createVimState>
type HostAction = VimeeAction | { type: "submit" }
type VisualLineOperator = "d" | "c" | "y"

export type VimeeAdapter = ReturnType<typeof createVimeeAdapter>

export function createVimeeAdapter(state: VimState, config: VimConfig, log: VimLog) {
    let buffer = new TextBuffer("")
    let vim = createInitialContext({ line: 0, col: 0 })
    const keybinds = createKeybinds(config, log)
    const normalKeyPrefixes = keyPrefixes(config.keymaps.normal)
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

            if (state.mode() === "insert" && key === "<CR>") {
                cancelPendingInsert(ctx, offset)
                return false
            }

            if (state.mode() === "insert") {
                const consumed = handleInsertMode(event, vimeeKey, ctx, text, cursor, offset)
                return consumed ?? false
            }

            const wasPending = keybinds?.isPending() ?? false
            const pendingBefore = pendingInsert
            sync(text, cursor)
            if (handleVisualLineCommand(vimeeKey, input, text, ctx, wasPending)) {
                state.setPending("")
                updateTimeout(ctx)
                log("vimee.visual_line", { key, vimeeKey, cursor: vim.cursor })
                return true
            }
            if (handleVisualMotion(vimeeKey, input, text, wasPending)) {
                state.setPending("")
                updateTimeout(ctx)
                log("vimee.visual_motion", { key, vimeeKey, cursor: vim.cursor })
                return true
            }

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

    function handleInsertMode(event: KeyEvent, key: string, ctx: PromptContext, text: string, cursor: CursorPosition, offset: number) {
        if (key === "Escape") {
            cancelPendingInsert(ctx, offset)
            sync(text, cursor)
            const result = processKeystroke(key, vim, buffer, event.ctrl, false)
            vim = result.newCtx
            applyActions(result.actions as HostAction[], ctx)
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
                sync(text, cursor)
                const actions = applyKeybind(resolved.definition)
                applyActions(actions, ctx)
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

    function applyKeybind(definition: KeybindDefinition) {
        if ("execute" in definition) {
            const actions = definition.execute(vim, buffer) as HostAction[]
            vim = { ...vim, cursor: positionFromOffset(buffer.getContent(), offsetFromPosition(buffer.getContent(), vim.cursor)) }
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

    function handleVisualLineCommand(key: string, input: EditBufferLike | undefined, text: string, ctx: PromptContext, keybindPending: boolean) {
        if (!input || keybindPending || normalKeyPrefixes.has(key)) return false

        if (vim.phase === "operator-pending" && isVisualLineOperator(vim.operator) && key === vim.operator) {
            applyVisualLineOperator(ctx, input, text, vim.operator, "line")
            return true
        }
        if (vim.phase === "operator-pending" && isVisualLineOperator(vim.operator) && key === "$") {
            applyVisualLineOperator(ctx, input, text, vim.operator, "end")
            return true
        }
        if (vim.phase === "operator-pending" && isVisualLineOperator(vim.operator) && key === "0") {
            applyVisualLineOperator(ctx, input, text, vim.operator, "start")
            return true
        }

        if (vim.phase !== "idle") return false
        if (key === "I") {
            moveVisualLineStart(input, text)
            enterInsertMode(ctx)
            return true
        }
        if (key === "A") {
            moveVisualLineEnd(input, text, { append: true })
            enterInsertMode(ctx)
            return true
        }
        if (key === "D") return applyVisualLineOperator(ctx, input, text, "d", "end")
        if (key === "C") return applyVisualLineOperator(ctx, input, text, "c", "end")
        if (key === "S") return applyVisualLineOperator(ctx, input, text, "c", "line")
        if (key === "Y") return applyVisualLineOperator(ctx, input, text, "y", "line")
        return false
    }

    function applyVisualLineOperator(ctx: PromptContext, input: EditBufferLike, text: string, operator: VisualLineOperator, scope: "line" | "start" | "end") {
        const ref = ctx.prompt()
        if (!ref) return true

        const range = scope === "line" ? visualLineRange(input, text) : scope === "start" ? visualLineStartRange(input, text) : visualLineEndRange(input, text)
        if (!range) return true

        const value = text.slice(range.start, range.end + 1)
        if (operator === "y") {
            vim = { ...vim, phase: "idle", operator: null, register: value, statusMessage: "" }
            return true
        }

        saveUndoPoint(vim.cursor)
        const next = text.slice(0, range.start) + text.slice(range.end + 1)
        const nextOffset = operator === "c" ? range.start : clamp(range.start, 0, Math.max(0, next.length - 1))
        setInput(ref, next)
        buffer.replaceContent(next)
        input.cursorOffset = nextOffset
        vim = { ...vim, mode: operator === "c" ? "insert" : "normal", phase: "idle", operator: null, statusMessage: "", cursor: positionFromOffset(next, nextOffset) }
        syncMode(state, vim.mode)
        if (operator === "c") ref.focus()
        return true
    }

    function visualLineRange(input: EditBufferLike, text: string) {
        const original = clamp(input.cursorOffset ?? 0, 0, text.length)
        moveVisualLineStart(input, text)
        const start = clamp(input.cursorOffset ?? original, 0, text.length)
        input.cursorOffset = original
        moveVisualLineEnd(input, text)
        const end = clamp(input.cursorOffset ?? original, 0, Math.max(0, text.length - 1))
        input.cursorOffset = original
        vim = { ...vim, cursor: positionFromOffset(text, original) }
        if (!text || end < start) return undefined
        return { start, end }
    }

    function visualLineEndRange(input: EditBufferLike, text: string) {
        const start = clamp(input.cursorOffset ?? 0, 0, text.length)
        const original = start
        moveVisualLineEnd(input, text)
        const end = clamp(input.cursorOffset ?? original, 0, Math.max(0, text.length - 1))
        input.cursorOffset = original
        vim = { ...vim, cursor: positionFromOffset(text, original) }
        if (!text || end < start) return undefined
        return { start, end }
    }

    function visualLineStartRange(input: EditBufferLike, text: string) {
        const end = clamp(input.cursorOffset ?? 0, 0, Math.max(0, text.length - 1))
        const original = end
        moveVisualLineStart(input, text)
        const start = clamp(input.cursorOffset ?? original, 0, text.length)
        input.cursorOffset = original
        vim = { ...vim, cursor: positionFromOffset(text, original) }
        if (!text || end < start) return undefined
        return { start, end }
    }

    function handleVisualMotion(key: string, input: EditBufferLike | undefined, text: string, keybindPending: boolean) {
        if (!input || keybindPending || vim.phase !== "idle" || normalKeyPrefixes.has(key)) return false

        switch (key) {
            case "h":
                return moveHorizontal(input, text, "left")
            case "l":
                return moveHorizontal(input, text, "right")
            case "j":
                return moveVertical(input, text, "down")
            case "k":
                return moveVertical(input, text, "up")
            case "0":
                return moveVisualLineStart(input, text)
            case "$":
                return moveVisualLineEnd(input, text)
            default:
                return false
        }
    }

    function moveHorizontal(input: EditBufferLike, text: string, direction: "left" | "right") {
        const move = direction === "left" ? input.moveCursorLeft : input.moveCursorRight
        if (!move) return false
        const beforeOffset = input.cursorOffset
        const before = input.visualCursor
        const moved = move.call(input)
        const after = input.visualCursor
        if (moved && before && after && beforeOffset !== undefined && after.visualRow !== before.visualRow) {
            input.cursorOffset = beforeOffset
            syncCursorFromInput(input, text)
            return true
        }
        if (moved && direction === "right" && beforeOffset !== undefined && isAtVisualLineEnd(input)) {
            input.cursorOffset = beforeOffset
            syncCursorFromInput(input, text)
            return true
        }
        clampNormalLineEnd(input)
        syncCursorFromInput(input, text)
        return true
    }

    function moveVertical(input: EditBufferLike, text: string, direction: "up" | "down") {
        const move = direction === "up" ? input.moveCursorUp : input.moveCursorDown
        if (!move) return false
        const beforeRow = input.visualCursor?.visualRow
        move.call(input)
        boundVerticalMove(input, text, direction, beforeRow)
        clampNormalLineEnd(input)
        syncCursorFromInput(input, text)
        return true
    }

    function enterInsertMode(ctx: PromptContext) {
        vim = { ...vim, mode: "insert", phase: "idle", operator: null, statusMessage: "" }
        syncMode(state, "insert")
        ctx.prompt()?.focus()
    }

    function moveVisualLineStart(input: EditBufferLike, text: string) {
        const startRow = input.visualCursor?.visualRow
        for (let index = 0; index < text.length; index++) {
            const beforeOffset = input.cursorOffset
            if (!input.moveCursorLeft?.()) break
            if (startRow !== undefined && input.visualCursor?.visualRow !== startRow) {
                if (beforeOffset !== undefined) input.cursorOffset = beforeOffset
                break
            }
            if (input.visualCursor?.visualCol === 0) break
        }
        syncCursorFromInput(input, text)
        return true
    }

    function moveVisualLineEnd(input: EditBufferLike, text: string, options?: { append?: boolean }) {
        if (input.gotoVisualLineEnd?.()) {
            if (!options?.append) clampNormalLineEnd(input)
            syncCursorFromInput(input, text)
            return true
        }

        const startRow = input.visualCursor?.visualRow
        let previousOffset = input.cursorOffset
        for (let index = 0; index < text.length; index++) {
            const beforeOffset = input.cursorOffset
            if (!input.moveCursorRight?.()) break
            if (startRow !== undefined && input.visualCursor?.visualRow !== startRow) {
                if (beforeOffset !== undefined) input.cursorOffset = beforeOffset
                break
            }
            if (!options?.append && isAtVisualLineEnd(input)) {
                if (previousOffset !== undefined) input.cursorOffset = previousOffset
                break
            }
            previousOffset = input.cursorOffset
        }
        if (!options?.append) clampNormalLineEnd(input)
        syncCursorFromInput(input, text)
        return true
    }

    function boundVerticalMove(input: EditBufferLike, text: string, direction: "up" | "down", beforeRow: number | undefined) {
        const afterRow = input.visualCursor?.visualRow
        if (beforeRow === undefined || afterRow === undefined) return
        const targetRow = direction === "down" ? beforeRow + 1 : beforeRow - 1
        if (direction === "down" && afterRow <= targetRow) return
        if (direction === "up" && afterRow >= targetRow) return

        const moveBack = direction === "down" ? input.moveCursorLeft : input.moveCursorRight
        if (!moveBack) return
        for (let index = 0; index < text.length && input.visualCursor?.visualRow !== undefined; index++) {
            const row = input.visualCursor.visualRow
            if (direction === "down" ? row <= targetRow : row >= targetRow) break
            if (!moveBack.call(input)) break
        }
        if (direction === "up" && input.visualCursor?.visualRow === targetRow) moveVisualLineEnd(input, text)
    }

    function syncCursorFromInput(input: EditBufferLike, text: string) {
        const offset = clamp(input.cursorOffset ?? 0, 0, text.length)
        vim = { ...vim, cursor: positionFromOffset(text, offset) }
    }

    function saveUndoPoint(cursor: CursorPosition) {
        const undoable = buffer as TextBuffer & { saveUndoPoint?: (cursor: CursorPosition) => void }
        undoable.saveUndoPoint?.(cursor)
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

function isVisualLineOperator(value: unknown): value is VisualLineOperator {
    return value === "d" || value === "c" || value === "y"
}

function keyPrefixes(keymaps: Record<string, string> | undefined) {
    const prefixes = new Set<string>()
    if (!keymaps) return prefixes
    for (const keys of Object.keys(keymaps)) {
        try {
            const [first] = parseKeySequence(keys)
            if (first) prefixes.add(keyToken(first))
        } catch {
            // Invalid keymaps are logged when the KeybindMap is built.
        }
    }
    return prefixes
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

function isAtVisualLineEnd(input: EditBufferLike) {
    const cursor = input.visualCursor
    const eol = input.editorView?.getVisualEOL?.()
    if (!cursor || !eol) return false
    return cursor.visualRow === eol.visualRow && cursor.offset === eol.offset
}

function clampNormalLineEnd(input: EditBufferLike) {
    const cursor = input.visualCursor
    const eol = input.editorView?.getVisualEOL?.()
    const offset = input.cursorOffset
    if (!cursor || !eol || offset === undefined) return
    if (cursor.visualCol === 0) return
    if (cursor.visualRow === eol.visualRow && (cursor.offset === eol.offset || offset === eol.offset)) input.cursorOffset = Math.max(0, offset - 1)
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
