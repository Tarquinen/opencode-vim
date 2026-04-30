import type { VimAction, VimMode } from "./state"

export type VimKeymaps = Partial<Record<VimMode, Record<string, VimAction>>>

export type VimConfig = {
    defaultMode: VimMode
    timeoutlen: number
    debug: boolean
    debugPath?: string
    keymaps: Record<VimMode, Record<string, VimAction>>
}

export type VimOptions = {
    defaultMode?: VimMode
    timeoutlen?: number
    debug?: boolean
    debugPath?: string
    keymaps?: VimKeymaps
}

const DEFAULT_KEYMAPS: Record<VimMode, Record<string, VimAction>> = {
    insert: {
        "<Esc>": "normal",
        "<C-[>": "normal",
    },
    normal: {
        i: "insert",
        a: "append",
        A: "appendEnd",
        h: "left",
        j: "down",
        k: "up",
        l: "right",
        "0": "lineStart",
        $: "lineEnd",
        w: "wordNext",
        b: "wordPrev",
        x: "deleteChar",
        dd: "clear",
        D: "clear",
        C: "clearInsert",
        cc: "clearInsert",
        "<CR>": "submit",
    },
}

export function createVimConfig(options: unknown): VimConfig {
    const input = readOptions(options)
    return {
        defaultMode: input.defaultMode ?? "insert",
        timeoutlen: Math.max(0, input.timeoutlen ?? 300),
        debug: input.debug ?? process.env.VIM_PROMPT_DEBUG === "1",
        debugPath: input.debugPath,
        keymaps: {
            insert: { ...DEFAULT_KEYMAPS.insert, ...input.keymaps?.insert },
            normal: { ...DEFAULT_KEYMAPS.normal, ...input.keymaps?.normal },
        },
    }
}

function readOptions(options: unknown): VimOptions {
    if (!options || typeof options !== "object") return {}
    const raw = "vim" in options ? (options as { vim?: unknown }).vim : options
    if (!raw || typeof raw !== "object") return {}

    const source = raw as Record<string, unknown>
    return {
        defaultMode: isMode(source.defaultMode) ? source.defaultMode : undefined,
        timeoutlen: typeof source.timeoutlen === "number" ? source.timeoutlen : undefined,
        debug: typeof source.debug === "boolean" ? source.debug : undefined,
        debugPath: typeof source.debugPath === "string" ? source.debugPath : undefined,
        keymaps: readKeymaps(source.keymaps),
    }
}

function readKeymaps(input: unknown): VimKeymaps | undefined {
    if (!input || typeof input !== "object") return undefined
    const keymaps: VimKeymaps = {}
    const source = input as Record<string, unknown>

    for (const mode of ["insert", "normal"] as const) {
        const raw = source[mode]
        if (!raw || typeof raw !== "object") continue
        keymaps[mode] = {}
        for (const [key, action] of Object.entries(raw as Record<string, unknown>)) {
            if (isAction(action)) keymaps[mode][key] = action
        }
    }

    return keymaps
}

function isMode(value: unknown): value is VimMode {
    return value === "insert" || value === "normal"
}

function isAction(value: unknown): value is VimAction {
    return (
        value === "normal" ||
        value === "insert" ||
        value === "append" ||
        value === "appendEnd" ||
        value === "left" ||
        value === "right" ||
        value === "up" ||
        value === "down" ||
        value === "lineStart" ||
        value === "lineEnd" ||
        value === "wordNext" ||
        value === "wordPrev" ||
        value === "deleteChar" ||
        value === "clear" ||
        value === "clearInsert" ||
        value === "submit"
    )
}
