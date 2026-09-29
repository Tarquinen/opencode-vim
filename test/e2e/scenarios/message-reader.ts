import assert from "node:assert/strict"
import type { Fixture } from "../fixture"
import { reader, readerContains } from "../screens"

export async function messageReader({ terminal }: Fixture) {
    const { keys, type, screen, cursor } = terminal
    await type("original draft")
    await keys("Escape")
    await screen("reader-prompt", (text) => text.includes("NORMAL") && text.includes("original draft"))
    await type("s")
    await screen("reader-session", (text) => text.includes("SESSION"))
    await keys("Enter")
    let frame: ReturnType<typeof reader>
    await screen("reader-opened", (text) => {
        frame = reader(text)
        return frame?.content.includes("one two") ?? false
    })
    assert(frame)
    assert(frame.left > 0 && frame.right < 120 && frame.top > 0 && frame.bottom < 38)
    assert(Math.abs((frame.left + frame.right) / 2 - 60) <= 2)
    assert(Math.abs((frame.top + frame.bottom) / 2 - 19) <= 2)
    const start = cursor()
    await type("wvl")
    await screen("reader-visual", (text) => text.includes("VISUAL") && text.includes("y copy · Esc cancel"))
    assert.deepEqual(cursor(), { x: start.x + 5, y: start.y })
    await keys("Escape")
    await screen("reader-selection-cancelled", (text) => readerContains(text, "one two"))
    const remembered = cursor()
    await keys("Escape")
    await screen("reader-back-to-session", (text) => text.includes("SESSION") && !text.includes("v select"))
    await keys("Enter")
    await screen("reader-reopened", (text) => readerContains(text, "one two"))
    assert.deepEqual(cursor(), remembered)
    await keys("C-c")
    await screen("reader-ctrl-c", (text) => text.includes("SESSION") && !text.includes("v select"))

    for (const dismissal of ["button", "backdrop"]) {
        await keys("Enter")
        await screen(`reader-${dismissal}-opened`, (text) => {
            frame = reader(text)
            return frame?.content.includes("one two") ?? false
        })
        assert.deepEqual(cursor(), remembered)
        assert(frame)
        await terminal.click(dismissal === "button" ? frame.right - 2 : 0, dismissal === "button" ? frame.top : 0)
        await screen(`reader-${dismissal}-closed`, (text) => text.includes("SESSION") && !text.includes("v select"))
    }

    for (const exit of ["s", "Escape"]) {
        await keys("Enter")
        await screen(`reader-${exit}-opened`, (text) => readerContains(text, "second line"))
        // Back-to-back keys catch delayed host refocus stealing prompt focus.
        await keys("Escape", exit)
        await screen(`reader-${exit}-prompt`, (text) => text.includes("NORMAL") && !text.includes("SESSION") && !text.includes("v select"))
        await keys("PageUp")
        await type("A restored")
        await screen(`reader-${exit}-focus`, (text) => text.includes("original draft restored") && text.includes("INSERT"))
        await keys("C-c")
        await type("original draft")
        await keys("Escape")
        await screen(`reader-${exit}-normal`, (text) => text.includes("NORMAL"))
        await type("s")
        await screen(`reader-${exit}-session`, (text) => text.includes("SESSION"))
    }
}

export async function readerLayout({ terminal }: Fixture) {
    const { type, keys, screen } = terminal
    await keys("Escape")
    await type("s")
    await keys("Enter")
    await screen("long-reader", (text) => readerContains(text, "Reader line 001"))
    await keys("C-d", "C-f")
    let remembered = ""
    await screen("reader-paged", (text) => {
        const line = text.split("\n")[terminal.cursor().y] ?? ""
        remembered = /Reader line \d+/.exec(line)?.[0] ?? ""
        return !!remembered && remembered !== "Reader line 001"
    })
    terminal.resize(44, 20)
    await screen("reader-resized", (text) => {
        const frame = reader(text)
        return !!frame && frame.left > 0 && frame.right < 44 && frame.top >= 0 && frame.bottom < 20
    })
    await keys("Escape", "Enter")
    await screen("reader-position-restored", (text) => text.split("\n")[terminal.cursor().y]?.includes(remembered) === true)
    await keys("C-u")
    await screen("reader-page-up", (text) => {
        const line = text.split("\n")[terminal.cursor().y] ?? ""
        const number = /Reader line (\d+)/.exec(line)?.[1]
        return !!number && Number(number) < Number(remembered.slice(-3))
    })
    await type("siresized prompt")
    await screen("resized-prompt-focus", (text) => text.includes("resized prompt") && text.includes("INSERT"))
}
