import type { Fixture } from "../fixture"

export async function tabSwitching({ terminal, sessionTitle }: Fixture) {
    const { keys, type, screen } = terminal
    for (let cycle = 1; cycle <= 10; cycle++) {
        const label = `tab-${String(cycle).padStart(2, "0")}`
        await keys("C-x", "n")
        await screen(`${label}-new`, (text) => text.split("\n")[0].includes("New session") && text.includes("INSERT"))
        await type(`alpha beta gamma cycle${cycle}`)
        await screen(`${label}-typed`, (text) => text.includes(`alpha beta gamma cycle${cycle}`))
        await keys("Escape")
        await screen(`${label}-normal`, (text) => text.includes("NORMAL"))
        await type("0dw")
        await screen(`${label}-edited`, (text) => text.includes(`beta gamma cycle${cycle}`) && !text.includes("alpha"))
        await type("i")
        await screen(`${label}-insert`, (text) => text.includes("INSERT"))
        await keys("C-c")
        await screen(`${label}-cleared`, (text) => !text.includes(`beta gamma cycle${cycle}`) && text.includes("INSERT"))
        await keys("C-x", "1")
        await screen(`${label}-returned`, (text) => text.includes(sessionTitle) && !text.split("\n")[0].includes("New session"))
    }
}
