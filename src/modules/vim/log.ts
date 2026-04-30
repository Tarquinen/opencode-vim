import { appendFile, mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import type { VimConfig } from "./config"

export type VimLog = (event: string, data?: Record<string, unknown>) => void

export function createVimLog(config: VimConfig): VimLog {
    if (!config.debug) return () => {}

    const path = config.debugPath ?? defaultPath()
    void append(path, `\n--- vim-prompt debug ${new Date().toISOString()} ---\n`)

    return (event, data) => {
        const suffix = data ? ` ${safeJson(data)}` : ""
        void append(path, `${new Date().toISOString()} ${event}${suffix}\n`)
    }
}

function defaultPath() {
    const home = process.env.HOME
    return home ? join(home, ".cache/opencode/vim-prompt.log") : "/tmp/vim-prompt.log"
}

async function append(path: string, text: string) {
    try {
        await mkdir(dirname(path), { recursive: true })
        await appendFile(path, text)
    } catch {}
}

function safeJson(data: Record<string, unknown>) {
    try {
        return JSON.stringify(data)
    } catch {
        return "{}"
    }
}
