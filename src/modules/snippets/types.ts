export type SnippetSource = "global" | "project"

export type SnippetInfo = {
    name: string
    content: string
    aliases: string[]
    description?: string
    filePath: string
    source: SnippetSource
}

export type SkillInfo = {
    name: string
    content: string
    description?: string
    filePath: string
    source: SnippetSource
}

export type AutocompleteItem =
    | {
          kind: "snippet"
          id: string
          label: string
          description: string
          aliases: string[]
          snippet: SnippetInfo
      }
    | {
          kind: "skill"
          id: string
          label: string
          description: string
          aliases: string[]
          skill: SkillInfo
      }

export type HashtagTriggerMatch = {
    start: number
    end: number
    query: string
    token: string
}

export type SnippetController = {
    accept?: () => boolean
    reload?: () => void
    insertTrigger?: () => void
}
