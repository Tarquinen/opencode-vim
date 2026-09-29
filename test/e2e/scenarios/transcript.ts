import type { Fixture } from "../support/fixture"
import { readerContains, selected } from "../support/screens"

async function openSelected({ terminal }: Fixture, label: string, value: string) {
    await terminal.screen(`${label}-selected`, (text) => selected(text, value))
    await terminal.keys("Enter")
    await terminal.screen(`${label}-reader`, (text) => readerContains(text, value))
    await terminal.keys("Escape")
    await terminal.screen(`${label}-closed`, (text) => text.includes("SESSION") && !text.includes("v select"))
}

async function enterSession({ terminal }: Fixture) {
    await terminal.keys("Escape")
    await terminal.screen("transcript-normal", (text) => text.includes("NORMAL"))
    await terminal.type("s")
    await terminal.screen("transcript-session", (text) => text.includes("SESSION"))
}

export async function transcriptGrouped(fixture: Fixture) {
    const { keys, type, screen, click } = fixture.terminal
    await enterSession(fixture)
    await openSelected(fixture, "final-answer", "Fixture inspection complete")
    await type("k")
    await screen("tools-collapsed", (text) => selected(text, "Explored: 2 reads") && !text.includes("Read first.ts"))
    await keys("Enter")
    await screen("tools-expanded", (text) => text.includes("Read first.ts") && text.includes("Read second.ts"))
    await type("j")
    await openSelected(fixture, "first-tool", "Read first.ts")
    await type("j")
    await openSelected(fixture, "second-tool", "Read second.ts")
    let point = { x: 0, y: 0 }
    await screen("tools-before-collapse", (text) => {
        if (!selected(text, "Read second.ts")) return false
        const lines = text.split("\n")
        for (let y = 0; y < lines.length; y++) {
            const x = lines[y].indexOf("Explored: 2 reads")
            if (x !== -1) { point = { x, y }; return true }
        }
        return false
    })
    await click(point.x, point.y)
    await screen("tools-recollapsed", (text) => selected(text, "Explored: 2 reads") && !text.includes("Read first.ts"))
    await type("k")
    await screen("thought-header", (text) => selected(text, "Thought"))
    await keys("Enter")
    await screen("thoughts-expanded", (text) => text.includes("Check measurements") && text.includes("Check the cursor"))
    await type("j")
    await openSelected(fixture, "first-thought", "Check measurements")
    await type("j")
    await openSelected(fixture, "second-thought", "Check the cursor")
}

export async function transcriptLowDetail(fixture: Fixture) {
    const { keys, type, screen } = fixture.terminal
    await enterSession(fixture)
    await type("k")
    await screen("activity-collapsed", (text) => selected(text, "2 thoughts, 2 reads"))
    await keys("Enter")
    await screen("activity-expanded", (text) => text.includes("Thought") && text.includes("Explored: 2 reads"))
    await type("j")
    await screen("nested-thoughts", (text) => selected(text, "Thought"))
    await keys("Enter")
    await screen("nested-thoughts-expanded", (text) => text.includes("Check measurements"))
    await type("j")
    await openSelected(fixture, "nested-first-thought", "Check measurements")
    await type("j")
    await openSelected(fixture, "nested-second-thought", "Check the cursor")
    await type("j")
    await screen("nested-tools", (text) => selected(text, "Explored: 2 reads"))
    await keys("Enter")
    await screen("nested-tools-expanded", (text) => text.includes("Read first.ts"))
    await type("j")
    await openSelected(fixture, "nested-first-tool", "Read first.ts")
    await type("j")
    await openSelected(fixture, "nested-second-tool", "Read second.ts")
    await type("j")
    await openSelected(fixture, "after-activity", "Fixture inspection complete")
}

export async function transcriptUngrouped(fixture: Fixture) {
    await enterSession(fixture)
    for (const [index, value] of ["Read second.ts", "Read first.ts", "Check the cursor", "Check measurements"].entries()) {
        await fixture.terminal.type("k")
        await openSelected(fixture, `ungrouped-${index}`, value)
    }
}

export async function transcriptRunning(fixture: Fixture) {
    const { keys, type, screen } = fixture.terminal
    await enterSession(fixture)
    await screen("running-group", (text) => selected(text, "Exploring: 2 reads"))
    await keys("Enter")
    await screen("running-expanded", (text) => text.includes("Read first.ts") && text.includes("Read second.ts"))
    await type("j")
    await openSelected(fixture, "running-first-tool", "Read first.ts")
    await type("j")
    await openSelected(fixture, "running-second-tool", "Read second.ts")
}

export async function transcriptHistory(fixture: Fixture) {
    const { type, screen } = fixture.terminal
    await enterSession(fixture)
    let latestRow = -1
    await screen("history-natural-bottom", (text) => {
        latestRow = text.split("\n").findIndex((line) => line.includes("History entry 239"))
        return latestRow >= 0
    })
    await openSelected(fixture, "history-latest", "History entry 239")
    await type("130k")
    await screen("history-loaded-older", (text) => selected(text, "History entry 109"), 15_000)
    await openSelected(fixture, "history-older", "History entry 109")
    await type("gg")
    await screen("history-first", (text) => selected(text, "History entry 000"), 15_000)
    await openSelected(fixture, "history-first", "History entry 000")
    await type("kj")
    await screen("history-oldest-boundary", (text) => selected(text, "History entry 001"), 15_000)
    await type("G")
    await screen("history-return-to-latest", (text) => selected(text, "History entry 239"), 15_000)
    await openSelected(fixture, "history-restored", "History entry 239")
    await screen("history-no-navigation-padding", (text) => text.split("\n")[latestRow]?.includes("History entry 239") === true)
}
