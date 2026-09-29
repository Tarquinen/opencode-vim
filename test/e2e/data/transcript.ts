import type { Message } from "../support/fixture"

export const readerMessages: Message[] = [
    { id: "msg_e2e_reader", type: "user", text: "one two\nsecond line", time: { created: 1 } },
]

export function transcriptMessages(running = false): Message[] {
    const model = { providerID: "test", id: "fixture" }
    const messages: Message[] = [
        { id: "msg_e2e_001", type: "user", text: "Inspect the fixture files", time: { created: 1 } },
    ]
    for (const [index, file] of ["first.ts", "second.ts"].entries()) {
        messages.push({
            id: `msg_e2e_00${index + 2}`,
            type: "assistant", agent: "build", model,
            time: { created: index + 2, completed: index + 3 },
            content: [
                ...(index === 0 ? [
                    { type: "reasoning" as const, text: "Check measurements", time: { created: 2, completed: 3 } },
                    { type: "reasoning" as const, text: "Check the cursor", time: { created: 3, completed: 4 } },
                ] : []),
                {
                    type: "tool", id: `read-${index}`, name: "read",
                    time: running ? { created: 4 } : { created: 4, completed: 5 },
                    state: running
                        ? { status: "running", input: { path: file }, metadata: {} }
                        : { status: "completed", input: { path: file }, content: [{ type: "text", text: `Contents of ${file}` }] },
                },
                ...(index === 1 && !running ? [{ type: "text" as const, text: "Fixture inspection complete" }] : []),
            ],
        })
    }
    return messages
}

export function historyMessages(): Message[] {
    const messages: Message[] = []
    for (let index = 0; index < 240; index++) {
        const number = String(index).padStart(3, "0")
        messages.push({ id: `msg_history_${number}`, type: "user", text: `History entry ${number}`, time: { created: index + 1 } })
    }
    return messages
}
