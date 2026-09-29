import assert from "node:assert/strict"
import type { Fixture } from "../support/fixture"

export async function agentSwitching({ terminal }: Fixture, mapped = false) {
    const { keys, type, screen } = terminal
    const draft = "agent switching draft"
    let agent = ""
    await type(draft)
    await screen("draft", (text) => {
        agent = /┃\s+(Build|Plan) ·/.exec(text)?.[1] ?? ""
        return text.includes(draft) && !!agent
    })
    await keys("Escape")
    await screen("initial-normal", (text) => text.includes("NORMAL"))

    if (mapped) {
        await type("0")
        await keys("Tab")
        await screen("mapped-tab", (text) => text.includes("gent switching draft") && !text.includes(draft)
            && text.includes(`${agent} ·`) && text.includes("NORMAL"))
        await type("u")
        await screen("mapped-tab-undo", (text) => text.includes(draft) && text.includes("NORMAL"))
    }
    const modes = mapped ? [["NORMAL", ""]] : [
        ["INSERT", "i"], ["NORMAL", ""], ["VISUAL", "0vl"], ["VISUAL LINE", "V"], ["SESSION", "s"],
    ]
    for (const [mode, sequence] of modes) {
        for (let cycle = 1; cycle <= 2; cycle++) {
            const label = `${mode.toLowerCase().replaceAll(" ", "-")}-${cycle}`
            if (sequence) await type(sequence)
            await screen(`${label}-before`, (text) => text.includes(mode) && text.includes(draft))
            const cursor = terminal.cursor()
            await keys("BTab")
            agent = agent === "Build" ? "Plan" : "Build"
            await screen(`${label}-after`, (text) => text.includes(`${agent} ·`) && text.includes(mode) && text.includes(draft))
            if (mode !== "SESSION") assert.deepEqual(terminal.cursor(), cursor)
            if (mode.startsWith("VISUAL")) {
                await type("y")
                await screen(`${label}-selection-preserved`, (text) => text.includes("NORMAL"))
                assert.equal(terminal.clipboard(), mode === "VISUAL" ? "ag" : draft + "\n")
            }
            if (mode !== "NORMAL") await keys("Escape")
            await screen(`${label}-prompt`, (text) => text.includes("NORMAL") && text.includes(draft))
        }
    }
}
