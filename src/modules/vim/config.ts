import type { VimMode } from "./state"

export type VimCursorStyle = {
    style: "block" | "line" | "underline" | "default"
    blinking?: boolean
}

export type VimConfig = {
    defaultMode: VimMode
    keymapTimeout: number
    pendingDisplayDelay: number
    cursorStyles: Record<VimMode, VimCursorStyle>
    debug: boolean
    debugPath?: string
    keymaps: VimKeymaps
}

export type VimOptions = {
    defaultMode?: VimMode
    keymapTimeout?: number
    pendingDisplayDelay?: number
    cursorStyles?: Partial<Record<VimMode, VimCursorStyle>>
    debug?: boolean
    debugPath?: string
    keymaps?: VimKeymaps
}

export type VimKeymaps = Partial<Record<VimMode, Record<string, VimMappedAction>>>
export type VimMappedAction = string

const DEFAULT_CURSOR_STYLES: Record<VimMode, VimCursorStyle> = {
    insert: { style: "line", blinking: true },
    normal: { style: "block", blinking: true },
    visual: { style: "block", blinking: true },
    "visual-line": { style: "block", blinking: true },
}

export function createVimConfig(options: unknown): VimConfig {
    const input = readOptions(options)
    return {
        defaultMode: input.defaultMode ?? "insert",
        keymapTimeout: Math.max(0, input.keymapTimeout ?? 500),
        pendingDisplayDelay: Math.max(0, input.pendingDisplayDelay ?? 120),
        cursorStyles: {
            insert: { ...DEFAULT_CURSOR_STYLES.insert, ...input.cursorStyles?.insert },
            normal: { ...DEFAULT_CURSOR_STYLES.normal, ...input.cursorStyles?.normal },
            visual: { ...DEFAULT_CURSOR_STYLES.visual, ...input.cursorStyles?.visual },
            "visual-line": { ...DEFAULT_CURSOR_STYLES["visual-line"], ...input.cursorStyles?.["visual-line"] },
        },
        debug: input.debug ?? process.env.VIM_PROMPT_DEBUG === "1",
        debugPath: input.debugPath,
        keymaps: input.keymaps ?? {},
    }
}

function readOptions(options: unknown): VimOptions {
    if (!options || typeof options !== "object") return {}
    const raw = "vim" in options ? (options as { vim?: unknown }).vim : options
    if (!raw || typeof raw !== "object") return {}

    const source = raw as Record<string, unknown>
    return {
        defaultMode: isMode(source.defaultMode) ? source.defaultMode : undefined,
        keymapTimeout: readNumber(source.keymapTimeout),
        pendingDisplayDelay: typeof source.pendingDisplayDelay === "number" ? source.pendingDisplayDelay : undefined,
        cursorStyles: readCursorStyles(source.cursorStyles),
        debug: typeof source.debug === "boolean" ? source.debug : undefined,
        debugPath: typeof source.debugPath === "string" ? source.debugPath : undefined,
        keymaps: readKeymaps(source.keymaps),
    }
}

function readKeymaps(input: unknown): VimKeymaps | undefined {
    if (!input || typeof input !== "object") return undefined
    const source = input as Record<string, unknown>
    const keymaps: VimKeymaps = {}

    for (const mode of ["insert", "normal", "visual", "visual-line"] as const) {
        const raw = source[mode]
        if (!raw || typeof raw !== "object") continue
        keymaps[mode] = {}
        for (const [key, action] of Object.entries(raw as Record<string, unknown>)) {
            if (isMappedAction(action)) keymaps[mode][key] = action
        }
    }

    return keymaps
}

function readCursorStyles(input: unknown): VimOptions["cursorStyles"] {
    if (!input || typeof input !== "object") return undefined
    const source = input as Record<string, unknown>
    return {
        insert: readCursorStyle(source.insert),
        normal: readCursorStyle(source.normal),
        visual: readCursorStyle(source.visual),
        "visual-line": readCursorStyle(source["visual-line"]),
    }
}

function readCursorStyle(input: unknown): VimCursorStyle | undefined {
    if (!input || typeof input !== "object") return undefined
    const source = input as Record<string, unknown>
    if (!isCursorStyle(source.style)) return undefined
    return {
        style: source.style,
        blinking: typeof source.blinking === "boolean" ? source.blinking : undefined,
    }
}

function isCursorStyle(value: unknown): value is VimCursorStyle["style"] {
    return value === "block" || value === "line" || value === "underline" || value === "default"
}

function isMode(value: unknown): value is VimMode {
    return value === "insert" || value === "normal" || value === "visual" || value === "visual-line"
}

function isMappedAction(value: unknown): value is VimMappedAction {
    return typeof value === "string" && value.length > 0
}

function readNumber(value: unknown) {
    return typeof value === "number" ? value : undefined
}
