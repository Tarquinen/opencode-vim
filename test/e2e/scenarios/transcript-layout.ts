import assert from "node:assert/strict"
import type { Fixture } from "../fixture"
import { readerContains, selected } from "../screens"

export async function transcriptLayout({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    await keys("Escape")
    let before: string[] = []
    await screen("natural-bottom", (text) => {
        before = text.split("\n")
        return text.includes("NORMAL") && text.includes("Latest end") && text.includes("Latest question")
    })
    await type("s")
    await screen("latest-selected", (text) => selected(text, "Latest reply") && selected(text, "Latest end"))
    const position = (lines: string[], value: string) => lines.findIndex((line) => line.includes(value))
    await screen("entry-keeps-layout", (text) => {
        const lines = text.split("\n")
        return position(lines, "Latest end") === position(before, "Latest end") && position(lines, "Latest question") === position(before, "Latest question")
    })
    await type("k")
    await screen("visible-selection", (text) => selected(text, "Latest question") && position(text.split("\n"), "Latest end") === position(before, "Latest end"))
    for (let cycle = 0; cycle < 2; cycle++) {
        await type("gg")
        await screen(`oldest-${cycle}`, (text) => selected(text, "Earlier line 0") && !text.includes("Latest reply"))
        for (const value of ["First part", "Second part", "Latest question", "Latest reply"]) {
            await type("j")
            await screen(`next-${cycle}-${value}`, (text) => selected(text, value))
            await keys("Enter")
            await screen(`reader-${cycle}-${value}`, (text) => readerContains(text, value))
            await keys("Escape")
            await screen(`closed-${cycle}-${value}`, (text) => !text.includes("v select") && selected(text, value))
        }
        await screen(`natural-bottom-${cycle}`, (text) => position(text.split("\n"), "Latest end") === position(before, "Latest end"))
    }
    await type("gg")
    await screen("oldest-again", (text) => selected(text, "Earlier line 0"))
    await type("ss")
    await screen("reentry-selects-latest", (text) => selected(text, "Latest end") && position(text.split("\n"), "Latest end") === position(before, "Latest end"))
    await type("3k")
    await screen("first-part-only", (text) => selected(text, "First part") && !selected(text, "Second part") && !selected(text, "Second end"))
    await type("yy")
    await screen("first-part-copied", (text) => text.includes("Copied"))
    assert.equal(terminal.clipboard(), "First part\nFirst end")
    await type("j")
    await screen("second-part-only", (text) => selected(text, "Second part") && selected(text, "Second end") && !selected(text, "First part"))
    await type("yy")
    await screen("second-part-copied", (text) => text.includes("Copied"))
    assert.equal(terminal.clipboard(), "Second part\nSecond end")
}

export async function transcriptPartial({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    await keys("Escape")
    let rows: string[] = []
    await screen("partial-bottom", (text) => {
        rows = text.split("\n")
        return text.includes("NORMAL") && text.includes("Reply line 79") && !text.includes("Reply line 0\n")
    })
    await type("s")
    await screen("partial-selected", (text) => selected(text, "Reply line 79"))
    await screen("partial-layout", (text) => {
        const marked = text.split("\n")
        for (let y = 0; y < rows.length; y++) {
            if (rows[y].includes("Reply line")) {
                if (marked[y].replaceAll("▎", " ") !== rows[y]) return false
            } else if (marked[y].includes("▎")) return false
        }
        return true
    })
    await type("yy")
    await screen("partial-copied", (text) => text.includes("Copied"))
    const lines: string[] = []
    for (let i = 0; i < 80; i++) lines.push(`Reply line ${i}`)
    assert.equal(terminal.clipboard(), lines.join("\n"))
    await keys("Enter")
    await screen("partial-whole-reader", (text) => readerContains(text, "Reply line 0"))
    await type("G")
    await screen("partial-reader-end", (text) => readerContains(text, "Reply line 79"))
}

export async function transcriptParts({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    await keys("Escape")
    // No frame wait between entry and open: the latest reasoning row must be
    // available immediately, including when it has no following text response.
    await keys("s", "Enter")
    await screen("latest-reasoning", (text) => readerContains(text, "Still thinking"))
    await keys("Escape")
    await type("yy")
    await screen("latest-reasoning-copied", (text) => text.includes("Copied"))
    assert.equal(terminal.clipboard(), "Still thinking")
    for (const [label, value, copied] of [
        ["answer", "Finished", "Finished"],
        ["tool", "pwd", "$ pwd\n/work"],
        ["reasoning", "Check something", "Check something"],
        ["start", "Start", "Start"],
    ]) {
        await type("k")
        await screen(`${label}-selected`, (text) => selected(text, value))
        await type("yy")
        await screen(`${label}-copied`, (text) => text.includes("Copied"))
        assert.equal(terminal.clipboard(), copied)
        await keys("Enter")
        await screen(`${label}-reader`, (text) => readerContains(text, value))
        await keys("Escape")
        await screen(`${label}-closed`, (text) => !text.includes("v select"))
    }
    await type("3j")
    await screen("counted-parts", (text) => selected(text, "Finished"))
}

export async function sessionCopy({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    await type("draft")
    await keys("Escape")
    await type("sgg")
    let unselected = ""
    await screen("markdown-selected", (text, ansi) => {
        const row = text.split("\n").findIndex((line) => line.includes("quoted 中 👩‍💻"))
        unselected = ansi.split("\n")[row]
        return selected(text, "Heading") && !!unselected
    })
    await type("yy")
    await screen("markdown-copied", (text) => text.includes("Copied"))
    assert.equal(terminal.clipboard(), "# Heading\n\n```ts\nconst 中 = '👍🏽'\n```")
    await type("s$p")
    await screen("markdown-pasted", (text) => text.includes("draft# Heading") && text.includes("```ts") && /const 中 = '👍🏽\s*'/.test(text))
    await type("i")
    await keys("C-c", "Escape")
    await type("s")
    await screen("quote-selected", (text) => selected(text, "quoted 中 👩‍💻"))
    let normal = ""
    await screen("quote-before-flash", (text, ansi) => {
        const row = text.split("\n").findIndex((line) => line.includes("quoted 中 👩‍💻"))
        normal = ansi.split("\n")[row]
        return !!normal
    })
    await type("yy")
    await screen("quote-flashed", (text, ansi) => {
        const row = text.split("\n").findIndex((line) => line.includes("quoted 中 👩‍💻"))
        return text.includes("Copied") && ansi.split("\n")[row] !== normal
    })
    assert.equal(terminal.clipboard(), "quoted 中 👩‍💻\nsecond line")
    await screen("quote-flash-expired", (text, ansi) => {
        const row = text.split("\n").findIndex((line) => line.includes("quoted 中 👩‍💻"))
        return ansi.split("\n")[row] === normal
    })
    for (const [key, label] of [["k", "navigation"], ["s", "exit"]]) {
        await type(`yy${key}`)
        await screen(`quote-flash-cleared-by-${label}`, (text, ansi) => {
            const row = text.split("\n").findIndex((line) => line.includes("quoted 中 👩‍💻"))
            return !selected(text, "quoted 中 👩‍💻") && ansi.split("\n")[row] === unselected
        })
        await type(key === "k" ? "j" : "s")
        await screen(`quote-reselected-after-${label}`, (text) => selected(text, "quoted 中 👩‍💻"))
    }
    await keys("Enter")
    await screen("quote-reader", (text) => readerContains(text, "quoted 中 👩‍💻"))
    await type("Vjy")
    await screen("quote-lines-copied", (text) => text.includes("Copied"))
    assert.equal(terminal.clipboard(), "quoted 中 👩‍💻\nsecond line\n")
    await type("sp")
    await screen("quote-pasted", (text) => text.includes("NORMAL") && !text.includes("SESSION") && text.split("\n")[terminal.cursor().y]?.slice(terminal.cursor().x).startsWith("quoted 中 👩‍💻") === true)
    const cursor = terminal.cursor()
    await type("u")
    await screen("quote-undone", (text) => text.includes("NORMAL") && text.split("\n")[terminal.cursor().y]?.trim() === "┃")
    await keys("C-r")
    await screen("quote-redone", (text) => text.split("\n")[terminal.cursor().y]?.includes("quoted 中 👩‍💻") === true)
    assert.equal(terminal.cursor().x, cursor.x)
}
