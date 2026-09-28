import { describe, expect, test } from "bun:test"
import { createGraphemeCodec } from "./graphemes"
import { charToDisplay, createPromptMap, displayToChar, displayWidth, hostCharOffset, hostFromVimOffset, hostOffset, hostPosition, vimLineLength } from "./map"

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

describe("cached Vim positions", () => {
    for (const text of ["", "\n\n", "a中b\n👩‍💻e\u0301\tz\n", "\u200b\ue000👨‍👩‍👧‍👦\n\u0301x\u200b"]) {
        test(`matches display conversions at every boundary: ${JSON.stringify(text)}`, () => {
            const codec = createGraphemeCodec()
            const map = createPromptMap(text, codec)
            expect(map.displayWidth).toBe(displayWidth(text))

            for (let offset = -1; offset <= map.displayWidth + 1; offset++) {
                const charIndex = displayToChar(text, offset)
                expect(hostCharOffset(map, offset)).toBe(charIndex)
                const lines = codec.encode(text.slice(0, charIndex)).split("\n")
                const position = { line: lines.length - 1, col: lines[lines.length - 1].length }
                expect(hostPosition(map, offset)).toEqual(position)
                expect(hostOffset(map, position)).toBe(charToDisplay(text, charIndex))
            }
            for (let index = 0; index <= text.length; index++) {
                expect(hostFromVimOffset(map, map.hostToVim[index])).toBe(charToDisplay(text, index))
            }
        })
    }

    test("keeps empty lines and clamps positions to logical line boundaries", () => {
        const map = createPromptMap("\n中e\u0301\n👩‍💻\n")
        const lengths = [0, 2, 1, 0]
        const starts = [0, 1, 5, 8]
        const ends = [0, 4, 7, 8]
        for (let line = 0; line < lengths.length; line++) {
            expect(vimLineLength(map, line)).toBe(lengths[line])
            expect(hostOffset(map, { line, col: -1 })).toBe(starts[line])
            expect(hostOffset(map, { line, col: 100 })).toBe(ends[line])
        }
        expect(hostOffset(map, { line: -1, col: 0 })).toBe(0)
        expect(hostOffset(map, { line: 100, col: 0 })).toBe(8)
    })
})
