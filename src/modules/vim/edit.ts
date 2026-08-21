import { charToDisplay } from "./map"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

type Input = {
    plainText: string
    cursorOffset: number
    setSelection: (start: number, end: number) => void
    insertText: (text: string) => void
}

export function editInput(input: Input, value: string) {
    if (input.plainText === value) return

    const before = [...graphemes.segment(input.plainText)]
    const after = [...graphemes.segment(value)]
    let prefix = 0
    while (prefix < before.length && prefix < after.length && before[prefix].segment === after[prefix].segment) prefix++

    let suffix = 0
    while (suffix + prefix < before.length && suffix + prefix < after.length && before[before.length - suffix - 1].segment === after[after.length - suffix - 1].segment) suffix++

    const start = before[prefix]?.index ?? input.plainText.length
    const end = suffix ? before[before.length - suffix].index : input.plainText.length
    const valueEnd = suffix ? after[after.length - suffix].index : value.length
    const startOffset = charToDisplay(input.plainText, start)

    if (start === end) input.cursorOffset = startOffset
    else input.setSelection(startOffset, charToDisplay(input.plainText, end))
    input.insertText(value.slice(start, valueEnd))
}
