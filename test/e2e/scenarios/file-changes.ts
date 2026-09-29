import type { Fixture } from "../fixture"
import { reader, selected } from "../screens"

export async function fileChanges({ terminal }: Fixture) {
    const { keys, type, screen } = terminal
    const names = ["first.ts", "added.ts", "deleted.ts", "edited-one.ts", "edited-two.ts"]
    await type("change draft")
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
        await screen("changes-expanded", (text) => text.includes("Edit edited-two.ts"))
        await type("j")
    }
    for (const [index, name] of names.entries()) {
        await screen(`file-${index}-selected`, (text) => selectionIs(text, name))
        await keys("Enter")
        await screen(`file-${index}-reader`, (text) => {
            const modal = reader(text)
            if (!modal) return false
            const content = text.split("\n").slice(modal.top, modal.bottom).map((row) => row.slice(modal.left, modal.right)).join("\n")
            if (!content.includes(name)) return false
            for (const other of names) {
                if (other !== name && content.includes(other)) return false
            }
            return true
        })
        await keys("Escape")
        await screen(`file-${index}-returned`, (text) => selectionIs(text, name) && !text.includes("v select"))
        await type("j")
    }
    await screen("after-changes", (text) => selected(text, "Change fixtures ready"))
    await type("3k")
    await screen("count-backward", (text) => selected(text, "deleted.ts") && !selected(text, "added.ts"))
    await type("2k")
    await screen("first-patch", (text) => selectionIs(text, "first.ts"))
    await type("s")
    await screen("prompt-restored", (text) => text.includes("change draft") && text.includes("NORMAL") && !text.includes("SESSION"))

    function selectionIs(text: string, name: string) {
        if (!text.includes("▎")) return false
        for (const other of names) {
            if (other !== name && selected(text, other)) return false
        }
        // A partially visible file can be selected while its header is offscreen.
        return selected(text, name) || !text.includes(name)
    }
}
