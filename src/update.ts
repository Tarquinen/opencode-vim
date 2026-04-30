import { rm } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import type { TuiPluginMeta } from "@opencode-ai/plugin/tui"

type PackageJson = {
    name?: string
    version?: string
    dependencies?: Record<string, string>
}

type UpdateResult =
    | { updated: true; name: string; current: string; latest: string }
    | { updated: false; error: "remove_failed"; name: string; current: string; latest: string }
    | { updated: false }

export async function checkAutoUpdate(meta: TuiPluginMeta, signal: AbortSignal): Promise<UpdateResult> {
    if (meta.source !== "npm") return { updated: false }

    const packageDir = await findPackageDir()
    if (!packageDir) return { updated: false }

    const pkg = await readPackageJson(join(packageDir, "package.json"))
    if (!pkg.name || !pkg.version) return { updated: false }

    const latest = await fetchLatestVersion(pkg.name, signal)
    if (!latest || !isVersionNewer(latest, pkg.version)) return { updated: false }

    const removeDir = await updateRemoveDir(packageDir, pkg.name)
    try {
        await rm(removeDir, { recursive: true, force: true })
    } catch {
        return { updated: false, error: "remove_failed", name: pkg.name, current: pkg.version, latest }
    }

    return { updated: true, name: pkg.name, current: pkg.version, latest }
}

async function findPackageDir() {
    let dir = dirname(fileURLToPath(import.meta.url))
    for (;;) {
        const packagePath = join(dir, "package.json")
        const pkg = await readPackageJson(packagePath)
        if (pkg?.name === "opencode-vim") return dir

        const parent = dirname(dir)
        if (parent === dir) return undefined
        dir = parent
    }
}

async function updateRemoveDir(packageDir: string, name: string) {
    const nodeModulesDir = dirname(packageDir)
    if (basename(nodeModulesDir) !== "node_modules") return packageDir

    const wrapperDir = dirname(nodeModulesDir)
    const wrapperPkg = await readPackageJson(join(wrapperDir, "package.json"))
    return wrapperPkg?.dependencies?.[name] ? wrapperDir : packageDir
}

async function readPackageJson(path: string): Promise<PackageJson | undefined> {
    try {
        const file = Bun.file(path)
        if (!(await file.exists())) return undefined
        const data = await file.json()
        return data && typeof data === "object" ? (data as PackageJson) : undefined
    } catch {
        return undefined
    }
}

async function fetchLatestVersion(name: string, signal: AbortSignal) {
    try {
        const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/latest`, { signal })
        if (!response.ok) return undefined
        const data = await response.json()
        return data && typeof data === "object" && typeof data.version === "string" ? data.version : undefined
    } catch {
        return undefined
    }
}

function isVersionNewer(latest: string, current: string) {
    const next = parseVersion(latest)
    const prev = parseVersion(current)
    if (!next || !prev) return false

    for (let i = 0; i < 3; i++) {
        if (next.parts[i] !== prev.parts[i]) return next.parts[i] > prev.parts[i]
    }

    if (!next.pre.length && prev.pre.length) return true
    if (next.pre.length && !prev.pre.length) return false

    for (let i = 0; i < Math.max(next.pre.length, prev.pre.length); i++) {
        const a = next.pre[i]
        const b = prev.pre[i]
        if (a === undefined) return false
        if (b === undefined) return true
        if (a === b) continue

        const aNumber = /^\d+$/.test(a) ? Number(a) : undefined
        const bNumber = /^\d+$/.test(b) ? Number(b) : undefined
        if (aNumber !== undefined && bNumber !== undefined) return aNumber > bNumber
        if (aNumber !== undefined) return false
        if (bNumber !== undefined) return true
        return a > b
    }

    return false
}

function parseVersion(version: string) {
    const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.+)?$/)
    if (!match) return undefined
    return {
        parts: [Number(match[1]), Number(match[2]), Number(match[3])],
        pre: match[4]?.split(".") ?? [],
    }
}
