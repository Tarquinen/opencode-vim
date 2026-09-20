import { createFixture } from "./fixture"
import { createPromptMap } from "../src/modules/vim/map"

for (const length of [1000, 5000, 10000]) {
    const fixture = await createFixture("word ".repeat(length / 5))
    try {
        const start = performance.now()
        createPromptMap(fixture.input.plainText, fixture.input)
        const mapMs = performance.now() - start
        const moveStart = performance.now()
        await fixture.keys("hl".repeat(50))
        console.log(JSON.stringify({ length, mapMs, hundredMotionsMs: performance.now() - moveStart }))
    } finally {
        fixture.dispose()
    }
}
