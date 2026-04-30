import { dirname, join, parse } from "node:path"
import type { SkillInfo, SnippetSource } from "./types"
import { parseFrontmatter } from "./loader"

const SKILL_FILE = "SKILL.md"

export async function loadSkills(projectDir?: string) {
    const registry = new Map<string, SkillInfo>()
    const home = process.env.HOME

    if (home) {
        await loadSkillDir(registry, join(home, ".config/opencode/skill"), "global")
        await loadSkillDir(registry, join(home, ".config/opencode/skills"), "global")
        await loadSkillDir(registry, join(home, ".claude/skills"), "global")
        await loadSkillDir(registry, join(home, ".agents/skills"), "global")
    }

    for (const root of await projectRoots(projectDir)) {
        await loadSkillDir(registry, join(root, ".opencode/skill"), "project")
        await loadSkillDir(registry, join(root, ".opencode/skills"), "project")
        await loadSkillDir(registry, join(root, ".claude/skills"), "project")
        await loadSkillDir(registry, join(root, ".agents/skills"), "project")
    }

    return [...registry.values()].sort((left, right) => sourceRank(left) - sourceRank(right) || left.name.localeCompare(right.name))
}

async function projectRoots(projectDir?: string) {
    if (!projectDir) return []
    const roots: string[] = []
    let current = projectDir

    while (true) {
        roots.push(current)
        if (await Bun.file(join(current, ".git")).exists()) break
        const parent = dirname(current)
        if (parent === current) break
        current = parent
    }

    return roots.reverse()
}

async function loadSkillDir(registry: Map<string, SkillInfo>, dir: string, source: SnippetSource) {
    let entries: string[]
    try {
        entries = await Array.fromAsync(new Bun.Glob(`*/${SKILL_FILE}`).scan({ cwd: dir, onlyFiles: true }))
    } catch {
        return
    }

    for (const entry of entries) {
        const skill = await loadSkill(join(dir, entry), source)
        if (skill) registry.set(skill.name.toLowerCase(), skill)
    }
}

async function loadSkill(filePath: string, source: SnippetSource) {
    let raw: string
    try {
        raw = await Bun.file(filePath).text()
    } catch {
        return undefined
    }

    const parsed = parseFrontmatter(raw)
    const folderName = parse(dirname(filePath)).base
    const name = typeof parsed.data.name === "string" && parsed.data.name.trim() ? parsed.data.name.trim() : folderName

    return {
        name,
        content: parsed.content.trim(),
        description: typeof parsed.data.description === "string" ? parsed.data.description : undefined,
        filePath,
        source,
    } satisfies SkillInfo
}

function sourceRank(skill: SkillInfo) {
    return skill.source === "project" ? 0 : 1
}
