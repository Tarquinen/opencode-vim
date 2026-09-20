import type { KeyEvent } from "@opentui/core"
import { TextBuffer, createInitialContext, createKeybindMap, parseKeySequence, processKeystroke, resetContext, resolveMotion } from "@vimee/core"
import type { CursorPosition, KeybindDefinition, KeybindMap, MotionRange, Operator, ValidKeySequence, VimAction as VimeeAction, VimContext, VimMode as VimeeMode } from "@vimee/core"
import { focusedInput, setInput, type EditBufferLike, type PromptContext } from "./actions"
import type { VimConfig } from "./config"
import type { VimLog } from "./log"
import { createGraphemeCodec } from "./graphemes"
import { charToDisplay, displayToChar, displayWidth, createPromptMap, derivePromptMap, hostOffset, hostPosition, type PromptMap } from "./map"
import type { createVimState } from "./state"

type VimState = ReturnType<typeof createVimState>
type HostAction = VimeeAction | { type: "submit" } | { type: "command"; command: string }
type HostKeybindAction = "normal" | "submit" | "command"
type HostKeybindDefinition = KeybindDefinition & { hostAction?: HostKeybindAction; command?: string }
type HostRange = { start: number; end: number }

const YANK_FLASH_MS = 250

export type VimeeAdapter = ReturnType<typeof createVimeeAdapter>

export function createVimeeAdapter(state: VimState, config: VimConfig, log: VimLog) {
    const codec = createGraphemeCodec()
    let buffer = new TextBuffer("")
    let activeMap = createPromptMap("", undefined, codec)
    const maps = new Map([[activeMap.vimText, activeMap]])
    let vim = createInitialContext({ line: 0, col: 0 })
    const keybinds = createKeybinds(config, log)
    let timer: ReturnType<typeof setTimeout> | undefined
    let yankTimer: ReturnType<typeof setTimeout> | undefined
    let yankFlashActive = false
    let pendingInsert = ""
    let pendingTarget: { input: EditBufferLike; offset: number } | undefined
    let pendingContext: PromptContext | undefined
    let nativeInsertUndoSaved = false
    let historyText: string | undefined
    let activeInput: EditBufferLike | undefined
    let mapWidth: number | undefined
    let mapWrapMode: string | undefined
    const defaultHistoryKeys = {
        k: !hasNormalKeyPrefix(config, "k"),
        j: !hasNormalKeyPrefix(config, "j"),
    }
    const appendMapped = hasNormalKeyPrefix(config, "A")

    return {
        attach,
        suspend,
        isPending: () => vim.phase !== "idle" || vim.count > 0 || !!keybinds?.isPending(),
        handle(event: KeyEvent, key: string, ctx: PromptContext) {
            const ref = ctx.prompt()
            if (!ref) return false
            const input = focusedInput(ctx)
            attach(ctx)

            let vimeeKey = keyForVimee(event, key)
            if (!vimeeKey) return false
            vimeeKey = codec.encode(vimeeKey)

            if (state.mode() === "insert") {
                if (vimeeKey === "Escape") {
                    cancelPendingInsert(ctx)
                    enterNormal(ctx)
                    state.setPending("")
                    updateTimeout(ctx)
                    log("vimee.key", { key, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: ["mode-change"] })
                    return true
                }
                return handleInsertKeybind(event, vimeeKey, ctx)
            }

            const text = input?.plainText ?? ref.current.input
            const dw = displayWidth(text)
            const displayOff = clamp(input?.cursorOffset ?? dw, 0, dw)
            const charOff = displayToChar(text, displayOff)

            const canBrowseHistory = vim.phase === "idle" && vim.count === 0 && !keybinds?.isPending()
            const historyCommand = canBrowseHistory ? defaultHistoryCommand(vimeeKey, text, historyText, defaultHistoryKeys) : undefined
            if (historyCommand) {
                const result = dispatchCommand(historyCommand, ctx)
                historyText = result.ok ? (focusedInput(ctx)?.plainText ?? ref.current.input) : undefined
                state.setPending("")
                updateTimeout(ctx)
                log("vimee.history", { key, command: historyCommand, handled: result.ok })
                return true
            }
            historyText = undefined

            const map = mapForHostText(text, input)
            const cursor = hostPosition(map, displayOff)

            const wasPending = keybinds?.isPending() ?? false
            const pendingBefore = pendingInsert
            sync(map, cursor)

            if (vimeeKey === "A" && vim.mode === "normal" && vim.phase === "idle" && !wasPending && !appendMapped && appendVisualLine(input, map)) {
                state.setPending("")
                updateTimeout(ctx)
                log("vimee.key", { key, vimeeKey, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: ["mode-change"] })
                return true
            }

            const hostEnd = vimeeKey === "e" && vim.phase === "idle" ? charToDisplay(map.hostText, endMotionOffset(map.hostText, charOff, vim.count || 1)) : undefined
            const shouldFlashYank = shouldFlashYankFor(vimeeKey)
            const visualYankRange = visualYankRangeFor(map)
            vimeeKey = textObjectAlias(vimeeKey, vim) ?? vimeeKey
            const textObjectHandled = handleTextObject(vimeeKey, ctx, map)
            if (textObjectHandled !== undefined) return textObjectHandled
            const resolved = keybinds?.resolve(vimeeKey, vim.mode, event.ctrl)
            if (resolved?.status === "pending") {
                vim = { ...vim, statusMessage: resolved.display }
                state.setPending(resolved.display)
                updateTimeout(ctx)
                log("vimee.key", { key, vimeeKey, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: [] })
                return true
            }
            if (vimeeKey === "Enter" && state.mode() === "normal" && vim.phase === "idle" && !wasPending && resolved?.status !== "matched") {
                ref.submit()
                state.setPending("")
                updateTimeout(ctx)
                log("vimee.key", { key, vimeeKey, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: ["submit"] })
                return true
            }

            let result
            if (resolved?.status === "matched") {
                const actions = applyKeybind(resolved.definition, map)
                result = { newCtx: vim, actions }
            } else {
                result = processKey(vimeeKey, event.ctrl)
            }
            vim = result.newCtx
            const actions = result.actions as HostAction[]
            if (hostEnd !== undefined && actions.every((action) => action.type === "cursor-move") && hostEnd > hostOffset(map, vim.cursor, "previous")) vim = { ...vim, cursor: hostPosition(map, hostEnd) }
            let clampFinalCursor = true
            const content = actions.find((action) => action.type === "content-change")?.content
            if (vimeeKey === "x" && state.mode() === "normal" && content !== undefined) {
                const next = nextMap(map, content)
                const nextDW = displayWidth(next.hostText)
                const target = clamp(displayOff, 0, Math.max(0, nextDW - 1))
                if (charOff < map.hostText.length - 1 && map.hostText[charOff + 1] !== "\n" && hostOffset(next, vim.cursor, "previous") < target) {
                    vim = { ...vim, cursor: hostPosition(next, target) }
                    clampFinalCursor = false
                }
            }
            applyActions(actions, ctx, map, clampFinalCursor)
            if (shouldFlashYank) flashYank(ctx, activeMap, yankAction(actions), visualYankRange)
            syncMode(state, vim.mode)

            const keybindPending = keybinds?.isPending() ?? false
            if (wasPending && !keybindPending && pendingBefore && state.mode() === "insert") flushPendingInsert(ctx, pendingBefore, charOff)
            pendingInsert = keybindPending && state.mode() === "insert" ? plainPending(vim.statusMessage) : ""
            state.setPending(pendingDisplay(vim, keybindPending))
            updateTimeout(ctx)
            log("vimee.key", { key, vimeeKey, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: actions.map((action) => action.type) })
            return consumesKey(vimeeKey, actions, vim, keybindPending)
        },
        cleanup() {
            suspend()
            maps.clear()
        },
    }

    function attach(ctx: PromptContext) {
        const input = focusedInput(ctx)
        if (activeInput === input) return
        suspend()
        activeInput = input
        activeMap = createPromptMap(input?.plainText ?? ctx.prompt()?.current.input ?? "", input, codec)
        maps.clear()
        rememberMap(activeMap)
        buffer = new TextBuffer(activeMap.vimText)
        nativeInsertUndoSaved = false
        vim = { ...resetContext(vim), cursor: hostPosition(activeMap, input?.cursorOffset ?? 0), mode: state.mode() }
        mapWidth = input?.width
        mapWrapMode = input?.wrapMode
    }

    function suspend() {
        if (pendingContext) cancelPendingInsert(pendingContext)
        if (timer) clearTimeout(timer)
        timer = undefined
        keybinds?.cancel()
        cancelYankFlash()
        if (activeInput && !activeInput.isDestroyed) clearVisualSelection(activeInput)
        if (isVisualMode(state.mode())) state.setMode("normal")
        vim = resetContext(vim)
        state.setPending("")
        pendingTarget = undefined
        pendingContext = undefined
    }

    function sync(map: PromptMap, cursor: CursorPosition) {
        if (buffer.getContent() !== map.vimText) buffer.replaceContent(map.vimText)
        vim = { ...vim, cursor, mode: state.mode() }
    }

    function mapForHostText(text: string, input: ReturnType<typeof focusedInput>) {
        const textChanged = activeMap.hostText !== text
        if (!textChanged && mapWidth === input?.width && mapWrapMode === input?.wrapMode) return activeMap
        if (textChanged && state.mode() === "insert") recordNativeChange(text)
        activeMap = createPromptMap(text, input, codec)
        mapWidth = input?.width
        mapWrapMode = input?.wrapMode
        if (textChanged && state.mode() !== "insert") maps.clear()
        rememberMap(activeMap)
        if (textChanged && state.mode() === "insert") {
            if (!nativeInsertUndoSaved) {
                buffer.saveUndoPoint(vim.cursor)
                nativeInsertUndoSaved = true
            }
            buffer.replaceContent(activeMap.vimText)
        } else if (textChanged) {
            buffer = new TextBuffer(activeMap.vimText)
            nativeInsertUndoSaved = false
        } else {
            buffer.replaceContent(activeMap.vimText)
        }
        return activeMap
    }

    function recordNativeChange(text: string) {
        const before = codec.encode(activeMap.hostText)
        const after = codec.encode(text)
        const start = codec.encode(activeMap.hostText.slice(0, displayToChar(activeMap.hostText, hostOffset(activeMap, vim.cursor)))).length
        let prefix = 0
        while (prefix < start && prefix < after.length && before[prefix] === after[prefix]) prefix++
        let suffix = 0
        while (suffix < before.length - start && suffix < after.length - prefix && before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++
        const keys = [...vim.pendingChange]
        if (!keys.length) keys.push("i")
        for (let index = prefix; index < start; index++) keys.push("Backspace")
        for (let index = start; index < before.length - suffix; index++) keys.push("Delete")
        for (const key of after.slice(prefix, after.length - suffix)) keys.push(key === "\n" ? "Enter" : key === "\t" ? "Tab" : key)
        vim = { ...vim, pendingChange: keys }
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

    function applyActions(actions: HostAction[], ctx: PromptContext, map: PromptMap, clampFinalCursor = true) {
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
                    setCursor(input, currentMap, action.position)
                    break
                case "mode-change":
                    nativeInsertUndoSaved = action.mode === "insert" && actions.some((item) => item.type === "content-change")
                    if (action.mode === "insert") {
                        cancelYankFlash()
                        if (input) clearVisualSelection(input)
                    }
                    syncMode(state, action.mode)
                    break
                case "quit":
                    ref.blur()
                    break
                case "submit":
                    ref.submit()
                    break
                case "command":
                    dispatchCommand(action.command, ctx)
                    return
            }
        }

        setCursor(input, currentMap, vim.cursor, clampFinalCursor)
        syncVisualSelection(input, currentMap, ctx)
    }

    function handleInsertKeybind(event: KeyEvent, key: string, ctx: PromptContext): boolean {
        if (!keybinds?.hasKeybinds("insert") && !keybinds?.isPending()) return false

        const wasPending = keybinds.isPending()
        const pendingBefore = pendingInsert
        const resolved = keybinds.resolve(key, "insert", event.ctrl)

        switch (resolved.status) {
            case "pending":
                if (!wasPending) {
                    const input = focusedInput(ctx)
                    pendingTarget = input ? { input, offset: input.cursorOffset ?? 0 } : undefined
                    pendingContext = ctx
                }
                pendingInsert = codec.decode(plainPending(resolved.display))
                state.setPending(resolved.display)
                updateTimeout(ctx)
                return true
            case "matched": {
                if (applyInsertKeybind(resolved.definition, ctx)) {
                    pendingInsert = ""
                    state.setPending("")
                    updateTimeout(ctx)
                    log("vimee.keybind", { key, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: ["mode-change"] })
                    return true
                }

                if (wasPending && pendingBefore) flushPendingInsert(ctx, pendingBefore)
                pendingInsert = ""
                state.setPending("")
                updateTimeout(ctx)
                log("vimee.keybind.unsupported", { key })
                return false
            }
            case "none":
                if (wasPending && pendingBefore) flushPendingInsert(ctx, pendingBefore)
                pendingInsert = ""
                state.setPending("")
                updateTimeout(ctx)
                return wasPending ? handleInsertKeybind(event, key, ctx) : false
        }
    }

    function applyInsertKeybind(definition: KeybindDefinition, ctx: PromptContext) {
        switch (insertHostAction(definition)) {
            case "normal":
                enterNormal(ctx)
                return true
            case "submit":
                ctx.prompt()?.submit()
                return true
            case "command":
                dispatchCommand((definition as HostKeybindDefinition).command!, ctx)
                return true
            default:
                return false
        }
    }

    function enterNormal(ctx: PromptContext) {
        const ref = ctx.prompt()
        const input = focusedInput(ctx)
        const text = input?.plainText ?? ref?.current.input ?? ""
        const map = mapForHostText(text, input)

        if (input && text.length > 0) {
            const dw = displayWidth(text)
            const offset = clamp(input?.cursorOffset ?? dw, 0, dw)
            const charOffset = displayToChar(text, offset)
            if (charOffset > 0 && text[charOffset - 1] !== "\n") {
                input.cursorOffset = charToDisplay(text, displayToChar(text, Math.max(0, offset - 1)))
            }
            clampNormalCursor(input)
        }

        const lastChange = nativeInsertUndoSaved ? [...vim.pendingChange, "Escape"] : vim.lastChange
        vim = { ...resetContext(vim), cursor: hostPosition(map, input?.cursorOffset ?? 0), mode: "normal", statusMessage: "", lastChange, pendingChange: [] }
        nativeInsertUndoSaved = false
        syncMode(state, "normal")
    }

    function insertHostAction(definition: KeybindDefinition): HostKeybindAction | undefined {
        const action = (definition as HostKeybindDefinition).hostAction
        if (action) return action
        if ("execute" in definition) return undefined
        if (definition.keys === "<Esc>" || definition.keys === "<C-[>" || definition.keys === "Escape") return "normal"
        return undefined
    }

    function applyKeybind(definition: KeybindDefinition, map: PromptMap) {
        if ("execute" in definition) {
            const actions = definition.execute(vim, buffer) as HostAction[]
            vim = { ...vim, cursor: hostPosition(map, cursorOffset(map, vim.cursor)) }
            return actions
        }

        let actions: HostAction[] = []
        for (const token of parseKeySequence(definition.keys)) {
            const result = processKey(codec.encode(keyToken(token)), tokenCtrl(token))
            vim = result.newCtx
            actions = [...actions, ...(result.actions as HostAction[])]
        }
        return actions
    }

    function processKey(key: string, ctrl = false): { newCtx: VimContext; actions: HostAction[] } {
        let wordRange: MotionRange | undefined
        if (!ctrl && vim.mode !== "insert" && (key === "w" || key === "W") && (vim.phase === "idle" || vim.phase === "operator-pending")) {
            wordRange = forwardWordRange(key, vim.cursor, buffer, vim.count || 1)
            if (vim.phase === "idle") {
                const cursor = { ...wordRange.end, col: Math.min(wordRange.end.col, Math.max(0, buffer.getLineLength(wordRange.end.line) - 1)) }
                return { newCtx: { ...resetContext(vim), cursor }, actions: [{ type: "cursor-move", position: cursor }] }
            }
        }
        if (key === "." && !ctrl && vim.mode === "normal" && vim.phase === "idle" && vim.lastChange.length) {
            // A repeated insert/change is one undo step, including native typing.
            const original = buffer
            const before = buffer.getContent()
            const cursor = vim.cursor
            const keys = [...vim.lastChange]
            if (vim.count) {
                while (/^[0-9]$/.test(keys[0] ?? "")) keys.shift()
                keys.unshift(...String(vim.count))
            }
            vim = { ...vim, count: 0 }
            const actions: HostAction[] = []
            buffer = new TextBuffer(before)
            try {
                for (const token of keys) {
                    const result = processKey(token)
                    vim = result.newCtx
                    actions.push(...result.actions)
                }
                if (buffer.getContent() !== before) {
                    original.saveUndoPoint(cursor)
                    original.replaceContent(buffer.getContent())
                }
            } finally {
                buffer = original
            }
            return { newCtx: { ...vim, lastChange: keys, pendingChange: [] }, actions }
        }

        let range: MotionRange | undefined
        const operator = vim.operator
        if (!ctrl && operator && textObjectOperator(operator)) {
            if (vim.phase === "operator-pending") {
                const count = vim.count || 1
                if (key === "l" || key === "ArrowRight") {
                    // Vimee 0.3 treats l as inclusive; Vim's operator motion is exclusive.
                    range = { start: vim.cursor, end: { line: vim.cursor.line, col: Math.min(buffer.getLineLength(vim.cursor.line), vim.cursor.col + count) }, inclusive: false, linewise: false }
                } else if (key === operator) {
                    range = { start: { line: vim.cursor.line, col: 0 }, end: { line: Math.min(buffer.getLineCount() - 1, vim.cursor.line + count - 1), col: 0 }, inclusive: true, linewise: true }
                } else if (operator === "c" && key === "w" && /\S/.test(buffer.getLine(vim.cursor.line)[vim.cursor.col] ?? "")) {
                    range = resolveMotion("e", { ...vim.cursor, col: vim.cursor.col - 1 }, buffer, count, vim.count > 0, vim)?.range
                    if (range) range.start = vim.cursor
                } else if (wordRange) {
                    range = wordRange
                    if (operator === "d" && range.end.line > range.start.line && /\S/.test(buffer.getLine(range.start.line)[range.start.col] ?? "") && range.end.col === Math.max(0, buffer.getLine(range.end.line).search(/\S/))) {
                        range.end = { line: range.end.line - 1, col: buffer.getLineLength(range.end.line - 1) }
                    }
                } else if (operator === "c") {
                    const motion = resolveMotion(key, vim.cursor, buffer, count, vim.count > 0, vim)
                    if (motion?.range.linewise) range = motion.range
                }
            } else if (vim.phase === "text-object-pending" && vim.textObjectModifier) {
                range = resolvePromptTextObject(vim.textObjectModifier, key, vim.cursor, buffer) ?? undefined
            }
        }
        if (range && operator) {
            const keys: string[] = []
            if (vim.count) keys.push(...String(vim.count))
            for (const token of vim.pendingChange) {
                if (!/^[0-9]$/.test(token)) keys.push(token)
            }
            keys.push(key)
            const result = executeTextObject(operator, range, buffer, vim)
            if (operator === "y") result.context.pendingChange = []
            else if (result.context.mode === "insert") result.context.pendingChange = keys
            else { result.context.lastChange = keys; result.context.pendingChange = [] }
            return { newCtx: result.context, actions: result.actions }
        }

        // The engine saves undo points for yanks too. Run read-only operations
        // against a disposable buffer so they cannot alter the editing history.
        const yanking = operator === "y" || (isVisualMode(vim.mode) && key === "y") || (vim.mode === "normal" && key === "Y")
        return processKeystroke(key, vim, yanking ? new TextBuffer(buffer.getContent()) : buffer, ctrl, false)
    }

    function handleTextObject(key: string, ctx: PromptContext, map: PromptMap) {
        if (vim.phase !== "text-object-pending" || !vim.textObjectModifier) return undefined
        const range = resolvePromptTextObject(vim.textObjectModifier, key, vim.cursor, buffer)
        if (!range) return undefined

        const flashRange = vim.operator === "y" ? motionHostRange(map, range) : undefined

        if (!vim.operator) {
            vim = { ...resetContext(vim), visualAnchor: range.start, cursor: range.end }
            applyActions([{ type: "cursor-move", position: range.end }], ctx, map)
            state.setPending("")
            updateTimeout(ctx)
            log("vimee.textobject", { key, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: ["cursor-move"] })
            return true
        }
        if (!textObjectOperator(vim.operator)) return undefined

        const result = processKey(key)
        vim = result.newCtx
        applyActions(result.actions, ctx, map)
        if (flashRange) flashYank(ctx, activeMap, result.actions.find((action): action is YankAction => action.type === "yank"), flashRange)
        syncMode(state, vim.mode)
        state.setPending("")
        updateTimeout(ctx)
        log("vimee.textobject", { key, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: result.actions.map((action) => action.type) })
        return true
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

    function cancelPendingInsert(ctx: PromptContext, offset?: number, flush = true) {
        if (!keybinds?.isPending()) return
        if (timer) clearTimeout(timer)
        timer = undefined
        keybinds.cancel()
        if (flush) flushPendingInsert(ctx, pendingInsert, offset)
        pendingInsert = ""
        pendingTarget = undefined
        pendingContext = undefined
        state.setPending("")
    }

    function flushPendingInsert(ctx: PromptContext, value: string, charOffset?: number) {
        if (!value || state.mode() !== "insert") return
        if (pendingTarget?.input.isDestroyed) return
        if (pendingTarget?.input.insertText && !pendingTarget.input.isDestroyed) {
            const { input, offset } = pendingTarget
            const cursor = input.cursorOffset ?? 0
            input.clearSelection?.()
            input.cursorOffset = offset
            input.insertText!(value)
            input.cursorOffset = cursor >= offset ? cursor + displayWidth(value) : cursor
            return
        }
        const ref = ctx.prompt()
        if (!ref) return
        const input = focusedInput(ctx)
        const text = input?.plainText ?? ref.current.input
        const currentDisplayOff = input?.cursorOffset ?? 0
        const currentCharOff = displayToChar(text, currentDisplayOff)
        const insertAtChar = charOffset ?? currentCharOff
        const next = text.slice(0, insertAtChar) + value + text.slice(insertAtChar)
        setInput(ref, next)
        const nextCharOff = currentCharOff >= insertAtChar ? currentCharOff + value.length : currentCharOff
        if (input) input.cursorOffset = displayWidth(next.slice(0, nextCharOff))
    }

    function cursorOffset(map: PromptMap, position: CursorPosition) {
        return hostOffset(map, position, vim.mode === "insert" ? "next" : "previous")
    }

    function setCursor(input: EditBufferLike | undefined, map: PromptMap, position: CursorPosition, clampCursor = true) {
        if (!input) return
        input.cursorOffset = cursorOffset(map, position)
        if (clampCursor && vim.mode !== "insert") clampNormalCursor(input)
    }

    function appendVisualLine(input: EditBufferLike | undefined, map: PromptMap) {
        if (!input?.gotoVisualLineEnd) return false
        clearVisualSelection(input)
        input.gotoVisualLineEnd()
        vim = { ...vim, cursor: hostPosition(map, input.cursorOffset ?? displayWidth(map.hostText)), mode: "insert", phase: "idle", count: 0, operator: null, pendingChange: ["A"], statusMessage: "-- INSERT --" }
        nativeInsertUndoSaved = false
        syncMode(state, "insert")
        return true
    }

    function syncVisualSelection(input: EditBufferLike | undefined, map: PromptMap, ctx: PromptContext) {
        if (!input) return
        if (!isVisualMode(vim.mode) || !vim.visualAnchor) {
            if (!yankFlashActive) clearVisualSelection(input)
            return
        }

        cancelYankFlash()
        const range = vim.mode === "visual-line" ? visualLineRange(map, vim.visualAnchor, vim.cursor) : visualCharRange(map, vim.visualAnchor, vim.cursor)
        if (!range) {
            clearVisualSelection(input)
            return
        }

        setSelection(input, range.start, range.end, ctx)
    }

    function visualYankRangeFor(map: PromptMap) {
        if (!isVisualMode(vim.mode) || !vim.visualAnchor) return undefined
        return vim.mode === "visual-line" ? visualLineRange(map, vim.visualAnchor, vim.cursor) : visualCharRange(map, vim.visualAnchor, vim.cursor)
    }

    function flashYank(ctx: PromptContext, map: PromptMap, action: YankAction | undefined, visualRange: HostRange | undefined) {
        if (!action) return
        const input = focusedInput(ctx)
        if (!input) return
        const range = visualRange ?? yankedTextRange(map, vim.cursor, action.text)
        if (!range) return

        cancelYankFlash()
        yankFlashActive = true
        setYankSelection(input, range.start, range.end, ctx)
        ctx.requestRender()
        yankTimer = setTimeout(() => {
            yankTimer = undefined
            if (!yankFlashActive) return
            yankFlashActive = false
            clearVisualSelection(input)
            ctx.requestRender()
        }, YANK_FLASH_MS)
    }

    function cancelYankFlash() {
        if (yankTimer) clearTimeout(yankTimer)
        yankTimer = undefined
        yankFlashActive = false
    }

    function shouldFlashYankFor(key: string) {
        if (isVisualMode(vim.mode)) return key === "y"
        return vim.operator === "y"
    }
}

function forwardWordRange(key: string, start: CursorPosition, buffer: TextBuffer, count: number): MotionRange {
    let { line, col } = start
    for (let index = 0; index < count; index++) {
        const text = buffer.getLine(line)
        const kind = wordClass(text[col], key === "W")
        while (col < text.length && wordClass(text[col], key === "W") === kind) col++
        while (col < text.length && /\s/.test(text[col])) col++
        while (col >= buffer.getLineLength(line) && line < buffer.getLineCount() - 1) {
            line++
            col = 0
            const next = buffer.getLine(line)
            if (!next.length) break
            while (col < next.length && /\s/.test(next[col])) col++
            if (col < next.length) break
        }
    }
    return { start, end: { line, col }, linewise: false, inclusive: false }
}

function wordClass(char: string | undefined, big: boolean) {
    if (!char || /\s/.test(char)) return "space"
    return big || /\w/.test(char) ? "word" : "punctuation"
}

function visualCharRange(map: PromptMap, anchor: CursorPosition, cursor: CursorPosition): HostRange | undefined {
    const anchorOffset = hostOffset(map, anchor, "next")
    const cursorOffset = hostOffset(map, cursor, "previous")
    return hostRange(map, anchorOffset, cursorOffset)
}

function visualLineRange(map: PromptMap, anchor: CursorPosition, cursor: CursorPosition): HostRange | undefined {
    const startLine = Math.min(anchor.line, cursor.line)
    const endLine = Math.max(anchor.line, cursor.line)
    const start = hostOffset(map, { line: startLine, col: 0 }, "next")
    const end = hostOffset(map, { line: endLine, col: vimLineLength(map.vimText, endLine) }, "previous")
    return hostRange(map, start, end)
}

function yankedTextRange(map: PromptMap, cursor: CursorPosition, text: string): HostRange | undefined {
    if (!text) return undefined
    if (text.endsWith("\n")) {
        const lineCount = text.split("\n").length - 1
        return visualLineRange(map, cursor, { line: cursor.line + Math.max(0, lineCount - 1), col: 0 })
    }

    const start = vimOffsetFromPosition(map.vimText, cursor)
    return vimOffsetRange(map, start, start + text.length - 1)
}

function motionHostRange(map: PromptMap, range: MotionRange): HostRange | undefined {
    if (range.linewise) return visualLineRange(map, range.start, range.end)
    const start = vimOffsetFromPosition(map.vimText, range.start)
    const end = vimOffsetFromPosition(map.vimText, range.end)
    return vimOffsetRange(map, start, end)
}

function vimOffsetRange(map: PromptMap, left: number, right: number): HostRange | undefined {
    const start = hostFromVimOffset(map, Math.min(left, right), "next")
    const end = hostFromVimOffset(map, Math.max(left, right), "previous")
    return hostRange(map, start, end)
}

function hostRange(map: PromptMap, left: number, right: number): HostRange | undefined {
    if (!map.hostText) return undefined
    const dw = displayWidth(map.hostText)
    const start = clamp(Math.min(left, right), 0, Math.max(0, dw - 1))
    const end = clamp(Math.max(left, right), 0, Math.max(0, dw - 1))
    return { start, end }
}

type YankAction = Extract<VimeeAction, { type: "yank" }>

function yankAction(actions: HostAction[]): YankAction | undefined {
    return actions.find((action): action is YankAction => action.type === "yank")
}

function setSelection(input: EditBufferLike, start: number, end: number, ctx: PromptContext) {
    setSelectionColors(input, start, end, ctx.api.theme.current.warning, ctx.api.theme.current.background)
}

function setYankSelection(input: EditBufferLike, start: number, end: number, ctx: PromptContext) {
    setSelectionColors(input, start, end, ctx.api.theme.current.info, ctx.api.theme.current.background)
}

function setSelectionColors(input: EditBufferLike, start: number, end: number, background: PromptContext["api"]["theme"]["current"]["warning"], foreground: PromptContext["api"]["theme"]["current"]["background"]) {
    input.selectionBg = background
    input.selectionFg = foreground

    if (input.setSelectionInclusive) {
        input.setSelectionInclusive(start, end)
        return
    }

    const exclusiveEnd = end + 1
    if (input.setSelection) {
        input.setSelection(start, exclusiveEnd)
        return
    }

    input.editorView?.setSelection?.(start, exclusiveEnd, background, foreground)
}

function clearVisualSelection(input: EditBufferLike) {
    if (input.clearSelection) {
        input.clearSelection()
        return
    }

    input.editorView?.resetSelection?.()
}

function isVisualMode(mode: VimContext["mode"]): mode is "visual" | "visual-line" {
    return mode === "visual" || mode === "visual-line"
}

function vimLineLength(text: string, line: number) {
    return text.split("\n")[line]?.length ?? 0
}

function vimOffsetFromPosition(text: string, position: CursorPosition) {
    const lines = text.split("\n")
    const line = clamp(position.line, 0, Math.max(0, lines.length - 1))
    let offset = 0
    for (let index = 0; index < line; index++) offset += lines[index].length + 1
    return offset + clamp(position.col, 0, lines[line]?.length ?? 0)
}

function hostFromVimOffset(map: PromptMap, offset: number, bias: "previous" | "next") {
    const current = clamp(offset, 0, map.vimText.length)
    if (current === map.vimText.length) return displayWidth(map.hostText)

    const host = map.vimToHost[current]
    if (host !== undefined) return charToDisplay(map.hostText, host)

    if (bias === "previous") {
        for (let previous = current - 1; previous >= 0; previous--) {
            const previousHost = map.vimToHost[previous]
            if (previousHost !== undefined) return charToDisplay(map.hostText, previousHost)
        }
    }

    for (let next = current + 1; next < map.vimToHost.length; next++) {
        const nextHost = map.vimToHost[next]
        if (nextHost !== undefined) return charToDisplay(map.hostText, nextHost)
    }
    return displayWidth(map.hostText)
}

function clampNormalCursor(input: EditBufferLike) {
    const cursor = input.visualCursor
    const offset = input.cursorOffset
    const text = input.plainText
    if (!cursor || offset === undefined || text === undefined) return
    if (cursor.visualCol === 0) return
    const dw = displayWidth(text)
    if (offset >= dw) {
        input.cursorOffset = charToDisplay(text, displayToChar(text, Math.max(0, dw - 1)))
        return
    }
    const charIdx = displayToChar(text, offset)
    if (charIdx < text.length && text[charIdx] === '\n') {
        input.cursorOffset = charToDisplay(text, displayToChar(text, Math.max(0, offset - 1)))
    }
}

function dispatchCommand(command: string, ctx: PromptContext) {
    const input = focusedInput(ctx)
    if (command === "prompt.history.previous" && input) input.cursorOffset = 0
    if (command === "prompt.history.next" && input) input.cursorOffset = input.plainText?.length ?? 0

    const result = ctx.api.keymap.dispatchCommand(command)

    // The host currently checks history-next using character length, then leaves
    // the cursor in that unit. Restore the display-width offset after dispatch.
    if (command !== "prompt.history.next" || !result.ok) return result
    const nextInput = focusedInput(ctx)
    if (nextInput?.plainText !== undefined) nextInput.cursorOffset = displayWidth(nextInput.plainText)
    return result
}

function defaultHistoryCommand(key: string, text: string, historyText: string | undefined, enabled: Record<"j" | "k", boolean>) {
    if (key !== "j" && key !== "k") return
    if (!enabled[key]) return
    if (text.length > 0 && text !== historyText) return
    return key === "k" ? "prompt.history.previous" : "prompt.history.next"
}

function hasNormalKeyPrefix(config: VimConfig, key: string) {
    for (const sequence of Object.keys(config.keymaps.normal ?? {})) {
        try {
            if (keyToken(parseKeySequence(sequence)[0] ?? "") === key) return true
        } catch {}
    }
    return false
}

function endMotionOffset(text: string, offset: number, count: number) {
    let index = offset
    for (let step = 0; step < count; step++) {
        index++
        while (index < text.length && isWhitespace(text[index])) index++
        const kind = wordKind(text[index])
        if (!kind) return Math.max(0, text.length - 1)
        while (wordKind(text[index + 1]) === kind) index++
    }
    return clamp(index, 0, Math.max(0, text.length - 1))
}

function isWhitespace(value: string | undefined) {
    return value === " " || value === "\t" || value === "\n"
}

function wordKind(value: string | undefined) {
    if (!value || isWhitespace(value)) return undefined
    return /\w/.test(value) ? "word" : "punctuation"
}

function createKeybinds(config: VimConfig, log: VimLog): KeybindMap | undefined {
    const map = createKeybindMap()
    let count = 0

    for (const [mode, keymaps] of Object.entries(config.keymaps) as Array<[VimeeMode, Record<string, string> | undefined]>) {
        if (!keymaps) continue
        for (const [keys, action] of Object.entries(keymaps)) {
            try {
                const tokens = parseKeySequence(keys)
                if (tokens.length > 1 && tokens[0] === "<CR>") throw new Error("<CR> cannot start a multi-key mapping")
                map.addKeybind(mode, keys as ValidKeySequence<typeof keys>, keybindAction(action))
                count++
            } catch (error) {
                log("vimee.keymap.invalid", { mode, keys, action, error: error instanceof Error ? error.message : String(error) })
            }
        }
    }

    return count > 0 ? map : undefined
}

function keybindAction(action: string): HostKeybindDefinition {
    if (action.startsWith("command:")) {
        const command = action.slice(8).trim()
        if (!command) throw new Error("Command name is required")
        return {
            execute: () => [{ type: "command", command } as unknown as VimeeAction],
            hostAction: "command",
            command,
        }
    }
    switch (action) {
        case "normal":
            return { keys: "<Esc>", hostAction: "normal" }
        case "insert":
            return { keys: "i" }
        case "submit":
            return { execute: () => [{ type: "submit" } as unknown as VimeeAction], hostAction: "submit" }
        default:
            return { keys: action }
    }
}

function keyForVimee(event: KeyEvent, key: string) {
    if (key === "<C-[>") return "Escape"
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
    state.setMode(mode === "insert" || mode === "visual" || mode === "visual-line" ? mode : "normal")
}

function pendingDisplay(ctx: VimContext, keybindPending: boolean) {
    const count = ctx.count > 0 ? String(ctx.count) : ""
    if (ctx.phase === "operator-pending") return count + (ctx.operator ?? "")
    if (ctx.phase === "text-object-pending") return count + (ctx.operator ?? "") + (ctx.textObjectModifier ?? "")
    if (ctx.phase === "char-pending") return count + (ctx.operator ?? "") + (ctx.charCommand ?? "")
    if (keybindPending) return ctx.statusMessage
    return count
}

function plainPending(value: string) {
    return value.includes("<") || value.includes(">") ? "" : value
}

function consumesKey(key: string, actions: HostAction[], ctx: VimContext, keybindPending: boolean) {
    if (actions.length > 0) return true
    if (keybindPending) return true
    if (ctx.phase !== "idle") return true
    return ctx.mode !== "insert" || key === "Escape"
}

function textObjectAlias(key: string, ctx: VimContext) {
    if (ctx.phase !== "text-object-pending") return undefined
    if (key === "b") return "("
    if (key === "B") return "{"
    return undefined
}

function textObjectOperator(operator: Operator): operator is "y" | "d" | "c" {
    return operator === "y" || operator === "d" || operator === "c"
}

function resolvePromptTextObject(modifier: "i" | "a", key: string, cursor: CursorPosition, buffer: TextBuffer): MotionRange | null {
    if (key === "q") return quoteRange(modifier, cursor, buffer)
    if (key !== "p") return null
    return paragraphRange(modifier, cursor, buffer)
}

function quoteRange(modifier: "i" | "a", cursor: CursorPosition, buffer: TextBuffer): MotionRange | null {
    const pair = quoteObjectPair(cursor, buffer)
    if (!pair) return null
    const start = modifier === "i" ? pair.open + 1 : pair.open
    const end = modifier === "i" ? pair.close - 1 : pair.close
    return {
        start: { line: cursor.line, col: start },
        end: { line: cursor.line, col: Math.max(start, end) },
        linewise: false,
        inclusive: end >= start,
    }
}

function paragraphRange(modifier: "i" | "a", cursor: CursorPosition, buffer: TextBuffer): MotionRange | null {
    const count = buffer.getLineCount()
    if (count === 0) return null

    let start = clamp(cursor.line, 0, count - 1)
    while (start < count && blankLine(buffer.getLine(start))) start++
    if (start >= count) {
        start = clamp(cursor.line, 0, count - 1)
        while (start >= 0 && blankLine(buffer.getLine(start))) start--
    }
    if (start < 0 || start >= count) return null

    let end = start
    while (start > 0 && !blankLine(buffer.getLine(start - 1))) start--
    while (end < count - 1 && !blankLine(buffer.getLine(end + 1))) end++

    if (modifier === "a") {
        if (end < count - 1 && blankLine(buffer.getLine(end + 1))) {
            end++
            while (end < count - 1 && blankLine(buffer.getLine(end + 1))) end++
        } else {
            while (start > 0 && blankLine(buffer.getLine(start - 1))) start--
        }
    }

    return {
        start: { line: start, col: 0 },
        end: { line: end, col: Math.max(0, buffer.getLineLength(end) - 1) },
        linewise: true,
        inclusive: true,
    }
}

function quoteObjectPair(cursor: CursorPosition, buffer: TextBuffer) {
    let best: { open: number; close: number; distance: number } | undefined
    for (const quote of ['"', "'", "`"] as const) {
        const pair = quotePair(cursor, buffer, quote)
        if (!pair) continue
        if (!best || pair.distance < best.distance) best = pair
    }
    return best
}

function quotePair(cursor: CursorPosition, buffer: TextBuffer, quote: string) {
    const line = buffer.getLine(cursor.line)
    let open = -1
    let close = -1
    let inQuote = false
    let quoteStart = -1

    for (let index = 0; index < line.length; index++) {
        if (line[index] !== quote || escaped(line, index)) continue
        if (!inQuote) {
            quoteStart = index
            inQuote = true
            continue
        }
        if (cursor.col >= quoteStart && cursor.col <= index) {
            return { open: quoteStart, close: index, distance: 0 }
        }
        inQuote = false
    }

    for (let index = cursor.col; index < line.length; index++) {
        if (line[index] !== quote || escaped(line, index)) continue
        if (open === -1) open = index
        else {
            close = index
            break
        }
    }
    if (open !== -1 && close !== -1) return { open, close, distance: open - cursor.col }

    close = -1
    open = -1
    for (let index = cursor.col; index >= 0; index--) {
        if (line[index] !== quote || escaped(line, index)) continue
        if (close === -1) close = index
        else {
            open = index
            break
        }
    }
    if (open !== -1 && close !== -1) return { open, close, distance: cursor.col - close }
    return undefined
}

function executeTextObject(operator: Operator, range: MotionRange, buffer: TextBuffer, ctx: VimContext) {
    if (operator !== "y") buffer.saveUndoPoint(ctx.cursor)
    const result = range.linewise ? executeLinewiseTextObject(operator, range, buffer) : executeCharwiseTextObject(operator, range, buffer)
    const registers = ctx.selectedRegister ? { ...ctx.registers, [ctx.selectedRegister]: result.yankedText } : ctx.registers
    const context = {
        ...resetContext(ctx),
        mode: result.mode,
        cursor: result.cursor,
        register: result.yankedText,
        registers,
        statusMessage: result.statusMessage,
    }
    const actions: VimeeAction[] = [{ type: "yank", text: result.yankedText }, ...result.actions, { type: "mode-change", mode: result.mode }, { type: "cursor-move", position: result.cursor }]
    return { actions, context, yankedText: result.yankedText }
}

function executeLinewiseTextObject(operator: Operator, range: MotionRange, buffer: TextBuffer) {
    const startLine = Math.min(range.start.line, range.end.line)
    const endLine = Math.max(range.start.line, range.end.line)
    const lineCount = endLine - startLine + 1
    const yankedText = buffer.getLines().slice(startLine, endLine + 1).join("\n") + "\n"
    if (operator === "y") {
        return { actions: [] as VimeeAction[], cursor: { line: startLine, col: 0 }, mode: "normal" as VimeeMode, yankedText, statusMessage: lineCount >= 2 ? `${lineCount} lines yanked` : "" }
    }

    buffer.deleteLines(startLine, lineCount)
    if (operator === "c") buffer.insertLine(startLine, "")
    else if (buffer.getLineCount() === 0) buffer.insertLine(0, "")
    const line = Math.min(startLine, buffer.getLineCount() - 1)
    return {
        actions: [{ type: "content-change", content: buffer.getContent() }] as VimeeAction[],
        cursor: { line, col: 0 },
        mode: (operator === "c" ? "insert" : "normal") as VimeeMode,
        yankedText,
        statusMessage: lineCount >= 2 ? `${lineCount} fewer lines` : "",
    }
}

function executeCharwiseTextObject(operator: Operator, range: MotionRange, buffer: TextBuffer) {
    const ordered = orderedRange(range)
    const endCol = range.inclusive ? ordered.end.col + 1 : ordered.end.col
    const yankedText = textInRange(buffer, ordered.start, { line: ordered.end.line, col: endCol })
    if (operator === "y") {
        return { actions: [] as VimeeAction[], cursor: ordered.start, mode: "normal" as VimeeMode, yankedText, statusMessage: yankedText.split("\n").length >= 2 ? `${yankedText.split("\n").length} lines yanked` : "" }
    }

    const linesBefore = buffer.getLineCount()
    buffer.deleteRange(ordered.start.line, ordered.start.col, ordered.end.line, endCol)
    const linesRemoved = linesBefore - buffer.getLineCount()
    return {
        actions: [{ type: "content-change", content: buffer.getContent() }] as VimeeAction[],
        cursor: { line: ordered.start.line, col: operator === "c" ? ordered.start.col : Math.min(ordered.start.col, Math.max(0, buffer.getLineLength(ordered.start.line) - 1)) },
        mode: (operator === "c" ? "insert" : "normal") as VimeeMode,
        yankedText,
        statusMessage: linesRemoved >= 2 ? `${linesRemoved} fewer lines` : "",
    }
}

function orderedRange(range: MotionRange) {
    if (range.start.line > range.end.line || (range.start.line === range.end.line && range.start.col > range.end.col)) {
        return { start: range.end, end: range.start }
    }
    return { start: range.start, end: range.end }
}

function textInRange(buffer: TextBuffer, start: CursorPosition, end: CursorPosition) {
    if (start.line === end.line) return buffer.getLine(start.line).slice(start.col, end.col)
    const lines = [buffer.getLine(start.line).slice(start.col)]
    for (let line = start.line + 1; line < end.line; line++) lines.push(buffer.getLine(line))
    lines.push(buffer.getLine(end.line).slice(0, end.col))
    return lines.join("\n")
}

function blankLine(line: string) {
    return line.trim().length === 0
}

function escaped(line: string, index: number) {
    let slashCount = 0
    for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor--) slashCount++
    return slashCount % 2 === 1
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value))
}
