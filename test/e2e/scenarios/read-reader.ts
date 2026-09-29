import type { Fixture } from "../support/fixture"
import { reader, readerContains, selected } from "../support/screens"

export async function readReader({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    await type("read draft")
    await keys("Escape")
    await screen("normal", (text) => text.includes("NORMAL"))
    await type("s")
    await screen("session", (text) => selected(text, "Read fixtures ready"))
    await type("k")
    let nested = false
    await screen("reads-collapsed", (text) => {
        nested = !text.includes("Explored: 2 reads")
        return selected(text, "2 reads")
    })
    await keys("Enter")
    if (nested) {
        await screen("activity-expanded", (text) => text.includes("Explored: 2 reads"))
        await type("j")
        await screen("nested-reads", (text) => selected(text, "Explored: 2 reads"))
        await keys("Enter")
    }
    await screen("reads-expanded", (text) => text.includes("Read src/sample.ts") && text.includes("Read empty.txt"))
    await type("j")
    await screen("code-selected", (text) => selected(text, "Read src/sample.ts"))
    await keys("Enter")
    await screen("file-reader", (text) => readerContains(text, "Lines 41–100") && readerContains(text, "Partial file")
        && /41\s+const greeting =/.test(text)
        && text.split("\n")[terminal.cursor().y]?.slice(terminal.cursor().x).startsWith("const greeting"))
    await type("Vy")
    await screen("copied", (text) => text.includes("Copied"))
    await type("G")
    await screen("last-line", (text) => /100\s+const value100 = 100;/.test(text)
        && text.split("\n")[terminal.cursor().y]?.includes("value100"))
    await screen("last-line-colors", (text, ansi) => {
        const row = text.split("\n").findIndex((line) => /100\s+const value100 = 100;/.test(line))
        const line = ansi.split("\n")[row] ?? ""
        return /\x1b\[[\d;]*mconst\x1b\[/.test(line) && /\x1b\[[\d;]*m100\x1b\[/.test(line)
    })
    await keys("Escape")
    await screen("back-to-session", (text) => selected(text, "Read src/sample.ts") && !text.includes("Lines 41–100"))
    await keys("Enter")
    await screen("position-restored", (text) => readerContains(text, "value100")
        && text.split("\n")[terminal.cursor().y]?.includes("value100"))
    terminal.resize(44, 20)
    await type("gg")
    await screen("narrow-file-reader", (text) => {
        const frame = reader(text)
        return !!frame && frame.top >= 0 && frame.bottom < 20 && /41\s+const greeting/.test(frame.content)
    })
    terminal.resize(120, 38)
    await screen("wide-file-reader", (text) => readerContains(text, "Lines 41–100"))
    await keys("Escape")
    await screen("session-again", (text) => selected(text, "Read src/sample.ts") && !text.includes("Lines 41–100"))
    await type("j")
    await screen("empty-selected", (text) => selected(text, "Read empty.txt"))
    await keys("Enter")
    await screen("empty-reader", (text) => readerContains(text, "Empty file") && !text.includes("Lines 1–1"))
    await type("s")
    await screen("draft-restored", (text) => text.includes("read draft") && text.includes("NORMAL") && !text.includes("SESSION"))
    await type("A restored")
    await screen("prompt-focus", (text) => text.includes("read draft restored") && text.includes("INSERT"))
}
