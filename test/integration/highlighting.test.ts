import { expect, test } from "bun:test"
import { BoxRenderable, CodeRenderable, DiffRenderable, LineNumberRenderable, rgbToHex, SyntaxStyle, TextareaRenderable, type CapturedLine } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { parsePatch } from "diff"
import { diffContent } from "../../src/readers/diff/data"
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

test("diff code colors and change backgrounds match native unified diff rendering", async () => {
    const screen = await createTestRenderer({ width: 70, height: 36 })
    const syntax = SyntaxStyle.fromStyles({
        default: { fg: "#eeeeee" }, keyword: { fg: "#ff0000" }, string: { fg: "#00ff00" },
        comment: { fg: "#888888" }, number: { fg: "#00ffff" }, variable: { fg: "#ffff00" },
        operator: { fg: "#ff00ff" }, punctuation: { fg: "#ffffff" },
    })
    const patch = [
        "--- example.ts", "+++ example.ts", "@@ -1,4 +1,4 @@",
        " // retained context", '-const greeting = "before";', '+const greeting = "你好 👩‍💻";',
        " ", '-const count = 1;', '+const count = 2;',
    ].join("\n") + "\n"
    const content = diffContent(parsePatch(patch)[0].hunks, "diff")
    try {
        const input = new TextareaRenderable(screen.renderer, {
            id: "reader", initialValue: content.text, width: 70, height: 12, textColor: "#eeeeee",
            backgroundColor: "transparent", focusedBackgroundColor: "transparent", wrapMode: "word",
        })
        const gutter = new LineNumberRenderable(screen.renderer, { id: "gutter", showLineNumbers: false, width: 70 })
        for (const [row, sign] of content.signs) {
            const background = sign === "+" ? "#003300" : "#330000"
            gutter.setLineColor(row, { gutter: background, content: background })
        }
        gutter.add(input)
        gutter.showLineNumbers = false
        const native = new DiffRenderable(screen.renderer, {
            id: "native-diff", diff: patch, view: "unified", filetype: "typescript", syntaxStyle: syntax,
            conceal: false, showLineNumbers: false, width: 70, fg: "#eeeeee", wrapMode: "word",
            addedBg: "#003300", removedBg: "#330000", contextBg: "#000000", position: "absolute", top: 18,
        })
        const surface = new BoxRenderable(screen.renderer, { id: "surface", backgroundColor: "#000000", width: 70, height: 12 })
        surface.add(gutter)
        screen.renderer.root.add(surface)
        screen.renderer.root.add(native)
        input.focus()
        await screen.renderOnce()
        const code = native.getChildren().flatMap((side) => side.getChildren()).find((child) => child instanceof CodeRenderable) as CodeRenderable
        await Promise.all([
            code.highlightingDone,
            highlightCode(input, syntax, "typescript", new AbortController().signal, screen.renderer.widthMethod),
        ])
        await screen.renderOnce()
        const frame = screen.captureSpans()
        for (let row = 0; row < content.text.split("\n").length; row++) {
            expect(colors(frame.lines[row]), `diff source line ${row + 1}`).toEqual(colors(frame.lines[18 + row]))
            expect(backgrounds(frame.lines[row]), `diff background line ${row + 1}`).toEqual(backgrounds(frame.lines[18 + row]))
        }
        for (const row of [1, 2, 4, 5]) {
            expect(frame.lines[row].spans.some((span) => span.text === "const" && rgbToHex(span.fg) === "#ff0000")).toBe(true)
            expect(frame.lines[row].spans.some((span) => rgbToHex(span.bg) === (content.signs.get(row) === "+" ? "#003300" : "#330000"))).toBe(true)
        }
        expect(input.plainText).toBe(content.text)
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

function backgrounds(line: CapturedLine) {
    const result: string[] = []
    for (const span of line.spans) {
        for (const character of span.text) result.push(rgbToHex(span.bg))
    }
    return result
}
