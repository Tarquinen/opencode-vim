import { expect, test } from "bun:test"
import { CodeRenderable, rgbToHex, SyntaxStyle, TextareaRenderable, type CapturedLine } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { highlightCode } from "../../src/readers/syntax"

test("multiline reader colors match native code rendering with the real TypeScript parser", async () => {
    const screen = await createTestRenderer({ width: 70, height: 32 })
    const syntax = SyntaxStyle.fromStyles({
        default: { fg: "#eeeeee" },
        keyword: { fg: "#ff0000" },
        string: { fg: "#00ff00" },
        comment: { fg: "#888888" },
        number: { fg: "#00ffff" },
        variable: { fg: "#ffff00" },
        operator: { fg: "#ff00ff" },
        punctuation: { fg: "#ffffff" },
    })
    const text = [
        "",
        'const greeting = "你好 👩‍💻";',
        "\tconst count = 2;",
        "",
        "/* first comment line",
        "   second comment line */",
        "const text = `value ${count}`;",
        'const last = "done";',
    ].join("\n")
    try {
        const input = new TextareaRenderable(screen.renderer, {
            id: "reader", initialValue: text, width: 70, height: 12, textColor: "#eeeeee", wrapMode: "word",
        })
        const code = new CodeRenderable(screen.renderer, {
            id: "native-code", content: text, filetype: "typescript", syntaxStyle: syntax, conceal: false,
            width: 70, height: 12, fg: "#eeeeee", wrapMode: "word", position: "absolute", top: 16,
        })
        screen.renderer.root.add(input)
        screen.renderer.root.add(code)
        await screen.renderOnce()
        await Promise.all([
            code.highlightingDone,
            highlightCode(input, syntax, "typescript", new AbortController().signal, screen.renderer.widthMethod),
        ])
        await screen.renderOnce()
        const frame = screen.captureSpans()
        expect(frame.lines[17].spans.some((span) => rgbToHex(span.fg) === "#ff0000")).toBe(true)
        for (let line = 0; line < text.split("\n").length; line++) {
            expect(colors(frame.lines[line]), `source line ${line + 1}`).toEqual(colors(frame.lines[16 + line]))
        }
        expect(input.plainText).toBe(text)
    } finally {
        screen.renderer.destroy()
        syntax.destroy()
    }
}, 15_000)

function colors(line: CapturedLine) {
    const result: Array<[string, string]> = []
    for (const span of line.spans) {
        for (const character of span.text) result.push([character, rgbToHex(span.fg)])
    }
    return result
}
