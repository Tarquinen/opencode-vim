import type { HashtagTriggerMatch, SnippetInfo } from "./types"

const HASHTAG_TRIGGER = /(^|\s)#([^\s#]*)$/

export function findTrailingHashtagTrigger(input: string): HashtagTriggerMatch | undefined {
    const match = HASHTAG_TRIGGER.exec(input)
    if (!match) return undefined

    const query = match[2] ?? ""
    const token = `#${query}`

    return {
        start: input.length - token.length,
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
