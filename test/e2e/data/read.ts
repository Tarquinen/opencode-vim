import type { Message } from "../support/fixture"

const lines = ['const greeting = "你好 👩‍💻";', `const wrapped = "${"wrapped text ".repeat(12)}";`]
for (let number = 43; number <= 100; number++) lines.push(`const value${number} = ${number};`)
const result = ["Read file src/sample.ts, lines 41-100", ...lines.map((line, index) => `${index + 41}: ${line}`), "[Output truncated. Continue reading with offset: 101]"].join("\n")

export const readMessages: Message[] = [
    { id: "msg_read_1", type: "user", text: "Read the fixture files", time: { created: 1 } },
    { id: "msg_read_2", type: "assistant", agent: "build", model: { providerID: "test", id: "fixture" }, time: { created: 2, completed: 3 }, content: [
        { type: "tool", id: "read-code", name: "read", time: { created: 2, completed: 3 }, state: {
            status: "completed", input: { path: "src/sample.ts", offset: 41, limit: 60 },
            content: [{ type: "text", text: result }], metadata: { truncated: true },
        } },
        { type: "tool", id: "read-empty", name: "read", time: { created: 2, completed: 3 }, state: {
            status: "completed", input: { path: "empty.txt" }, content: [{ type: "text", text: "Read file empty.txt, 0 lines" }], metadata: { truncated: false },
        } },
        { type: "text", text: "Read fixtures ready" },
    ] },
]
