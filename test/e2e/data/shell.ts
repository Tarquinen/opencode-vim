import assert from "node:assert/strict"
import type { FixtureAPI, Message } from "../fixture"

export async function shellMessages({ request, workspace }: FixtureAPI): Promise<Message[]> {
    const command = "printf '\\033[32mcaptured stdout\\033[0m\\n'; printf 'captured stderr\\n' >&2; exit 7"
    const shell = (await request("/api/shell", { command, cwd: workspace })).data
    const deadline = Date.now() + 10_000
    while (true) {
        const info = (await request(`/api/shell/${shell.id}`)).data
        if (info.status !== "running") { assert.equal(info.exit, 7); break }
        if (Date.now() >= deadline) throw new Error("Fixture shell did not exit")
        await Bun.sleep(50)
    }
    return [
        { id: "msg_shell_1", type: "user", text: "Inspect shell calls", time: { created: 1 } },
        {
            id: "msg_shell_2", type: "assistant", agent: "build", model: { providerID: "test", id: "fixture" }, time: { created: 2, completed: 3 },
            content: [
                { type: "tool", id: "captured", name: "shell", time: { created: 2, completed: 3 }, state: {
                    status: "completed", input: { command, workdir: workspace },
                    content: [{ type: "text", text: "Background acknowledgement, not output" }], metadata: { shellID: shell.id, status: "running" },
                } },
                { type: "tool", id: "saved", name: "shell", time: { created: 2, completed: 3 }, state: {
                    status: "completed", input: { command: "git diff -- src/readers/shell/index.tsx" }, content: [{ type: "text", text:
                        "retained shell output\ndiff --git a/shell.tsx b/shell.tsx\n--- a/shell.tsx\n+++ b/shell.tsx\n@@ -1 +1 @@\n-old layout\n+new layout",
                    }],
                    metadata: { shellID: "sh_expired_fixture", exit: 0 },
                } },
                { type: "tool", id: "other", name: "custom_shell", time: { created: 2, completed: 3 }, state: {
                    status: "completed", input: { command: "not a shell tool" }, content: [{ type: "text", text: "generic tool output" }],
                } },
                { type: "text", text: "Shell fixtures ready" },
            ],
        },
        { id: "msg_shell_3", type: "shell", shellID: shell.id, command, status: "exited", exit: 7,
            output: { output: "saved user shell preview", cursor: 24, size: 24, truncated: false }, time: { created: 4, completed: 5 } },
    ]
}
