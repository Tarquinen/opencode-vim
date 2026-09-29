import assert from "node:assert/strict"
import type { Fixture } from "../support/fixture"
import { readerContains, selected } from "../support/screens"

export function sessionControls(key = "s") {
    return async ({ terminal }: Fixture) => {
        const { type, keys, screen } = terminal
        const press = () => key.startsWith("<C-") ? keys(`C-${key.slice(3, -1)}`) : type(key)
        const full = key === "s"
        const draft = full ? "oiginal draft" : "original draft"
        await type("original draft")
        await keys("Escape")
        if (full) await type("0lx")
        await screen("normal-prompt", (text) => text.includes(draft) && text.includes("NORMAL"))
        const cursor = terminal.cursor()
        let answerRow = -1
        if (full) {
            await screen("before-session", (text) => {
                answerRow = text.split("\n").findIndex((line) => line.includes("one two"))
                return answerRow >= 0
            })
        }
        await press()
        await screen("browsing", (text) => selected(text, "one two") && text.replace(/\s+/g, " ").includes(`${key} prompt`) && !text.includes("v select"))
        if (full) {
            await screen("unchanged-layout", (text) => text.split("\n")[answerRow]?.includes("one two") === true)
            await terminal.paste("MUTATION")
        }
        await press()
        await screen("returned-prompt", (text) => text.includes("NORMAL") && text.includes(draft) && !text.includes("SESSION") && !text.includes("MUTATION"))
        assert.deepEqual(terminal.cursor(), cursor)
        if (full) {
            await type("u")
            await screen("prompt-undo", (text) => text.includes("original draft"))
            await terminal.resize(32, 20)
            let promptRow = -1
            await screen("narrow-prompt", (text) => {
                promptRow = text.split("\n").findIndex((line) => line.includes("original draft"))
                return promptRow >= 0 && text.split("\n")[18]?.includes("NORMAL") === true
            })
            await press()
            await screen("narrow-session", (text) => text.includes("SESSION") && text.split("\n")[promptRow]?.includes("original draft") === true)
            await press()
            await terminal.resize(120, 38)
            await screen("wide-prompt", (text) => text.includes("NORMAL") && text.includes("original draft"))
        }
        await press()
        await keys("Enter")
        await screen("reader", (text) => readerContains(text, "one two") && text.includes(`${key} prompt`))
        if (full) {
            await type("iaAoOdDcxpru.")
            await terminal.paste("MUTATION")
            await screen("read-only", (text) => readerContains(text, "one two") && !text.includes("MUTATION") && !text.includes("INSERT"))
        }
        await press()
        await screen("reader-to-prompt", (text) => text.includes("NORMAL") && !text.includes("SESSION") && !text.includes("v select"))
        await type("A restored")
        await screen("prompt-focus", (text) => text.includes("original draft restored") && text.includes("INSERT"))
    }
}

export function sessionKeyConflict(key: string) {
    return async ({ terminal }: Fixture) => {
        const { type, keys, screen } = terminal
        await type("hello")
        await keys("Escape")
        await type(`0${key}${key}`)
        await screen("mapped-key", (text) => text.includes("ello") && !text.includes("SESSION"))
        await type(`i${key}`)
        await screen("insert-key", (text) => text.includes(`${key}ello`) && text.includes("INSERT"))
        await keys("Escape")
        await type(`f${key}`)
        await keys("C-p")
        await screen("dialog-key", (text) => text.includes("Commands") && text.includes("NORMAL") && !text.includes("SESSION"))
        await type(key)
        await screen("dialog-key-stays-modal", (text) => text.includes("Commands") && !text.includes("SESSION"))
        // The first Escape cancels the pending doubled-key mapping.
        await keys("Escape", "Escape")
        await screen("dialog-still-native", (text) => !text.includes("Commands") && text.includes("NORMAL"))
    }
}

export async function emptySession({ terminal }: Fixture) {
    await terminal.keys("Escape")
    await terminal.type("s")
    await terminal.screen("empty-session", (text) => text.includes("SESSION · Enter open · yy copy · s prompt"))
    await terminal.type("k")
    await terminal.keys("Enter")
    await terminal.screen("empty-no-reader", (text) => text.includes("SESSION") && !text.includes("v select"))
    await terminal.type("siempty restored")
    await terminal.screen("empty-exit", (text) => text.includes("empty restored") && text.includes("INSERT") && !text.includes("SESSION"))
}

export async function sessionLifecycle({ terminal }: Fixture) {
    const { type, keys, screen } = terminal
    await type("lifecycle draft")
    await keys("Escape")
    await type("s")
    await screen("browsing", (text) => selected(text, "one two"))
    // Session switching is a global host command, available while browsing.
    await keys("C-x", "l")
    await screen("browsing-dialog", (text) => text.includes("Sessions") && text.includes("NORMAL") && !selected(text, "one two"))
    await type("iE2E")
    await screen("dialog-editing", (text) => text.includes("Sessions") && text.includes("INSERT"))
    await keys("Escape", "Escape")
    await screen("browsing-restored", (text) => selected(text, "one two") && text.includes("SESSION"))
    await keys("Enter")
    await screen("reader-opened", (text) => readerContains(text, "one two"))
    await keys("C-x", "l")
    await screen("replacement-dialog", (text) => text.includes("Sessions") && !text.includes("v select"))
    await type("Q")
    await screen("disabled-keeps-replacement", (text) => text.includes("Sessions") && !text.includes("SESSION") && !text.includes("NORMAL") && !selected(text, "one two"))
    await keys("Escape")
    await screen("disabled", (text) => !text.includes("Sessions") && !text.includes("SESSION"))
    await keys("C-p")
    await screen("disabled-palette", (text) => text.includes("Commands"))
    await type("Toggle Vim Mode")
    await screen("reenable-selected", (text) => text.includes("Toggle Vim Mode") && !text.includes("New session"))
    await keys("Enter")
    await screen("reenabled", (text) => !text.includes("Commands") && text.includes("NORMAL"))
    await type("s")
    await keys("Enter")
    await screen("reader-reopened", (text) => readerContains(text, "one two"))
    await keys("C-x", "n")
    await screen("route-changed", (text) => text.split("\n")[0].includes("New session") && !text.includes("v select") && !text.includes("SESSION"))
    await keys("C-x", "1")
    await screen("route-restored", (text) => text.includes("lifecycle draft") && !text.includes("v select") && !text.includes("SESSION"))
}
