import { describe, expect, test } from "bun:test"
import { editInput } from "../../src/modules/vim/edit"

describe("editInput", () => {
    test("inserts without replacing unchanged placeholders", () => {
        const fixture = createFixture("[Image 1] after")

        editInput(fixture.input, "[Image 1] kafter", "unicode")

        expect(fixture.calls).toEqual([["cursor", 10], ["insert", "k"]])
    })

    test("uses display offsets for a minimal deletion", () => {
        const fixture = createFixture("中 [Image 1] abc")

        editInput(fixture.input, "中 [Image 1] ac", "unicode")

        expect(fixture.calls).toEqual([["selection", 14, 15], ["insert", ""]])
    })

    test("does not split graphemes", () => {
        const fixture = createFixture("a👩‍💻b")

        editInput(fixture.input, "axb", "unicode")

        expect(fixture.calls).toEqual([["selection", 1, 3], ["insert", "x"]])
    })

    test("uses the terminal width method when deleting or inserting after a joined emoji", () => {
        const deletion = createFixture("a👩‍💻b")
        editInput(deletion.input, "ab", "wcwidth")
        expect(deletion.calls).toEqual([["selection", 1, 5], ["insert", ""]])

        const insertion = createFixture("a👩‍💻b")
        editInput(insertion.input, "a👩‍💻xb", "wcwidth")
        expect(insertion.calls).toEqual([["cursor", 5], ["insert", "x"]])
    })

    for (const [before, after, start, end, inserted] of [
        ["a👩‍💻b", "a👩‍🔬b", 1, 3, "👩‍🔬"],
        ["a\u0301x", "a\u0300x", 0, 1, "a\u0300"],
        ["ax", "a\u0301x", 0, 1, "a\u0301"],
        ["a\u0301x", "ax", 0, 1, "a"],
        ["a🇦🇧🇨🇩z", "a🇽🇦🇧🇨🇩z", 1, 5, "🇽🇦🇧🇨🇩"],
    ] as const) {
        test(`expands shared text to whole graphemes: ${before} → ${after}`, () => {
            const fixture = createFixture(before)
            editInput(fixture.input, after, "unicode")
            expect(fixture.calls).toEqual([["selection", start, end], ["insert", inserted]])
        })
    }
})

function createFixture(plainText: string) {
    const calls: Array<["cursor", number] | ["selection", number, number] | ["insert", string]> = []
    let cursorOffset = 0
    const input = {
        plainText,
        clearSelection() {},
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
