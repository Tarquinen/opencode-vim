import { describe, expect, test } from "bun:test"
import { editInput } from "./edit"

describe("editInput", () => {
    test("inserts without replacing unchanged placeholders", () => {
        const fixture = createFixture("[Image 1] after")

        editInput(fixture.input, "[Image 1] kafter")

        expect(fixture.calls).toEqual([["cursor", 10], ["insert", "k"]])
    })

    test("uses display offsets for a minimal deletion", () => {
        const fixture = createFixture("中 [Image 1] abc")

        editInput(fixture.input, "中 [Image 1] ac")

        expect(fixture.calls).toEqual([["selection", 14, 15], ["insert", ""]])
    })

    test("does not split graphemes", () => {
        const fixture = createFixture("a👩‍💻b")

        editInput(fixture.input, "axb")

        expect(fixture.calls).toEqual([["selection", 1, 3], ["insert", "x"]])
    })
})

function createFixture(plainText: string) {
    const calls: Array<["cursor", number] | ["selection", number, number] | ["insert", string]> = []
    let cursorOffset = 0
    const input = {
        plainText,
        get cursorOffset() {
            return cursorOffset
        },
        set cursorOffset(value: number) {
            cursorOffset = value
            calls.push(["cursor", value])
        },
        setSelection(start: number, end: number) {
            calls.push(["selection", start, end])
        },
        insertText(text: string) {
            calls.push(["insert", text])
        },
    }
    return { input, calls }
}
