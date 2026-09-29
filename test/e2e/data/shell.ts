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

export async function backgroundShellMessages(api: FixtureAPI): Promise<Message[]> {
    const messages = await shellMessages(api)
    const shell = messages.find((message) => message.type === "shell")!
    messages.push({
        id: "msg_shell_hidden", type: "synthetic", text: "Hidden fixture context", time: { created: 5 }, metadata: { source: "fixture" },
    }, {
        id: "msg_shell_4", type: "synthetic", description: shell.command, time: { created: 6 },
        metadata: { source: "shell", shellID: shell.shellID, jobID: "background-job", state: "completed", exit: 7 },
        text: `<shell id="background-job" state="completed" command="${shell.command}">\nSaved completion preview\n</shell>`,
    }, {
        id: "msg_shell_5", type: "assistant", agent: "build", model: { providerID: "test", id: "fixture" },
        time: { created: 7, completed: 8 }, finish: "stop", content: [{ type: "text", text: "Background response recorded" }],
    })
    for (const [index, state] of ["error", "cancelled"].entries()) {
        const command = state === "error" ? "printf failed-command" : "printf cancelled-command;\n" + "printf 'long command'; ".repeat(12)
        const output = state === "error" ? "Saved failure output" : "Saved cancelled output"
        messages.push({ id: `msg_shell_${6 + index}`, type: "synthetic", description: command, time: { created: 9 + index },
            metadata: { source: "shell", shellID: `sh_expired_${state}`, state },
            text: `<shell id="sh_expired_${state}" state="${state}" command="${command}">\n${output}\n</shell>` })
    }
    return messages
}
