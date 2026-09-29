import type { Message } from "../fixture"

export const permissionMessages: Message[] = [
    { id: "msg_permission_1", type: "user", text: "Check blocked and ordinary tools", time: { created: 1 } },
    { id: "msg_permission_2", type: "assistant", agent: "build", model: { providerID: "test", id: "fixture" }, time: { created: 2, completed: 3 }, content: [
        { type: "tool", id: "blocked", name: "read", time: { created: 2 }, state: {
            status: "running", input: { path: "blocked.ts" }, metadata: {},
        } },
        { type: "tool", id: "ordinary", name: "read", time: { created: 2, completed: 3 }, state: {
            status: "completed", input: { path: "ordinary.ts" }, content: [{ type: "text", text: "Read file ordinary.ts, lines 1-1\n1: ordinary-output" }],
        } },
    ] },
]
