import type { Fixture } from "../fixture"

export async function dialogFocus({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    for (const mode of ["INSERT", "NORMAL"]) {
        const label = `dialog-${mode.toLowerCase()}`
        await type("original draft")
        await screen(`${label}-draft`, (text) => text.includes("original draft"))
        if (mode === "NORMAL") await keys("Escape")
        await screen(`${label}-prompt-mode`, (text) => text.includes(mode))
        await keys("C-p")
        await screen(`${label}-opened`, (text) => text.includes("Commands") && text.includes(mode))
        if (mode === "NORMAL") {
            await type("i")
            await screen(`${label}-insert`, (text) => text.includes("Commands") && text.includes("INSERT"))
        }
        await type("Open settings")
        await screen(`${label}-filtered`, (text) => text.includes("Open settings") && !text.includes("New session"))
        await keys("Escape")
        await screen(`${label}-normal`, (text) => text.includes("Commands") && text.includes("NORMAL"))
        await type("0dw")
        await screen(`${label}-edited`, (text) => /^\s+settings\s*$/m.test(text) && text.includes("Open settings"))
        await type("u")
        await screen(`${label}-undo`, (text) => /^\s+Open settings\s*$/m.test(text))
        await keys("C-r")
        await screen(`${label}-redo`, (text) => /^\s+settings\s*$/m.test(text))
        await keys("Escape")
        await screen(`${label}-closed`, (text) => !text.includes("Commands") && text.includes("original draft") && text.includes(mode))
        if (mode === "NORMAL") {
            await type("A")
            await screen(`${label}-resume-insert`, (text) => text.includes("INSERT"))
        }
        await type(" restored")
        await screen(`${label}-restored`, (text) => text.includes("original draft restored"))
        await keys("Escape")
        await screen(`${label}-prompt-normal`, (text) => text.includes("NORMAL"))
        await type("0dw")
        await screen(`${label}-prompt-edited`, (text) => text.includes("draft restored") && !text.includes("original"))
        await type("i")
        await screen(`${label}-prompt-insert`, (text) => text.includes("INSERT"))
        await keys("C-c")
        await screen(`${label}-cleared`, (text) => !text.includes("draft restored"))
    }

    await keys("C-p", "Escape")
    await screen("dialog-navigation-start", (text) => text.includes("Commands") && text.includes("Switch session") && text.includes("NORMAL"))
    await type("j".repeat(30))
    await screen("dialog-scrolled-down", (text) => text.includes("Commands") && !text.includes("Switch session"))
    await type("k".repeat(30))
    await screen("dialog-scrolled-up", (text) => text.includes("Commands") && text.includes("Switch session"))
    await type("iOpen settings")
    await screen("dialog-submit-filter", (text) => text.includes("Open settings") && !text.includes("Switch session"))
    await keys("Escape")
    await screen("dialog-submit-normal", (text) => text.includes("Commands") && text.includes("NORMAL"))
    await keys("Enter")
    await screen("dialog-submitted", (text) => text.includes("Settings") && !text.includes("Commands") && text.includes("INSERT"))
    await keys("Escape")
    await screen("dialog-settings-normal", (text) => text.includes("Settings") && text.includes("NORMAL"))
    await keys("Escape")
    await screen("dialog-submit-closed", (text) => !text.includes("Settings") && text.includes("INSERT"))
    await type("after dialog submit")
    await screen("dialog-submit-focus", (text) => text.includes("after dialog submit") && text.includes("INSERT"))
}
