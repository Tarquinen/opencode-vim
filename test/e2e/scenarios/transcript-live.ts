import assert from "node:assert/strict"
import type { Fixture } from "../support/fixture"
import { reader, readerContains, selected } from "../support/screens"

export async function transcriptLive({ terminal, request, sessionID, stream }: Fixture) {
    assert(stream)
    const { keys, type, screen, cursor, clipboard } = terminal
    await type("live draft")
    await keys("Escape")
    await type("s")
    await screen("original-selected", (text) => selected(text, "one two"))

    await request(`/api/session/${sessionID}/prompt`, { text: "A message arriving during browsing" })
    await screen("message-arrived", (text) => text.includes("hello") && text.includes("A message arriving during browsing")
        && selected(text, "one two"), 15_000)
    await type("G")
    await screen("new-latest-selected", (text) => selected(text, "hello"))
    await type("k")
    await screen("new-user-selected", (text) => selected(text, "A message arriving during browsing"))
    await type("j")
    await screen("stream-selected", (text) => selected(text, "hello"))
    await keys("Enter")
    let frame: ReturnType<typeof reader>
    await screen("stream-reader", (text) => {
        frame = reader(text)
        return frame?.content.includes("hello") ?? false
    })
    assert(frame)
    const bounds = frame
    await type("v2l")
    await screen("stream-selection", (text) => text.includes("VISUAL") && text.includes("y copy · Esc cancel"))
    const position = cursor()

    stream.write(" world", true)
    await screen("stream-updated-behind-reader", (text) => {
        const snapshot = text.split("\n").slice(bounds.top, bounds.bottom).join("\n")
        return text.includes("hello world") && text.includes("VISUAL") && snapshot.includes("hello") && !snapshot.includes("world")
    })
    assert.deepEqual(cursor(), position)
    await type("y")
    await screen("snapshot-selection-copied", (text) => {
        const snapshot = text.split("\n").slice(bounds.top, bounds.bottom).join("\n")
        return snapshot.includes("Copied") && snapshot.includes("hello") && !snapshot.includes("world")
    })
    assert.equal(clipboard(), "hel")

    await keys("Escape")
    await screen("browsing-refreshed", (text) => !text.includes("v select") && selected(text, "hello world"))
    await type("yy")
    await screen("updated-message-copied", (text) => text.includes("Copied"))
    assert.equal(clipboard(), "hello world")
    await keys("Enter")
    await screen("updated-reader", (text) => readerContains(text, "hello world"))
    await type("sA restored")
    await screen("live-prompt-restored", (text) => text.includes("INSERT") && text.includes("live draft restored"))
}
