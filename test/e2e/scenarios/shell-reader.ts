import type { Fixture } from "../fixture"
import { reader, readerContains, selected } from "../screens"

export async function shellReader({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    await type("shell draft")
    await keys("Escape")
    await screen("shell-normal", (text) => text.includes("NORMAL"))
    await type("s")
    await screen("shell-session", (text) => text.includes("SESSION"))
    await keys("Enter")
    await screen("user-shell-reader", (text) => readerContains(text, "captured stdout") && text.includes("Shell output") && text.includes("Exited · code 7"))
    await keys("Escape")
    await screen("user-shell-closed", (text) => !text.includes("v select") && text.includes("SESSION"))
    await type("k")
    await screen("shell-final-answer", (text) => selected(text, "Shell fixtures ready"))
    await type("k")
    let grouped = false
    await screen("shell-tools", (text) => {
        grouped = selected(text, "2 commands")
        return grouped || selected(text, "custom_shell")
    })
    if (grouped) {
        await keys("Enter")
        await screen("shell-group-expanded", (text) => text.includes("custom_shell"))
        await type("j")
    } else await type("2k")

    await keys("Enter")
    await screen("captured-shell-reader", (text) => {
        const modal = reader(text)
        return Boolean(modal?.content.includes("captured stdout") && modal.content.includes("captured stderr")
            && text.includes("Shell output") && text.includes("Exited · code 7") && !modal.content.includes("Background acknowledgement"))
    })
    await type("Vjy")
    await screen("shell-copied", (text) => text.includes("Copied"))
    await keys("Escape")
    await screen("shell-copy-closed", (text) => !text.includes("v select") && text.includes("SESSION"))
    await type("j")
    await keys("Enter")
    await screen("saved-shell-reader", (text) => readerContains(text, "retained shell output") && text.includes("Capture unavailable") && text.includes("Exited · code 0"))
    await keys("Escape")
    await screen("saved-shell-closed", (text) => !text.includes("v select") && text.includes("SESSION"))
    await type("j")
    await keys("Enter")
    await screen("other-tool-default-reader", (text) => readerContains(text, "custom_shell [command=not a shell tool]") && !text.includes("Shell output"))
    await type("s")
    await screen("shell-returned-to-prompt", (text) => text.includes("NORMAL") && text.includes("shell draft") && !text.includes("SESSION"))
    await type("A restored")
    await screen("shell-focus-restored", (text) => text.includes("shell draft restored") && text.includes("INSERT"))
}
