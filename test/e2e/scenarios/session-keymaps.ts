import type { Fixture } from "../fixture"
import { readerContains } from "../screens"

export async function sessionKeymaps({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    await type("keymap draft")
    await keys("Escape")
    await screen("normal", (text) => text.includes("NORMAL"))
    await type("s")
    await screen("session", (text) => text.includes("SESSION"))
    await keys("Tab")
    await screen("browsing-native-new-session", (text) => !!text.split("\n")[0]?.includes("New session") && !text.includes("SESSION"))
    await keys("C-x", "1")
    await screen("browsing-draft-restored", (text) => text.includes("keymap draft") && text.includes("NORMAL"))
    await type("s")
    await screen("session-again", (text) => text.includes("SESSION"))
    await keys("Enter")
    await screen("command", (text) => readerContains(text, "captured stdout") && text.includes("v select · <C-w>w switch section · s prompt"))
    await keys("C-w", "w")
    await screen("output", (text) => text.split("\n")[terminal.cursor().y]?.slice(terminal.cursor().x).startsWith("captured stdout"))
    await type("v")
    await screen("visual", (text) => text.includes("VISUAL"))
    await keys("C-w", "w")
    await screen("command-again", (text) => !text.includes("VISUAL") && text.includes("v select")
        && text.split("\n")[terminal.cursor().y]?.slice(terminal.cursor().x).startsWith("printf"))
    await keys("Tab")
    await screen("native-new-session", (text) => !!text.split("\n")[0]?.includes("New session") && !text.includes("Shell output"))
    await keys("C-x", "1")
    await screen("draft-restored", (text) => text.includes("keymap draft") && !text.split("\n")[0]?.includes("New session"))
}

export async function sessionAgentBinding({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    let initial = ""
    const agent = (text: string) => /┃\s+(Build|Plan) ·/.exec(text)?.[1]
    await type("agent draft")
    await screen("initial-agent", (text) => {
        initial = agent(text) ?? ""
        return !!initial && text.includes("agent draft")
    })
    const next = initial === "Build" ? "Plan" : "Build"
    await keys("Tab")
    await screen("agent-switched", (text) => agent(text) === next && text.includes("INSERT"))
    await keys("Escape")
    await screen("normal", (text) => text.includes("NORMAL"))
    await type("s")
    await screen("session", (text) => text.includes("SESSION"))
    await keys("Tab")
    await screen("session-agent-switched", (text) => agent(text) === initial && text.includes("SESSION"))
    await keys("Enter")
    await screen("reader", (text) => readerContains(text, "captured stdout") && text.includes("v select · <C-w>w switch section · s prompt"))
    await keys("Tab")
    await type("w")
    await screen("reader-native-scope", (text) => agent(text) === initial && text.includes("Shell output")
        && text.split("\n")[terminal.cursor().y]?.slice(terminal.cursor().x).startsWith("'"))
    await keys("C-w", "w")
    await screen("reader-output", (text) => text.split("\n")[terminal.cursor().y]?.slice(terminal.cursor().x).startsWith("captured stdout"))
    await type("s")
    await screen("prompt", (text) => text.includes("NORMAL") && !text.includes("SESSION"))
    await keys("C-x", "a")
    await screen("native-dialog", (text) => text.includes("Select agent"))
    await keys("Tab", "Enter")
    await screen("native-dialog-binding", (text) => !text.includes("Select agent") && agent(text) === next)
    await type("i")
    await screen("insert", (text) => text.includes("INSERT"))
    await keys("Tab")
    await screen("agent-binding-restored", (text) => agent(text) === initial && text.includes("INSERT"))
}
