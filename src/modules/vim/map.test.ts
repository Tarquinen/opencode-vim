import { describe, expect, test } from "bun:test"
import { charToDisplay, displayToChar, displayWidth } from "./map"

describe("vim display offsets", () => {
    test("maps ASCII and CJK offsets", () => {
        const text = "a中b"

        expect(displayWidth(text)).toBe(4)
        expect(charToDisplay(text, 2)).toBe(3)
        expect(displayToChar(text, 2)).toBe(1)
        expect(displayToChar(text, 3)).toBe(2)
    })

    test("does not split supplementary characters", () => {
        const text = "𠀀x"

        expect(displayWidth(text)).toBe(3)
        expect(charToDisplay(text, 1)).toBe(0)
        expect(charToDisplay(text, 2)).toBe(2)
        expect(displayToChar(text, 1)).toBe(0)
        expect(displayToChar(text, 2)).toBe(2)
    })

    test("does not split grapheme clusters", () => {
        const emoji = "👨‍👩‍👧‍👦"
        const accent = "e\u0301"

        expect(displayWidth(emoji)).toBe(2)
        expect(charToDisplay(emoji, 1)).toBe(0)
        expect(displayToChar(emoji, 1)).toBe(0)
        expect(displayToChar(emoji, 2)).toBe(emoji.length)
        expect(displayWidth(accent)).toBe(1)
        expect(charToDisplay(accent, 1)).toBe(0)
        expect(displayToChar(accent, 1)).toBe(accent.length)
    })

    test("counts newlines as textarea offsets", () => {
        const text = "中\nx"

        expect(displayWidth(text)).toBe(4)
        expect(displayToChar(text, 2)).toBe(1)
        expect(displayToChar(text, 3)).toBe(2)
        expect(charToDisplay(text, 2)).toBe(3)
    })
})
