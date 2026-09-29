import type { DiffView } from "../../../src/modules/vim/config"
import type { Fixture } from "../fixture"
import { reader, readerContains, selected } from "../screens"

export function diffReader(initial: DiffView = "after", remapped = false) {
    return async ({ terminal }: Fixture) => {
        const { keys, type, screen, click } = terminal
        await type("diff draft")
        await keys("Escape")
        await screen("normal", (text) => text.includes("NORMAL"))
        await type("s")
        await screen("session", (text) => selected(text, "Change fixtures ready"))
        await type("gg")
        await screen("first-message", (text) => selected(text, "Update the fixture files"))
        await type("j")
        let grouped = false
        await screen("changes", (text) => {
            grouped = selected(text, "3 edits")
            return grouped || selected(text, "Patched first.ts")
        })
        if (grouped) {
            await keys("Enter")
            await screen("expanded", (text) => text.includes("Edit edited-two.ts"))
            await type("j")
        }
        await keys("Enter")
        const views: DiffView[] = ["after", "before", "diff"]
        let view = initial
        for (let step = 0; step < 3; step++) {
            await screen(`view-${view}`, (text, ansi) => {
                const modal = reader(text)
                if (!modal) return false
                const content = modal.content
                if (!content.includes(description(view)) || !content.includes("Saved excerpts")) return false
                if (!/After.*Before.*Diff/.test(content)) return false
                if (!text.includes(`v select · ${remapped ? "<C-w>w" : "tab"} switch view · s prompt`)) return false
                if (content.includes("old first") !== (view !== "after")) return false
                if (content.includes("new first") !== (view !== "before")) return false
                if (content.includes("old last") !== (view !== "after")) return false
                if (content.includes("new last") !== (view !== "before")) return false
                if (view !== "diff") return true
                if (!/1\s*-\s*const first/.test(content) || !/1\s*\+\s*const first/.test(content)) return false
                const rows = text.split("\n")
                const ansiRows = ansi.split("\n")
                for (const value of ["old", "new"]) {
                    const row = rows.findIndex((line, index) => index > modal.top && index < modal.bottom
                        && line.slice(modal.left, modal.right).includes(`const first = "${value} first"`))
                    const colored = ansiRows[row] ?? ""
                    if (!/\x1b\[[\d;]*mconst\x1b\[/.test(colored)) return false
                    if (!/\x1b\[[\d;]*m"(?:old|new) first"\x1b\[/.test(colored)) return false
                    if (!/48;[25];/.test(colored)) return false
                }
                return true
            })
            await type("Vy")
            await screen(`copy-${view}`, (text) => text.includes("Copied"))
            await switchView()
            view = views[(views.indexOf(view) + 1) % views.length]
        }
        await screen("initial-view-restored", (text) => readerContains(text, description(initial)))
        const clicked = initial === "before" ? "after" : "before"
        let target = { x: 0, y: 0 }
        await screen("click-target", (text) => {
            const rows = text.split("\n")
            const y = rows.findIndex((row) => /View.*After.*Before.*Diff/.test(row))
            if (y < 0) return false
            target = { x: rows[y].indexOf(label(clicked)), y }
            return target.x >= 0
        })
        await click(target.x, target.y)
        await screen("clicked-view", (text) => readerContains(text, description(clicked))
            && readerContains(text, clicked === "after" ? "new first" : "old first"))
        await type("G")
        await screen("last-change", (text) => /20\s+const last/.test(reader(text)?.content ?? "")
            && text.split("\n")[terminal.cursor().y]?.includes("last") === true)
        await type("Vy")
        await screen("last-change-copied", (text) => text.includes("Copied"))
        await type("gg")
        await screen("first-change", (text) => text.split("\n")[terminal.cursor().y]?.includes("first") === true)
        await type("s")
        await screen("prompt-restored", (text) => text.includes("diff draft") && text.includes("NORMAL") && !text.includes("SESSION"))
        await type("A restored")
        await screen("prompt-editing", (text) => text.includes("diff draft restored") && text.includes("INSERT"))

        async function switchView() {
            if (!remapped) return keys("Tab")
            await keys("C-w")
            await type("w")
        }
    }
}

function label(view: DiffView) {
    return view === "after" ? "After" : view === "before" ? "Before" : "Diff"
}

function description(view: DiffView) {
    return view === "diff" ? "Changes" : `Code ${view} change`
}
