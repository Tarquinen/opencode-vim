const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" })

// Vimee indexes JavaScript strings by UTF-16 code unit. Give each multi-unit
// grapheme one private-use character so motions, operators and registers cannot
// split it. The dictionary lives with the adapter, including its undo history.
export function createGraphemeCodec() {
    const encoded = new Map<string, string>()
    const decoded = new Map<string, string>()
    let next = 0xe000
    return {
        encode(text: string) {
            let result = ""
            for (const { segment } of segments.segment(text)) {
                const code = segment.charCodeAt(0)
                if (segment.length === 1 && (code < 0xe000 || code > 0xf8ff)) {
                    result += segment
                    continue
                }
                let token = encoded.get(segment)
                if (!token) {
                    if (next > 0xf8ff) throw new Error("Vim grapheme dictionary is full")
                    token = String.fromCharCode(next++)
                    encoded.set(segment, token)
                    decoded.set(token, segment)
                }
                result += token
            }
            return result
        },
        decode(text: string) {
            let result = ""
            for (const token of text) result += decoded.get(token) ?? token
            return result
        },
    }
}

export type GraphemeCodec = ReturnType<typeof createGraphemeCodec>
