import { expect, test } from "bun:test"
import { BoxRenderable, TextRenderable, type Renderable } from "@opentui/core"
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

for (const grouped of [false, true]) {
    test(`patch files have separate stable ranges ${grouped ? "inside activity groups" : "between other tool calls"}`, async () => {
        const screen = await createTestRenderer({ width: 80, height: 40 })
        const patch: Extract<TranscriptSource, { type: "tool" }> = {
            type: "tool", id: "patch-files", name: "patch", time: { created: 1 },
            state: { status: "completed", input: { patchText: "" }, content: [{ type: "text", text: "Patched files" }] },
        }
        const edit = { ...patch, id: "edit-file", name: "edit" }
        const message: Extract<TranscriptSource, { type: "assistant" }> = {
            type: "assistant", id: "msg_changes", agent: "build", model: { providerID: "test", id: "test" },
            time: { created: 1 }, content: [patch, edit],
        }
        function box(parent: Renderable, id?: string) {
            const node = new BoxRenderable(screen.renderer, { id })
            parent.add(node)
            return node
        }
        function text(parent: BoxRenderable, content: string) {
            parent.add(new TextRenderable(screen.renderer, { content }))
        }
        function file(parent: BoxRenderable, label: string, path: string) {
            const node = box(parent)
            const header = box(node)
            text(header, label)
            text(header, path)
            text(node, `${path} first hunk`)
            text(node, `${path} second hunk`)
            return node
        }
        try {
            const row = box(screen.renderer.root, message.id)
            let entries = row
            let group: BoxRenderable | undefined
            if (grouped) {
                group = box(row, "changes-group")
                text(box(group), "⋯ 2 edits")
                entries = box(group)
            }
            const patchRoot = box(box(entries))
            const first = file(patchRoot, "← Patched", "first.ts")
            const added = file(patchRoot, "# Created", "added.ts")
            const deleted = file(patchRoot, "# Deleted", "deleted.ts")
            const editRow = grouped ? box(entries) : box(screen.renderer.root, `session-part:${message.id}:${edit.id}`)
            file(editRow, "← Edit", "edited.ts")
            const rows = grouped ? [row] : [row, editRow]
            await screen.renderOnce()

            const result = transcriptItems(rows, [message])
            const ranges = result.ranges.filter((range) => !range.toggle)
            expect(ranges).toHaveLength(4)
            expect(result.hasLatest).toBe(true)
            for (const [index, node] of [first, added, deleted].entries()) {
                const range = ranges[index]
                expect(range.source).toBe(patch)
                expect(range.fileIndex).toBe(index)
                expect(range.node).toBe(node)
                expect(range.top).toBe(node.y)
                expect(range.bottom).toBe(node.y + node.height)
                expect(range.parentID).toBe(group?.id)
                expect(range.text).toContain("second hunk")
                const name = ["first.ts", "added.ts", "deleted.ts"][index]
                expect(range.text).toContain(name)
                for (const other of ["first.ts", "added.ts", "deleted.ts", "edited.ts"]) {
                    if (other !== name) expect(range.text).not.toContain(other)
                }
            }
            expect(ranges[0].bottom).toBeLessThanOrEqual(ranges[1].top)
            expect(ranges[1].bottom).toBeLessThanOrEqual(ranges[2].top)
            expect(ranges[3].source).toBe(edit)
            expect(ranges[3].text).toContain("edited.ts")
            expect(new Set(ranges.map((range) => range.id)).size).toBe(4)
            await screen.renderOnce()
            expect(transcriptItems(rows, [message]).ranges.map((range) => range.id)).toEqual(result.ranges.map((range) => range.id))

            first.visible = false
            added.visible = false
            deleted.visible = false
            text(patchRoot, "Patching")
            await screen.renderOnce()
            const fallback = transcriptItems(rows, [message]).ranges.find((range) => range.source === patch)
            expect(fallback?.id).toBe(`session-part:${message.id}:${patch.id}`)
            expect(fallback?.text).toBe("Patching")
        } finally {
            screen.renderer.destroy()
        }
    })
}
