import type { Fixture } from "../fixture"

export async function agentSwitching({ terminal }: Fixture) {
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

    for (const [mode, sequence] of [
        ["INSERT", "i"], ["NORMAL", ""], ["VISUAL", "0vl"], ["VISUAL LINE", "V"], ["SESSION", "s"],
    ]) {
        for (let cycle = 1; cycle <= 2; cycle++) {
            const label = `${mode.toLowerCase().replaceAll(" ", "-")}-${cycle}`
            if (sequence) await type(sequence)
            await screen(`${label}-before`, (text) => text.includes(mode) && text.includes(draft))
            await keys("BTab")
            agent = agent === "Build" ? "Plan" : "Build"
            await screen(`${label}-after`, (text) => text.includes(`${agent} ·`) && text.includes(mode) && text.includes(draft))
            if (mode !== "NORMAL") await keys("Escape")
            await screen(`${label}-prompt`, (text) => text.includes("NORMAL") && text.includes(draft))
        }
    }
}
