import type { KeyEvent, WidthMethod } from "@opentui/core"
import {
  TextBuffer,
  createInitialContext,
  parseKeySequence,
  processKeystroke,
  resetContext,
  resolveMotion,
} from "@vimee/core"
import type { CursorPosition, KeybindDefinition, MotionRange, VimAction as VimeeAction, VimContext } from "@vimee/core"
import type { EditorInput, EditorContext } from "./editor"
import type { VimConfig } from "./config"
import type { VimLog } from "./log"
import { createNativeHistory, type NativeHistory } from "./history"
import { createGraphemeCodec } from "./graphemes"
import { createKeybinds, hasNormalKeyPrefix, insertHostAction, type HostKeybindDefinition } from "./keymaps"
import { keyForVimee, keyToken, tokenCtrl } from "./keys"
import {
  displayToChar,
  displayWidth,
  createPromptMap,
  hostCharOffset,
  hostFromVimOffset,
  hostOffset,
  hostPosition,
  vimLineLength,
  vimOffsetFromPosition,
  type PromptMap,
} from "./map"
import type { createVimState } from "./state"
import {
  executeTextObject,
  orderedRange,
  resolvePromptTextObject,
  textObjectAlias,
  textObjectOperator,
} from "./text-objects"

type VimState = ReturnType<typeof createVimState>
type HostAction = (VimeeAction & { register?: string }) | { type: "submit" } | { type: "command"; command: string }
type HostRange = { start: number; end: number }

// Vimee handles motions and operators; the native editor owns undo history.
class MotionBuffer extends TextBuffer {
  override saveUndoPoint() {}
}

export const YANK_FLASH_MS = 250

export type VimeeAdapter = ReturnType<typeof createVimeeAdapter>

type AdapterOptions = {
  readOnly?: boolean
  onYank?: (text: string) => void
  readClipboard?: () => Promise<string>
}

export function createVimeeAdapter(state: VimState, config: VimConfig, log: VimLog, options: AdapterOptions = {}) {
  const codec = createGraphemeCodec()
  let buffer = new MotionBuffer("")
  let activeMap = createPromptMap("", codec)
  let vim = createInitialContext({ line: 0, col: 0 })
  const keybinds = options.readOnly ? undefined : createKeybinds(config, log)
  let timer: ReturnType<typeof setTimeout> | undefined
  let yankTimer: ReturnType<typeof setTimeout> | undefined
  let yankFlashActive = false
  let pendingInsert = ""
  let pendingTarget: { input: EditorInput; offset: number } | undefined
  let pendingContext: EditorContext | undefined
  let nativeInsertChanged = false
  const histories = new Map<EditorInput, NativeHistory>()
  let history: NativeHistory | undefined
  let historyVersion = 0
  let historyText: string | undefined
  let activeInput: EditorInput | undefined
  let widthMethod: WidthMethod = "unicode"
  let preferredColumn: number | undefined
  let preferredScreen = false
  let generation = 0
  const defaultHistoryKeys = {
    k: !hasNormalKeyPrefix(config, "k"),
    j: !hasNormalKeyPrefix(config, "j"),
  }

  return {
    attach,
    suspend,
    setRegister(text: string) {
      vim = { ...vim, register: codec.encode(text) }
    },
    isPending: () => vim.phase !== "idle" || vim.count > 0 || !!keybinds?.isPending(),
    handle(event: KeyEvent, key: string, ctx: EditorContext): boolean | Promise<boolean> {
      const input = ctx.input()
      if (!input) return false
      attach(ctx)
      history?.begin()

      let vimeeKey = keyForVimee(event, key)
      if (!vimeeKey) return false
      if (options.readOnly && !readOnlyKey(vimeeKey, event.ctrl, vim)) {
        vim = resetContext(vim)
        state.setPending("")
        return true
      }
      vimeeKey = codec.encode(vimeeKey)

      if (state.mode() === "insert") {
        const map = mapForHostText(input.plainText)
        sync(hostPosition(map, input.cursorOffset))
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

      const text = input.plainText

      const canBrowseHistory = !options.readOnly && vim.phase === "idle" && vim.count === 0 && !keybinds?.isPending()
      const historyCommand = canBrowseHistory
        ? defaultHistoryCommand(vimeeKey, text, historyText, defaultHistoryKeys)
        : undefined
      if (historyCommand) {
        const result = dispatchCommand(historyCommand, ctx)
        historyText = result.ok ? ctx.input()?.plainText : undefined
        state.setPending("")
        updateTimeout(ctx)
        log("vimee.history", { key, command: historyCommand, handled: result.ok })
        return true
      }
      historyText = undefined

      const map = mapForHostText(text)
      const displayOff = clamp(input.cursorOffset, 0, map.displayWidth)
      const cursor = hostPosition(map, displayOff)

      const wasPending = keybinds?.isPending() ?? false
      const pendingBefore = pendingInsert
      sync(cursor)

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
      if (
        vimeeKey === "Enter" &&
        state.mode() === "normal" &&
        vim.phase === "idle" &&
        !wasPending &&
        resolved?.status !== "matched"
      ) {
        ctx.submit()
        state.setPending("")
        updateTimeout(ctx)
        log("vimee.key", { key, vimeeKey, mode: vim.mode, phase: vim.phase, cursor: vim.cursor, actions: ["submit"] })
        return true
      }

      const commandKey = vimeeKey
      const definition = resolved?.status === "matched" ? resolved.definition : undefined
      if (options.readClipboard && needsClipboard(commandKey, event.ctrl, definition)) {
        const before = generation
        return options.readClipboard().then((text) => {
          // A focus change, mouse move or external edit cancels a pending put.
          if (
            before !== generation ||
            input.isDestroyed ||
            input.plainText !== map.hostText ||
            input.cursorOffset !== displayOff
          )
            return false
          vim = { ...vim, register: codec.encode(text) }
          return finish()
        })
      }
      return finish()

      function finish() {
        let result
        if (resolved?.status === "matched") {
          const actions = applyKeybind(resolved.definition, ctx, map)
          result = { newCtx: vim, actions }
        } else {
          // Use screen-row movement for uncounted j/k and arrows in normal/visual mode.
          // Apply this at the input boundary so custom mapping sequences stay literal.
          if (
            !event.ctrl &&
            vim.phase === "idle" &&
            vim.count === 0 &&
            (commandKey === "j" || commandKey === "k" || commandKey === "ArrowDown" || commandKey === "ArrowUp")
          ) {
            vim = processKey("g").newCtx
          }
          result = processKey(commandKey, event.ctrl)
        }
        vim = result.newCtx
        const actions = result.actions as HostAction[]
        if (resolved?.status !== "matched") applyActions(actions, ctx, activeMap)
        if (shouldFlashYank) flashYank(ctx, activeMap, yankAction(actions), visualYankRange)
        syncMode(state, vim.mode)

        const keybindPending = keybinds?.isPending() ?? false
        if (wasPending && !keybindPending && pendingBefore && state.mode() === "insert")
          flushPendingInsert(ctx, pendingBefore, hostCharOffset(map, displayOff))
        pendingInsert = keybindPending && state.mode() === "insert" ? plainPending(vim.statusMessage) : ""
        state.setPending(pendingDisplay(vim, keybindPending))
        updateTimeout(ctx)
        log("vimee.key", {
          key,
          vimeeKey,
          mode: vim.mode,
          phase: vim.phase,
          cursor: vim.cursor,
          actions: actions.map((action) => action.type),
        })
        return consumesKey(commandKey, actions, vim, keybindPending)
      }
    },
    cleanup() {
      suspend()
      for (const item of histories.values()) item.cleanup()
      histories.clear()
      history = undefined
      activeInput = undefined
    },
  }

  function needsClipboard(key: string, ctrl: boolean, definition?: KeybindDefinition) {
    if (definition) {
      if ("execute" in definition) return false
      return parseKeySequence(definition.keys).some((token) => ["p", "P", ".", "@"].includes(token))
    }
    if (ctrl) return false
    if (vim.phase === "macro-execute-pending") return true
    if (vim.phase !== "idle" || vim.selectedRegister) return false
    if (key === "p" || key === "P") return true
    return key === "." && vim.lastChange.some((token) => ["p", "P", "@"].includes(token))
  }

  function attach(ctx: EditorContext) {
    const input = ctx.input()
    if (activeInput === input) return
    suspend()
    activeInput = input
    widthMethod = ctx.widthMethod
    activeMap = createPromptMap(input?.plainText ?? "", codec, widthMethod)
    buffer = new MotionBuffer(activeMap.vimText)
    for (const [editor, item] of histories) {
      if (!editor.isDestroyed) continue
      item.cleanup()
      histories.delete(editor)
    }
    history = input && !options.readOnly ? histories.get(input) : undefined
    if (input && !options.readOnly && !history) {
      history = createNativeHistory(input)
      if (history) histories.set(input, history)
    }
    historyVersion = history?.version() ?? 0
    if (state.mode() === "insert") history?.begin()
    nativeInsertChanged = false
    vim = { ...resetContext(vim), cursor: hostPosition(activeMap, input?.cursorOffset ?? 0), mode: state.mode() }
  }

  function suspend() {
    generation++
    preferredColumn = undefined
    if (pendingContext) cancelPendingInsert(pendingContext)
    history?.end()
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

  function sync(cursor: CursorPosition) {
    if (cursor.line !== vim.cursor.line || cursor.col !== vim.cursor.col) preferredColumn = undefined
    vim = { ...vim, cursor, mode: state.mode() }
  }

  function mapForHostText(text: string) {
    if (history && historyVersion !== history.version()) {
      historyVersion = history.version()
      activeMap = createPromptMap(text, codec, widthMethod)
      buffer = new MotionBuffer(activeMap.vimText)
      vim = { ...resetContext(vim), lastChange: [], pendingChange: [] }
      nativeInsertChanged = false
    }
    if (activeMap.hostText === text) return activeMap
    const nextMap = createPromptMap(text, codec, widthMethod)
    if (state.mode() === "insert") recordNativeChange(nextMap)
    activeMap = nextMap
    if (state.mode() === "insert") {
      nativeInsertChanged = true
      buffer.replaceContent(activeMap.vimText)
    } else {
      buffer = new MotionBuffer(activeMap.vimText)
      nativeInsertChanged = false
    }
    return activeMap
  }

  function recordNativeChange(nextMap: PromptMap) {
    const before = activeMap.vimText
    const after = nextMap.vimText
    const start = vimOffsetFromPosition(activeMap, vim.cursor)
    let prefix = 0
    while (prefix < start && prefix < after.length && before[prefix] === after[prefix]) prefix++
    let suffix = 0
    while (
      suffix < before.length - start &&
      suffix < after.length - prefix &&
      before[before.length - suffix - 1] === after[after.length - suffix - 1]
    )
      suffix++
    const keys = [...vim.pendingChange]
    if (!keys.length) keys.push("i")
    for (let index = prefix; index < start; index++) keys.push("Backspace")
    for (let index = start; index < before.length - suffix; index++) keys.push("Delete")
    for (const key of after.slice(prefix, after.length - suffix))
      keys.push(key === "\n" ? "Enter" : key === "\t" ? "Tab" : key)
    vim = { ...vim, pendingChange: keys }
  }

  function applyActions(actions: HostAction[], ctx: EditorContext, map: PromptMap) {
    const input = ctx.input()
    let currentMap = map
    if (!input) return
    history?.begin()

    for (const action of actions) {
      switch (action.type) {
        case "content-change":
          currentMap = createPromptMap(codec.decode(action.content), codec, widthMethod)
          activeMap = currentMap
          ctx.setText(currentMap.hostText)
          // Decoding can join neighboring graphemes; use the map's units.
          buffer.replaceContent(currentMap.vimText)
          break
        case "yank":
          if (!action.register) options.onYank?.(codec.decode(action.text))
          break
        case "mode-change":
          nativeInsertChanged = action.mode === "insert" && actions.some((item) => item.type === "content-change")
          if (action.mode === "insert") {
            cancelYankFlash()
            clearVisualSelection(input)
          }
          syncMode(state, action.mode)
          break
        case "quit":
          ctx.blur()
          break
        case "submit":
          ctx.submit()
          break
        case "command":
          dispatchCommand(action.command, ctx)
          return
      }
    }

    // The engine context already has the final cursor; move the editor once.
    setCursor(input, currentMap, vim.cursor)
    syncVisualSelection(input, currentMap, ctx)
    if (vim.mode === "insert") history?.begin()
    else history?.end()
  }

  function handleInsertKeybind(event: KeyEvent, key: string, ctx: EditorContext): boolean {
    if (!keybinds?.hasKeybinds("insert") && !keybinds?.isPending()) return false

    const wasPending = keybinds.isPending()
    const pendingBefore = pendingInsert
    const resolved = keybinds.resolve(key, "insert", event.ctrl)

    switch (resolved.status) {
      case "pending":
        if (!wasPending) {
          const input = ctx.input()
          pendingTarget = input ? { input, offset: input.cursorOffset } : undefined
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

  function applyInsertKeybind(definition: KeybindDefinition, ctx: EditorContext) {
    switch (insertHostAction(definition)) {
      case "normal":
        enterNormal(ctx)
        return true
      case "submit":
        ctx.submit()
        return true
      case "command":
        dispatchCommand((definition as HostKeybindDefinition).command!, ctx)
        return true
      default:
        return false
    }
  }

  function enterNormal(ctx: EditorContext) {
    const input = ctx.input()
    const text = input?.plainText ?? ""
    const map = mapForHostText(text)

    if (input && text.length > 0) {
      const dw = map.displayWidth
      const offset = clamp(input.cursorOffset, 0, dw)
      const charOffset = hostCharOffset(map, offset)
      if (charOffset > 0 && text[charOffset - 1] !== "\n") {
        input.cursorOffset = hostOffset(map, hostPosition(map, Math.max(0, offset - 1)))
      }
      clampNormalCursor(input, map)
    }

    const lastChange = nativeInsertChanged ? [...vim.pendingChange, "Escape"] : vim.lastChange
    vim = {
      ...resetContext(vim),
      cursor: hostPosition(map, input?.cursorOffset ?? 0),
      mode: "normal",
      statusMessage: "",
      lastChange,
      pendingChange: [],
    }
    nativeInsertChanged = false
    syncMode(state, "normal")
    history?.end()
  }

  function applyKeybind(definition: KeybindDefinition, ctx: EditorContext, map: PromptMap) {
    if ("execute" in definition) {
      const actions = definition.execute(vim, buffer) as HostAction[]
      vim = { ...vim, cursor: hostPosition(map, hostOffset(map, vim.cursor)) }
      applyActions(actions, ctx, map)
      return actions
    }

    let actions: HostAction[] = []
    for (const token of parseKeySequence(definition.keys)) {
      const result = processKey(codec.encode(keyToken(token)), tokenCtrl(token))
      vim = result.newCtx
      // Keep the host layout current for screen motions later in the mapping.
      applyActions(result.actions, ctx, activeMap)
      actions = [...actions, ...(result.actions as HostAction[])]
    }
    return actions
  }

  function processKey(key: string, ctrl = false): { newCtx: VimContext; actions: HostAction[] } {
    const register = vim.selectedRegister
    const moving =
      !ctrl &&
      vim.mode !== "insert" &&
      (vim.phase === "idle" || vim.phase === "operator-pending" || vim.phase === "g-pending")
    const vertical = moving && (key === "j" || key === "k" || key === "ArrowDown" || key === "ArrowUp")
    const lineEnd = moving && key === "$" && vim.phase === "idle"
    const result = processKeyInner(key, ctrl)
    if (register) {
      for (const action of result.actions) {
        if (action.type === "yank") action.register = register
      }
    }
    if (result.actions.some((action) => action.type === "content-change" || action.type === "mode-change"))
      preferredColumn = undefined
    else if (!vertical && result.actions.some((action) => action.type === "cursor-move"))
      preferredColumn = lineEnd ? Infinity : undefined
    return result
  }

  function processKeyInner(key: string, ctrl: boolean): { newCtx: VimContext; actions: HostAction[] } {
    if (vim.mode === "normal" && vim.phase === "idle" && ((!ctrl && key === "u") || (ctrl && key === "r"))) {
      const redo = ctrl
      let changed = false
      for (let count = vim.count || 1; count > 0; count--) {
        if (!(redo ? history?.redo() : history?.undo())) break
        changed = true
      }
      activeMap = createPromptMap(activeInput?.plainText ?? "", codec, widthMethod)
      buffer = new MotionBuffer(activeMap.vimText)
      if (activeInput) clampNormalCursor(activeInput, activeMap)
      const cursor = hostPosition(activeMap, activeInput?.cursorOffset ?? 0)
      const message = changed ? "" : redo ? "Already at newest change" : "Already at oldest change"
      return {
        newCtx: { ...resetContext(vim), cursor, pendingChange: [], statusMessage: message },
        actions: [{ type: "cursor-move", position: cursor }],
      }
    }
    let range = ctrl ? undefined : lineMotion(key)
    if (
      range &&
      vim.operator &&
      (key === "j" || key === "k" || key === "ArrowDown" || key === "ArrowUp") &&
      range.start.line === range.end.line &&
      range.start.col === range.end.col
    ) {
      return { newCtx: { ...resetContext(vim), pendingChange: [] }, actions: [] }
    }
    if (range && !vim.operator) {
      return {
        newCtx: { ...resetContext(vim), cursor: range.end },
        actions: [{ type: "cursor-move", position: range.end }],
      }
    }
    let wordRange: MotionRange | undefined
    if (
      !ctrl &&
      vim.mode !== "insert" &&
      (key === "w" || key === "W") &&
      (vim.phase === "idle" || vim.phase === "operator-pending")
    ) {
      wordRange = forwardWordRange(key, vim.cursor, buffer, vim.count || 1)
      if (vim.phase === "idle") {
        const cursor = {
          ...wordRange.end,
          col: Math.min(wordRange.end.col, Math.max(0, buffer.getLineLength(wordRange.end.line) - 1)),
        }
        return { newCtx: { ...resetContext(vim), cursor }, actions: [{ type: "cursor-move", position: cursor }] }
      }
    }
    if (key === "." && !ctrl && vim.mode === "normal" && vim.phase === "idle" && vim.lastChange.length) {
      // A repeated insert/change is one undo step, including native typing.
      const original = buffer
      const before = buffer.getContent()
      const keys = [...vim.lastChange]
      if (vim.count) {
        while (/^[0-9]$/.test(keys[0] ?? "")) keys.shift()
        keys.unshift(...String(vim.count))
      }
      vim = { ...vim, count: 0 }
      const actions: HostAction[] = []
      buffer = new MotionBuffer(before)
      try {
        for (const token of keys) {
          const result = processKey(codec.encode(keyToken(token)), tokenCtrl(token))
          vim = result.newCtx
          actions.push(...result.actions)
        }
        if (buffer.getContent() !== before) {
          original.replaceContent(buffer.getContent())
        }
      } finally {
        buffer = original
      }
      return { newCtx: { ...vim, lastChange: keys, pendingChange: [] }, actions }
    }

    const operator = vim.operator
    if (!range && !ctrl && operator && textObjectOperator(operator)) {
      if (vim.phase === "operator-pending") {
        const count = vim.count || 1
        if (key === "l" || key === "ArrowRight") {
          // Vimee 0.3 treats l as inclusive; Vim's operator motion is exclusive.
          range = {
            start: vim.cursor,
            end: {
              line: vim.cursor.line,
              col: Math.min(buffer.getLineLength(vim.cursor.line), vim.cursor.col + count),
            },
            inclusive: false,
            linewise: false,
          }
        } else if (key === operator) {
          range = {
            start: { line: vim.cursor.line, col: 0 },
            end: { line: Math.min(buffer.getLineCount() - 1, vim.cursor.line + count - 1), col: 0 },
            inclusive: true,
            linewise: true,
          }
        } else if (
          operator === "c" &&
          key === "w" &&
          /\S/.test(buffer.getLine(vim.cursor.line)[vim.cursor.col] ?? "")
        ) {
          range = resolveMotion(
            "e",
            { ...vim.cursor, col: vim.cursor.col - 1 },
            buffer,
            count,
            vim.count > 0,
            vim,
          )?.range
          if (range) range.start = vim.cursor
        } else if (wordRange) {
          range = wordRange
          if (
            operator === "d" &&
            range.end.line > range.start.line &&
            /\S/.test(buffer.getLine(range.start.line)[range.start.col] ?? "") &&
            range.end.col === Math.max(0, buffer.getLine(range.end.line).search(/\S/))
          ) {
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
      // Vim's exclusive motions ending at column zero stop before the newline.
      // Starting in the first nonblank column makes that range linewise instead.
      if (vim.phase === "g-pending" && !range.inclusive) {
        const ordered = orderedRange(range)
        if (ordered.end.line > ordered.start.line && ordered.end.col === 0) {
          const linewise = ordered.start.col <= Math.max(0, buffer.getLine(ordered.start.line).search(/\S/))
          range = {
            start: ordered.start,
            end: { line: ordered.end.line - 1, col: buffer.getLineLength(ordered.end.line - 1) },
            linewise,
            inclusive: false,
          }
        }
      }
      const keys: string[] = []
      if (vim.count) keys.push(...String(vim.count))
      for (const token of vim.pendingChange) {
        if (!/^[0-9]$/.test(token)) keys.push(token)
      }
      keys.push(key)
      const result = executeTextObject(operator, range, buffer, vim)
      if (operator === "y") result.context.pendingChange = []
      else if (result.context.mode === "insert") result.context.pendingChange = keys
      else {
        result.context.lastChange = keys
        result.context.pendingChange = []
      }
      return { newCtx: result.context, actions: result.actions }
    }

    // The engine saves undo points for yanks too. Run read-only operations
    // against a disposable buffer so they cannot alter the editing history.
    const yanking =
      operator === "y" || (isVisualMode(vim.mode) && key === "y") || (vim.mode === "normal" && key === "Y")
    const register = vim.selectedRegister ? (vim.registers[vim.selectedRegister] ?? "") : vim.register
    const emptyLinePaste =
      !ctrl &&
      vim.mode === "normal" &&
      vim.phase === "idle" &&
      (key === "p" || key === "P") &&
      buffer.getContent() === "" &&
      register.endsWith("\n")
    const result = processKeystroke(key, vim, yanking ? new TextBuffer(buffer.getContent()) : buffer, ctrl, false)
    if (emptyLinePaste) {
      // Linewise puts should fill an empty prompt, not keep its placeholder line.
      // Remove just that line, keeping the engine's undo point and repeat keys.
      buffer.deleteLines(key === "p" ? 0 : buffer.getLineCount() - 1, 1)
      result.newCtx.cursor = { line: 0, col: 0 }
      for (const action of result.actions) {
        if (action.type === "content-change") action.content = buffer.getContent()
        if (action.type === "cursor-move") action.position = result.newCtx.cursor
      }
    }
    return result
  }

  function lineMotion(key: string): MotionRange | undefined {
    if (vim.mode !== "normal" && !isVisualMode(vim.mode)) return
    const screen = vim.phase === "g-pending"
    if (!screen && vim.phase !== "idle" && vim.phase !== "operator-pending") return
    const down = key === "j" || key === "ArrowDown"
    const up = key === "k" || key === "ArrowUp"
    if (!down && !up && !(screen && (key === "0" || key === "^" || key === "$"))) return

    const map =
      buffer.getContent() === activeMap.vimText
        ? activeMap
        : createPromptMap(codec.decode(buffer.getContent()), codec, widthMethod)
    const offset = hostOffset(map, vim.cursor)
    const count = vim.count || 1
    let start: number
    let end: number
    let column: number
    if (screen) {
      const lines = activeInput?.editorView?.getLogicalLineInfo?.()
      if (!lines?.lineStartCols.length) return
      let row = 0
      while (row + 1 < lines.lineStartCols.length && lines.lineStartCols[row + 1] <= offset) row++
      column = offset - lines.lineStartCols[row]
      let delta = 0
      if (down) delta = count
      else if (up) delta = -count
      else if (key === "$") delta = count - 1
      const target = clamp(row + delta, 0, lines.lineStartCols.length - 1)
      start = lines.lineStartCols[target]
      end = start + Math.max(0, lines.lineWidthCols[target] - 1)
      if ((down || up) && target === row)
        return { start: vim.cursor, end: vim.cursor, linewise: false, inclusive: false }
    } else {
      const lineStart = hostOffset(map, { line: vim.cursor.line, col: 0 })
      column = offset - lineStart
      const line = clamp(vim.cursor.line + (down ? count : -count), 0, buffer.getLineCount() - 1)
      start = hostOffset(map, { line, col: 0 })
      end = Math.max(start, hostOffset(map, { line, col: buffer.getLineLength(line) }) - 1)
    }

    let target: number
    if (down || up) {
      if (preferredColumn === undefined || (preferredScreen !== screen && preferredColumn !== Infinity))
        preferredColumn = column
      preferredScreen = screen
      target = Math.min(start + preferredColumn, end)
    } else if (key === "$") {
      target = end
    } else {
      target = start
      if (key === "^") {
        const from = hostCharOffset(map, start)
        const to = hostCharOffset(map, end + 1)
        const first = map.hostText.slice(from, to).search(/\S/)
        if (first >= 0) target = hostFromVimOffset(map, map.hostToVim[from + first])
      }
    }
    return { start: vim.cursor, end: hostPosition(map, target), linewise: !screen, inclusive: !screen || key === "$" }
  }

  function handleTextObject(key: string, ctx: EditorContext, map: PromptMap) {
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
    if (flashRange)
      flashYank(
        ctx,
        activeMap,
        result.actions.find((action): action is YankAction => action.type === "yank"),
        flashRange,
      )
    syncMode(state, vim.mode)
    state.setPending("")
    updateTimeout(ctx)
    log("vimee.textobject", {
      key,
      mode: vim.mode,
      phase: vim.phase,
      cursor: vim.cursor,
      actions: result.actions.map((action) => action.type),
    })
    return true
  }

  function updateTimeout(ctx: EditorContext) {
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

  function cancelPendingInsert(ctx: EditorContext, offset?: number, flush = true) {
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

  function flushPendingInsert(ctx: EditorContext, value: string, charOffset?: number) {
    if (!value || state.mode() !== "insert") return
    if (pendingTarget?.input.isDestroyed) return
    if (pendingTarget?.input.insertText) {
      const { input, offset } = pendingTarget
      const cursor = input.cursorOffset
      input.clearSelection?.()
      input.cursorOffset = offset
      input.insertText!(value)
      input.cursorOffset = cursor >= offset ? cursor + displayWidth(value, widthMethod) : cursor
      return
    }
    const input = ctx.input()
    if (!input) return
    const text = input.plainText
    const currentDisplayOff = input.cursorOffset
    const currentCharOff = displayToChar(text, currentDisplayOff, widthMethod)
    const insertAtChar = charOffset ?? currentCharOff
    const next = text.slice(0, insertAtChar) + value + text.slice(insertAtChar)
    ctx.setText(next)
    const nextCharOff = currentCharOff >= insertAtChar ? currentCharOff + value.length : currentCharOff
    input.cursorOffset = displayWidth(next.slice(0, nextCharOff), widthMethod)
  }

  function setCursor(input: EditorInput, map: PromptMap, position: CursorPosition) {
    const offset = hostOffset(map, position)
    if (input.cursorOffset !== offset) input.cursorOffset = offset
    if (vim.mode !== "insert") clampNormalCursor(input, map)
  }

  function syncVisualSelection(input: EditorInput, map: PromptMap, ctx: EditorContext) {
    if (!isVisualMode(vim.mode) || !vim.visualAnchor) {
      if (!yankFlashActive) clearVisualSelection(input)
      return
    }

    cancelYankFlash()
    const range =
      vim.mode === "visual-line"
        ? visualLineRange(map, vim.visualAnchor, vim.cursor)
        : visualCharRange(map, vim.visualAnchor, vim.cursor)
    if (!range) {
      clearVisualSelection(input)
      return
    }

    setSelection(input, range.start, range.end, ctx)
  }

  function visualYankRangeFor(map: PromptMap) {
    if (!isVisualMode(vim.mode) || !vim.visualAnchor) return undefined
    return vim.mode === "visual-line"
      ? visualLineRange(map, vim.visualAnchor, vim.cursor)
      : visualCharRange(map, vim.visualAnchor, vim.cursor)
  }

  function flashYank(
    ctx: EditorContext,
    map: PromptMap,
    action: YankAction | undefined,
    visualRange: HostRange | undefined,
  ) {
    if (!action) return
    const input = ctx.input()
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

function readOnlyKey(key: string, ctrl: boolean, vim: VimContext) {
  if (key === "Escape") return true
  if (ctrl) return false
  if (vim.phase === "char-pending" || vim.phase === "text-object-pending" || vim.phase === "register-pending")
    return true
  if (vim.phase === "g-pending") return ["g", "j", "k", "0", "^", "$", "ArrowDown", "ArrowUp"].includes(key)
  if ((vim.phase === "operator-pending" || isVisualMode(vim.mode)) && (key === "i" || key === "a")) return true
  return (
    /^[0-9hjklwWbBeE$^gGfFtT;,vVy%{}()"]$/.test(key) ||
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(key)
  )
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
  const anchorOffset = hostOffset(map, anchor)
  const cursorOffset = hostOffset(map, cursor)
  return hostRange(map, anchorOffset, cursorOffset)
}

function visualLineRange(map: PromptMap, anchor: CursorPosition, cursor: CursorPosition): HostRange | undefined {
  const startLine = Math.min(anchor.line, cursor.line)
  const endLine = Math.max(anchor.line, cursor.line)
  const start = hostOffset(map, { line: startLine, col: 0 })
  const end = hostOffset(map, { line: endLine, col: vimLineLength(map, endLine) })
  return hostRange(map, start, end)
}

function yankedTextRange(map: PromptMap, cursor: CursorPosition, text: string): HostRange | undefined {
  if (!text) return undefined
  if (text.endsWith("\n")) {
    const lineCount = text.split("\n").length - 1
    return visualLineRange(map, cursor, { line: cursor.line + Math.max(0, lineCount - 1), col: 0 })
  }

  const start = vimOffsetFromPosition(map, cursor)
  return vimOffsetRange(map, start, start + text.length - 1)
}

function motionHostRange(map: PromptMap, range: MotionRange): HostRange | undefined {
  if (range.linewise) return visualLineRange(map, range.start, range.end)
  const start = vimOffsetFromPosition(map, range.start)
  const end = vimOffsetFromPosition(map, range.end)
  return vimOffsetRange(map, start, end)
}

function vimOffsetRange(map: PromptMap, left: number, right: number): HostRange | undefined {
  const start = hostFromVimOffset(map, Math.min(left, right))
  const end = hostFromVimOffset(map, Math.max(left, right))
  return hostRange(map, start, end)
}

function hostRange(map: PromptMap, left: number, right: number): HostRange | undefined {
  if (!map.hostText) return undefined
  const dw = map.displayWidth
  const start = clamp(Math.min(left, right), 0, Math.max(0, dw - 1))
  const end = clamp(Math.max(left, right), 0, Math.max(0, dw - 1))
  return { start, end }
}

type YankAction = Extract<VimeeAction, { type: "yank" }>

function yankAction(actions: HostAction[]): YankAction | undefined {
  return actions.find((action): action is YankAction => action.type === "yank")
}

function setSelection(input: EditorInput, start: number, end: number, ctx: EditorContext) {
  setSelectionColors(input, start, end, ctx.colors.selection, ctx.colors.background)
}

function setYankSelection(input: EditorInput, start: number, end: number, ctx: EditorContext) {
  setSelectionColors(input, start, end, ctx.colors.yank, ctx.colors.background)
}

function setSelectionColors(
  input: EditorInput,
  start: number,
  end: number,
  background: EditorContext["colors"]["selection"],
  foreground: EditorContext["colors"]["background"],
) {
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

function clearVisualSelection(input: EditorInput) {
  if (input.clearSelection) {
    input.clearSelection()
    return
  }

  input.editorView?.resetSelection?.()
}

function isVisualMode(mode: VimContext["mode"]): mode is "visual" | "visual-line" {
  return mode === "visual" || mode === "visual-line"
}

function clampNormalCursor(input: EditorInput, map: PromptMap) {
  const cursor = input.visualCursor
  const offset = input.cursorOffset
  const text = map.hostText
  if (!cursor) return
  if (cursor.visualCol === 0) return
  const dw = map.displayWidth
  if (offset >= dw) {
    input.cursorOffset = hostOffset(map, hostPosition(map, Math.max(0, dw - 1)))
    return
  }
  const charIdx = hostCharOffset(map, offset)
  if (charIdx < text.length && text[charIdx] === "\n") {
    input.cursorOffset = hostOffset(map, hostPosition(map, Math.max(0, offset - 1)))
  }
}

function dispatchCommand(command: string, ctx: EditorContext) {
  const input = ctx.input()
  if (command === "prompt.history.previous" && input) input.cursorOffset = 0
  if (command === "prompt.history.next" && input) input.cursorOffset = input.plainText.length

  const result = ctx.dispatchCommand(command)

  // The host currently checks history-next using character length, then leaves
  // the cursor in that unit. Restore the display-width offset after dispatch.
  if (command !== "prompt.history.next" || !result.ok) return result
  const nextInput = ctx.input()
  if (nextInput) nextInput.cursorOffset = displayWidth(nextInput.plainText, ctx.widthMethod)
  return result
}

function defaultHistoryCommand(
  key: string,
  text: string,
  historyText: string | undefined,
  enabled: Record<"j" | "k", boolean>,
) {
  if (key !== "j" && key !== "k") return
  if (!enabled[key]) return
  if (text.length > 0 && text !== historyText) return
  return key === "k" ? "prompt.history.previous" : "prompt.history.next"
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}
