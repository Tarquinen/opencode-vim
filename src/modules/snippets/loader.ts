import { basename, join } from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import type { SnippetInfo, SnippetSource } from "./types"

const SNIPPET_EXT = ".md"
const EMPTY_SNIPPET = `---
description: ""
---

`

export async function loadSnippets(projectDir?: string) {
    const registry = new Map<string, SnippetInfo>()
    const home = process.env.HOME

    if (home) {
        await loadDir(registry, join(home, ".config/opencode/snippets"), "global")
        await loadDir(registry, join(home, ".config/opencode/snippet"), "global")
    }

    if (projectDir) {
        await loadDir(registry, join(projectDir, ".opencode/snippets"), "project")
        await loadDir(registry, join(projectDir, ".opencode/snippet"), "project")
    }

    return listSnippets(registry).sort((left, right) => sourceRank(left) - sourceRank(right) || left.name.localeCompare(right.name))
}

async function loadDir(registry: Map<string, SnippetInfo>, dir: string, source: SnippetSource) {
    let entries: string[]
    try {
        entries = await Array.fromAsync(new Bun.Glob(`*${SNIPPET_EXT}`).scan({ cwd: dir, onlyFiles: true }))
    } catch {
        return
    }

    for (const entry of entries) {
        const snippet = await loadFile(join(dir, entry), source)
        if (snippet) registerSnippet(registry, snippet)
    }
}

async function loadFile(filePath: string, source: SnippetSource) {
    let raw: string
    try {
        raw = await Bun.file(filePath).text()
    } catch {
        return undefined
    }

    const parsed = parseFrontmatter(raw)
    return {
        name: basename(filePath, SNIPPET_EXT),
        content: parsed.content.trim(),
        aliases: normalizeAliases(parsed.data.aliases ?? parsed.data.alias),
        description: typeof parsed.data.description === "string" ? parsed.data.description : undefined,
        filePath,
        source,
    } satisfies SnippetInfo
}

export async function ensureSnippetDraft(name: string, projectDir?: string) {
    const dir = await ensureSnippetsDir(projectDir)
    const filePath = join(dir, `${name}${SNIPPET_EXT}`)
    if (!(await Bun.file(filePath).exists())) await writeFile(filePath, EMPTY_SNIPPET)
    return filePath
}

async function ensureSnippetsDir(projectDir?: string) {
    const home = process.env.HOME
    const dir = projectDir ? join(projectDir, ".opencode/snippet") : home ? join(home, ".config/opencode/snippet") : undefined
    if (!dir) throw new Error("Unable to resolve snippets directory")
    await mkdir(dir, { recursive: true })
    return dir
}

export function parseFrontmatter(raw: string) {
    if (!raw.startsWith("---\n")) return { data: {} as Record<string, unknown>, content: raw }

    const end = raw.indexOf("\n---", 4)
    if (end < 0) return { data: {} as Record<string, unknown>, content: raw }

    return {
        data: parseYamlish(raw.slice(4, end)),
        content: raw.slice(end + 4).replace(/^\r?\n/, ""),
    }
}

function parseYamlish(input: string) {
    const data: Record<string, unknown> = {}
    const lines = input.split(/\r?\n/)
    let currentList: string | undefined

    for (const line of lines) {
        const listItem = /^\s*-\s*(.+)$/.exec(line)
        if (listItem && currentList) {
            const value = String(listItem[1]).trim()
            data[currentList] = [...asArray(data[currentList]), unquote(value)]
            continue
        }

        const pair = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line)
        if (!pair) continue

        currentList = undefined
        const key = pair[1]
        const value = pair[2].trim()
        if (!value) {
            data[key] = []
            currentList = key
        } else {
            data[key] = unquote(value)
        }
    }

    return data
}

export function normalizeAliases(value: unknown) {
    return asArray(value).filter((entry) => typeof entry === "string" && entry.length > 0) as string[]
}

function asArray(value: unknown) {
    return Array.isArray(value) ? value : typeof value === "string" ? [value] : []
}

export function unquote(value: string) {
    return value.replace(/^['"]|['"]$/g, "")
}

function registerSnippet(registry: Map<string, SnippetInfo>, snippet: SnippetInfo) {
    const old = registry.get(snippet.name.toLowerCase())
    if (old) {
        for (const alias of old.aliases) registry.delete(alias.toLowerCase())
    }

    registry.set(snippet.name.toLowerCase(), snippet)
    for (const alias of snippet.aliases) registry.set(alias.toLowerCase(), snippet)
}

function listSnippets(registry: Map<string, SnippetInfo>) {
    return [...new Map([...registry.values()].map((snippet) => [snippet.name, snippet])).values()]
}

function sourceRank(snippet: SnippetInfo) {
    return snippet.source === "project" ? 0 : 1
}
