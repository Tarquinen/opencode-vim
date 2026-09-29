import assert from "node:assert/strict"
import type { Fixture } from "../support/fixture"

export async function promptInput({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    // This scenario starts NORMAL, so the already-focused native prompt must be intercepted.
    await type("x")
    await screen("startup-intercepted", (text) => text.includes("NORMAL") && promptLine(text, terminal.cursor().y) === "")
    await type("ihello")
    await screen("native-insert", (text) => text.includes("hello") && text.includes("INSERT"))
    await type("kj")
    await screen("mapped-normal", (text) => text.includes("NORMAL") && text.includes("hello") && !text.includes("hellok"))
    await type("0")
    await keys("Tab")
    await screen("mapped-tab", (text) => text.includes("ello") && !text.includes("hello"))
    await type("u")
    await screen("mapped-tab-undone", (text) => text.includes("hello"))
    const cursor = terminal.cursor()
    await type("d")
    await screen("pending-operator", (text) => text.includes("NORMAL") && text.includes("hello"))
    await keys("Escape")
    assert.deepEqual(terminal.cursor(), cursor)
    // The host's leader sequence must survive even when its suffix is a Vim command.
    await keys("C-x", "l")
    await screen("host-leader-dialog", (text) => text.includes("Sessions") && text.includes("NORMAL"))
    await keys("Escape")
    await type("A restored")
    await screen("focus-restored", (text) => text.includes("hello restored") && text.includes("INSERT"))
}

export async function promptClipboard({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    await type("hello")
    await keys("Escape")
    await type("0ddp")
    await screen("rapid-cut-put", (text) => promptLine(text, terminal.cursor().y) === "hello" && text.includes("NORMAL"))
    assert.equal(terminal.clipboard(), "hello\n")
    await type("0xxp")
    await screen("ordered-cuts", (text) => promptLine(text, terminal.cursor().y) === "lelo")
    assert.equal(terminal.clipboard(), "e")

    await type("i")
    await keys("C-c")
    await type("A")
    await keys("Escape")
    await type("yiw")
    await screen("seed-register", () => terminal.clipboard() === "A")
    await type("i")
    await keys("C-c", "Escape")
    // One input batch exercises the plugin's async queue, including native paste.
    await type("ppiB\x1b[200~C\x1b[201~")
    await screen("queued-native-input", (text) => promptLine(text, terminal.cursor().y) === "ABCA" && text.includes("INSERT"))
    // OpenCode resolves pasted attachments asynchronously before inserting text.
    await keys("Escape")

    await type("i")
    await keys("C-c")
    await type("hello")
    await keys("Escape")
    await type('0"ayiw$"ap')
    await screen("named-register", (text) => promptLine(text, terminal.cursor().y) === "hellohello")
    assert.equal(terminal.clipboard(), "A")
    await type("p")
    await screen("unnamed-register", (text) => promptLine(text, terminal.cursor().y) === "hellohelloA")
    await type("0Q")
    await screen("mapped-yank-put", (text) => promptLine(text, terminal.cursor().y) === "hellohelloAhellohelloA")

    // A native dialog and the prompt use separate editors but share clipboard fallback.
    await type("i")
    await keys("C-c", "Escape", "C-p")
    await screen("clipboard-dialog", (text) => text.includes("Commands") && text.includes("NORMAL"))
    await type("iOpen settings")
    await keys("Escape")
    await type("0yiw")
    await screen("dialog-yank", () => terminal.clipboard() === "Open")
    await keys("Escape")
    await type("p")
    await screen("dialog-to-prompt", (text) => !text.includes("Commands") && promptLine(text, terminal.cursor().y) === "Open")
    await type("A shared")
    await keys("Escape")
    await type("0y$")
    await screen("prompt-yank", () => terminal.clipboard() === "Open shared")
    await keys("C-p")
    await screen("clipboard-dialog-again", (text) => text.includes("Commands") && text.includes("NORMAL"))
    await type("p")
    await screen("prompt-to-dialog", (text) => text.includes("Commands") && /^\s+Open shared\s*$/m.test(text))
}

export async function promptHistory({ terminal, stream }: Fixture) {
    assert(stream)
    const { keys, type, screen } = terminal
    for (const [index, value] of ["older 中中", "newer 文文"].entries()) {
        await type(value)
        await keys("Enter")
        await screen(`submitted-${index}`, (text) => text.split("history response").length === index + 2)
        stream.write("", true)
    }
    await keys("Escape")
    await type("k")
    await screen("history-newest", (text) => promptLine(text, terminal.cursor().y) === "newer 文文")
    const start = terminal.cursor()
    await type("k")
    await screen("history-older", (text) => promptLine(text, terminal.cursor().y) === "older 中中")
    await type("j")
    await screen("history-forward", (text) => promptLine(text, terminal.cursor().y) === "newer 文文")
    assert.equal(terminal.cursor().x, start.x + 10, "History forward restores display-width cursor offsets")
    await type("j")
    await screen("history-empty", (text) => promptLine(text, terminal.cursor().y) === "")
    await type("khiX")
    await keys("Escape")
    await type("k")
    await screen("edited-history-is-draft", (text) => promptLine(text, terminal.cursor().y) === "Xnewer 文文" && text.includes("NORMAL"))
}

function promptLine(text: string, row: number) {
    return (text.split("\n")[row] ?? "").replace(/^\s*┃\s?/, "").trim()
}
