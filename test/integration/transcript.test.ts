import { expect, test } from "bun:test"
import { BoxRenderable, TextRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { transcriptItems, type TranscriptSource } from "../../src/transcript-items"

for (const expanded of [false, true]) {
    test(`permission-blocked tools retain source identity in ${expanded ? "expanded" : "collapsed"} groups`, async () => {
        const screen = await createTestRenderer({ width: 80, height: 12 })
        const blocked: Extract<TranscriptSource, { type: "tool" }> = {
            type: "tool", id: "blocked", name: "shell", time: { created: 1 },
            state: { status: "running", input: { command: "blocked command" }, metadata: {} },
        }
        const ordinary: typeof blocked = {
            ...blocked, id: "ordinary",
            state: { status: "completed", input: { command: "ordinary command" }, content: [{ type: "text", text: "done" }] },
        }
        const message: Extract<TranscriptSource, { type: "assistant" }> = {
            type: "assistant", id: "msg_tools", agent: "build", model: { providerID: "test", id: "test" },
            time: { created: 1 }, content: [blocked, ordinary],
        }
        function box(parent: BoxRenderable) {
            const node = new BoxRenderable(screen.renderer, {})
            parent.add(node)
            return node
        }
        function text(parent: BoxRenderable, content: string) {
            parent.add(new TextRenderable(screen.renderer, { content }))
        }
        try {
            const row = new BoxRenderable(screen.renderer, { id: message.id })
            screen.renderer.root.add(row)
            const group = box(row)
            text(box(group), "⋯ 2 commands")
            if (expanded) text(box(box(group)), "ordinary command")
            text(box(group), "blocked command")
            await screen.renderOnce()

            const { ranges } = transcriptItems([row], [message], new Set([blocked.id]))
            expect(ranges[0].source).toBeUndefined()
            expect(ranges.find((range) => range.text === "blocked command")?.source).toBe(blocked)
            const shown = ranges.find((range) => range.text === "ordinary command")
            if (expanded) expect(shown?.source).toBe(ordinary)
            else expect(shown).toBeUndefined()

            const shell: Extract<TranscriptSource, { type: "shell" }> = {
                type: "shell", id: "msg_later", shellID: "sh_later", command: "pwd", status: "exited", time: { created: 2 },
            }
            expect(transcriptItems([row], [message, shell], new Set([blocked.id])).hasLatest).toBe(false)
        } finally {
            screen.renderer.destroy()
        }
    })
}
