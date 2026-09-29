import assert from "node:assert/strict"
import type { Fixture } from "../fixture"
import { readerContains, selected } from "../screens"

export async function pluginLifecycle({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    await type("runtime draft")
    await screen("insert", (text) => text.includes("runtime draft") && text.includes("INSERT"))
    await keys("Escape")
    await type("i")
    await screen("insert-cursor", (text) => text.includes("INSERT") && terminal.cursorStyle() === 5)
    assert.equal(terminal.cursorStyle(), 5)
    await keys("Escape")
    await type("0x")
    await screen("normal-edit", (text) => text.includes("untime draft") && text.includes("NORMAL"))
    assert.equal(terminal.cursorStyle(), 1)
    await type("u")
    await screen("undo", (text) => text.includes("runtime draft"))
    await type("yiw")
    await screen("yank", () => terminal.clipboard() === "runtime")

    // A real theme command must update the existing Solid status contribution.
    let dark = ""
    await screen("dark-status", (text, ansi) => {
        dark = statusColor(ansi)
        return text.includes("NORMAL") && !!dark
    })
    await keys("F7")
    await screen("light-status", (text, ansi) => text.includes("NORMAL") && !!statusColor(ansi) && statusColor(ansi) !== dark)

    for (const state of ["visual", "session", "reader"]) {
        if (state === "visual") {
            await type("0vl")
            await screen(`${state}-active`, (text) => text.includes("VISUAL"))
        } else {
            await type("s")
            await screen(`${state}-active`, (text) => selected(text, "one two"))
            if (state === "reader") {
                await keys("Enter")
                await screen("reader-active-modal", (text) => readerContains(text, "one two"))
            }
        }
        // Deactivate through OpenCode's plugin manager, exercising real cleanup.
        await keys(state === "visual" ? "F6" : "C-g")
        await screen(`${state}-manager`, (text) => text.includes("Plugins") && text.includes("opencode-vim"))
        await keys("Enter")
        await screen(`${state}-unloaded`, (text) => text.includes("inactive") && !text.includes("NORMAL") && !text.includes("VISUAL") && !text.includes("SESSION"))
        await keys("Escape")
        await screen(`${state}-native`, (text) => !text.includes("Plugins") && !text.includes("▎") && !text.includes("v select"))
        assert.equal(terminal.cursorStyle(), 3, "Unloading restores the host's underline cursor")
        await keys("C-a")
        await screen(`${state}-native-line-start`, (text) => text.split("\n")[terminal.cursor().y]?.indexOf("runtime draft") === terminal.cursor().x)
        await type("x")
        await screen(`${state}-native-edit`, (text) => text.includes("xruntime draft"))
        await keys("BSpace")
        await screen(`${state}-native-restored`, (text) => text.split("\n")[terminal.cursor().y]?.trim() === "┃  runtime draft")
        await keys("F6", "Enter")
        await screen(`${state}-reloaded`, (text) => text.includes("Plugins") && !text.includes("inactive") && text.includes("INSERT"))
        await keys("Escape", "Escape")
        await screen(`${state}-prompt-restored`, (text) => !text.includes("Plugins") && text.includes("runtime draft") && text.includes("INSERT"))
        await keys("Escape")
        await type("0")
        await screen(`${state}-normal-restored`, (text) => text.includes("NORMAL") && !text.includes("SESSION"))
    }
}

function statusColor(ansi: string) {
    const row = ansi.split("\n").find((line) => line.includes("NORMAL")) ?? ""
    const before = row.slice(0, row.indexOf("NORMAL"))
    let color = ""
    for (const match of before.matchAll(/\x1b\[([\d;]*)m/g)) {
        const foreground = /(?:^|;)(38;2;\d+;\d+;\d+|38;5;\d+)(?:;|$)/.exec(match[1])
        if (foreground) color = foreground[1]
    }
    return color
}
