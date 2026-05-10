import type { HashtagTriggerMatch, SnippetInfo } from "./types"

export function findTrailingHashtagTrigger(input: string): HashtagTriggerMatch | undefined {
    let start = -1
    for (let i = input.length - 1; i >= 0; i--) {
        const char = input[i]
        if (char === "#") {
            start = i
            break
        }
        if (/\s/.test(char)) return undefined
    }

    if (start < 0) return undefined
    if (start > 0 && !/\s/.test(input[start - 1])) return undefined

    const query = input.slice(start + 1)
    const token = `#${query}`

    return {
        start,
        end: input.length,
        query,
        token,
    }
}

export function replaceTrailingHashtag(input: string, name: string) {
    const match = findTrailingHashtagTrigger(input)
    if (!match) return input
    return `${input.slice(0, match.start)}#${name} `
}

export function insertSnippetTag(input: string, name: string) {
    const match = findTrailingHashtagTrigger(input)
    if (match) return replaceTrailingHashtag(input, name)
    const separator = input.length === 0 || /\s$/.test(input) ? "" : " "
    return `${input}${separator}#${name} `
}

export function insertSkillLoad(input: string, name: string) {
    const tag = `skill(${name})`
    const match = findTrailingHashtagTrigger(input)
    if (match) return replaceTrailingHashtag(input, tag)
    const separator = input.length === 0 || /\s$/.test(input) ? "" : " "
    return `${input}${separator}#${tag} `
}

export function preferredSnippetTag(input: string, snippet: SnippetInfo) {
    const query = findTrailingHashtagTrigger(input)?.query
    if (query && snippet.aliases.some((alias) => alias === query)) return query
    return snippet.name
}

export function insertSnippetTrigger(input: string) {
    if (findTrailingHashtagTrigger(input)) return input
    const separator = input.length === 0 || /\s$/.test(input) ? "" : " "
    return `${input}${separator}#`
}

export function isReloadCommand(input: string) {
    return input.trim() === "/snippets:reload"
}

export function stepSelection(current: number, total: number, delta: number) {
    if (total <= 0) return 0
    return Math.max(0, Math.min(total - 1, current + delta))
}
