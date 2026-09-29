import { expect, test } from "bun:test"
import type { Context } from "@opencode/plugin/tui/context"
import { ScrollBoxRenderable, TextRenderable, RGBA } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { createTranscriptSelection } from "../../src/transcript"
import { testTheme } from "../helpers/theme"

test("selection drawing clips marker and yank colors without changing Unicode, layout or scroll", async () => {
    const screen = await createTestRenderer({ width: 40, height: 12 })
    try {
        const text = Array.from({ length: 24 }, (_, index) => `row ${index} 中 👍🏽 é`).join("\n")
        const scroll = new ScrollBoxRenderable(screen.renderer, { width: 36, height: 8, left: 2, top: 1 })
        const row = new TextRenderable(screen.renderer, { id: "message", content: text, flexShrink: 0 })
        scroll.add(row)
        screen.renderer.root.add(scroll)
        await screen.renderOnce()
        scroll.scrollTo(5)
        await screen.renderOnce()
        const context = {
            renderer: screen.renderer, theme: testTheme(),
            data: { session: { message: { list: () => [{ id: "message", type: "user", text, time: { created: 1 } }] }, permission: { list: () => [] } } },
            keymap: { dispatch() { throw new Error("The selected row is already mounted") } },
        } as unknown as Context
        let selected: string | undefined
        const selection = createTranscriptSelection(context, "session", (id) => { selected = id })
        const before = screen.captureCharFrame()
        const layout = { y: row.y, height: row.height, width: row.width, scroll: scroll.scrollTop, sticky: scroll.stickyScroll }
        selection.latest()
        expect(selection.get(selected)?.text).toBe(text)
        let flash: string | undefined
        const draw: Parameters<typeof screen.renderer.addPostProcessFn>[0] = (buffer) => selection.draw(buffer, flash)
        screen.renderer.addPostProcessFn(draw)
        await screen.renderOnce()
        const plain = screen.captureSpans()
        expect(screen.captureCharFrame().replaceAll("▎", " ")).toBe(before)
        flash = selected
        await screen.renderOnce()
        const colored = screen.captureSpans()
        for (let y = 0; y < colored.lines.length; y++) {
            const visible = y >= scroll.viewport.y && y < scroll.viewport.y + scroll.viewport.height
            expect(screen.captureCharFrame().split("\n")[y].includes("▎")).toBe(visible)
            expect(colored.lines[y].spans.some((span) => span.bg.equals(RGBA.fromHex("#00ffff")))).toBe(visible)
            if (visible) expect(colored.lines[y].spans.find((span) => span.text.includes("row"))?.fg).toEqual(RGBA.fromHex("#000000"))
        }
        expect(screen.captureCharFrame().replaceAll("▎", " ")).toBe(before)
        expect({ y: row.y, height: row.height, width: row.width, scroll: scroll.scrollTop, sticky: scroll.stickyScroll }).toEqual(layout)
        flash = undefined
        await screen.renderOnce()
        expect(screen.captureSpans()).toEqual(plain)
        screen.renderer.removePostProcessFn(draw)
        await screen.renderOnce()
        expect(screen.captureCharFrame()).toBe(before)
    } finally { screen.renderer.destroy() }
})
