import type { SkillInfo, SnippetInfo } from "./types"

export type HighlightPart = {
    text: string
    match: boolean
}

function normalizeSearchText(input: string) {
    return input.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function scoreText(input: string, query: string) {
    const raw = input.toLowerCase()
    const compact = normalizeSearchText(input)
    const needle = query.toLowerCase().trim()
    const compactNeedle = normalizeSearchText(query)

    if (raw === needle) return 0
    if (compactNeedle && compact === compactNeedle) return 1
    if (raw.startsWith(needle)) return 2
    if (compactNeedle && compact.startsWith(compactNeedle)) return 3
    if (raw.includes(needle)) return 4
    if (compactNeedle && compact.includes(compactNeedle)) return 5
    return Number.POSITIVE_INFINITY
}

function snippetDescription(snippet: SnippetInfo) {
    return (snippet.description || snippet.content).replace(/\s+/g, " ").trim()
}

function scoreSnippet(snippet: SnippetInfo, query: string) {
    if (!query) return 0

    const nameScore = Math.min(scoreText(snippet.name, query), ...snippet.aliases.map((alias) => scoreText(alias, query)))
    if (Number.isFinite(nameScore)) return nameScore

    const description = (snippet.description || "").replace(/\s+/g, " ").trim().toLowerCase()
    const lowerQuery = query.toLowerCase()
    if (description.startsWith(lowerQuery)) return 6
    if (description.includes(lowerQuery)) return 7
    return Number.POSITIVE_INFINITY
}

function sourceRank(snippet: SnippetInfo) {
    return snippet.source === "project" ? 0 : 1
}

export function filterSnippets(snippets: SnippetInfo[], query: string) {
    const needle = query.trim()
    return snippets
        .map((snippet) => ({ snippet, score: scoreSnippet(snippet, needle) }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((left, right) => left.score - right.score || sourceRank(left.snippet) - sourceRank(right.snippet) || left.snippet.name.localeCompare(right.snippet.name))
        .map((entry) => entry.snippet)
}

export function matchedAliases(snippet: SnippetInfo, query: string) {
    const needle = query.trim()
    if (!needle) return []
    return snippet.aliases.filter((alias) => Number.isFinite(scoreText(alias, needle)))
}

export function describeSnippet(snippet: SnippetInfo) {
    return snippetDescription(snippet)
}

export function highlightMatches(input: string, query: string): HighlightPart[] {
    const needle = query.trim().toLowerCase()
    if (!needle) return [{ text: input, match: false }]

    const lower = input.toLowerCase()
    const parts: HighlightPart[] = []
    let cursor = 0

    while (cursor < input.length) {
        const index = lower.indexOf(needle, cursor)
        if (index < 0) break
        if (index > cursor) parts.push({ text: input.slice(cursor, index), match: false })
        parts.push({ text: input.slice(index, index + needle.length), match: true })
        cursor = index + needle.length
    }

    if (parts.length === 0) return [{ text: input, match: false }]
    if (cursor < input.length) parts.push({ text: input.slice(cursor), match: false })
    return parts
}

function skillTag(skill: SkillInfo) {
    return `skill(${skill.name})`
}

function scoreSkill(skill: SkillInfo, query: string) {
    if (!query) return 0
    const nameScore = Math.min(scoreText(skill.name, query), scoreText(skillTag(skill), query))
    if (Number.isFinite(nameScore)) return nameScore
    const description = (skill.description || "").replace(/\s+/g, " ").trim().toLowerCase()
    const lowerQuery = query.toLowerCase()
    if (description.startsWith(lowerQuery)) return 6
    if (description.includes(lowerQuery)) return 7
    return Number.POSITIVE_INFINITY
}

function skillSourceRank(skill: SkillInfo) {
    return skill.source === "project" ? 0 : 1
}

export function filterSkills(skills: SkillInfo[], query: string) {
    const needle = query.trim()
    return skills
        .map((skill) => ({ skill, score: scoreSkill(skill, needle) }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((left, right) => left.score - right.score || skillSourceRank(left.skill) - skillSourceRank(right.skill) || left.skill.name.localeCompare(right.skill.name))
        .map((entry) => entry.skill)
}

export function describeSkill(skill: SkillInfo) {
    return (skill.description || skill.content).replace(/\s+/g, " ").trim()
}
