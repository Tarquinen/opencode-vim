import { dirname, join } from "node:path"
import { mkdir, writeFile } from "node:fs/promises"

const SCOPE_GLOBAL = "__global__"

export async function addPendingDraft(workspaceDir: string | undefined, name: string) {
    const filePath = statePath("pending-drafts.json")
    const state = await readState(filePath)
    const scope = workspaceDir || SCOPE_GLOBAL
    const current = Array.isArray(state[scope]) ? state[scope].filter((item): item is string => typeof item === "string") : []
    const next = new Set([...current, name.toLowerCase()])
    state[scope] = [...next].sort()
    await writeState(filePath, state)
}

export async function markSnippetReloadRequested(workspaceDir?: string) {
    const filePath = statePath("snippet-reload.json")
    const state = await readState(filePath)
    state[workspaceDir || SCOPE_GLOBAL] = Date.now()
    await writeState(filePath, state)
}

function statePath(name: string) {
    const home = process.env.HOME
    if (!home) throw new Error("HOME is not set")
    return join(home, ".config/opencode/state", name)
}

async function readState(filePath: string) {
    try {
        const parsed = JSON.parse(await Bun.file(filePath).text())
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>
    } catch {}
    return {} as Record<string, unknown>
}

async function writeState(filePath: string, state: Record<string, unknown>) {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`)
}
