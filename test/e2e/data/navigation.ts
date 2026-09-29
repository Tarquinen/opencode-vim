import type { Message } from "../fixture"

function user(id: string, text: string, created: number): Message {
    return { id, type: "user", text, time: { created } }
}

function assistant(id: string, content: Extract<Message, { type: "assistant" }>["content"], created: number): Message {
    return { id, type: "assistant", agent: "build", model: { providerID: "test", id: "fixture" }, content,
        time: { created, completed: created + 1 } }
}

export const layoutMessages: Message[] = [
    user("msg_old", Array.from({ length: 40 }, (_, i) => `Earlier line ${i}`).join("\n"), 1),
    assistant("msg_parts", [{ type: "text", text: "First part\nFirst end" }, { type: "text", text: "Second part\nSecond end" }], 2),
    user("msg_question", "Latest question", 4),
    assistant("msg_latest", [{ type: "text", text: "Latest reply\nLatest middle\nLatest end" }], 5),
]

export const partialMessages: Message[] = [
    user("msg_question", "Question", 1),
    assistant("msg_partial", [{ type: "text", text: Array.from({ length: 80 }, (_, i) => `Reply line ${i} 中 👍🏽 é`).join("\n") }], 2),
]

export const partMessages: Message[] = [
    user("msg_question", "Inspect individual parts", 1),
    assistant("msg_parts", [
        { type: "text", text: "Start" },
        { type: "reasoning", text: "Check something", time: { created: 2, completed: 3 } },
        { type: "tool", id: "part-shell", name: "shell", time: { created: 3, completed: 4 }, state: {
            status: "completed", input: { command: "pwd" }, content: [{ type: "text", text: "/work" }],
        } },
        { type: "text", text: "Finished" },
    ], 2),
    assistant("msg_thinking", [{ type: "reasoning", text: "Still thinking", time: { created: 5, completed: 6 } }], 5),
]

export const copyMessages: Message[] = [
    assistant("msg_markdown", [{ type: "text", text: "# Heading\n\n```ts\nconst 中 = '👍🏽'\n```" }], 1),
    user("msg_quote", "quoted 中 👩‍💻\nsecond line", 3),
]

export const longReaderMessages: Message[] = [
    user("msg_long", Array.from({ length: 100 }, (_, i) => `Reader line ${String(i + 1).padStart(3, "0")}`).join("\n"), 1),
]
