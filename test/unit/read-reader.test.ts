import { expect, test } from "bun:test"
import { readSnapshot } from "../../src/readers/read/data"
import type { TranscriptSource } from "../../src/transcript-items"

type Tool = Extract<TranscriptSource, { type: "tool" }>
function tool(text: string, truncated = false): Tool {
    return { type: "tool", id: "read-1", name: "read", time: { created: 1 }, state: {
        status: "completed", input: { path: "requested.ts" }, content: [{ type: "text", text }], metadata: { truncated },
    } }
}

test("read snapshots use returned paths and line ranges without copying number prefixes", () => {
    expect(readSnapshot(tool("Read file src/你好 file.ts, lines 41-44\n41:   const value = '你好';  \n42: 1: literal content\n43: \n44: \n[Output truncated. Continue reading with offset: 45]")))
        .toEqual({ path: "src/你好 file.ts", text: "  const value = '你好';  \n1: literal content\n\n", start: 41, end: 44, partial: true, clipped: false })
})

test("read snapshots distinguish empty files, blank lines, and complete files", () => {
    expect(readSnapshot(tool("Read file empty.txt, 0 lines")))
        .toMatchObject({ text: "", start: 1, end: 0, partial: false })
    expect(readSnapshot(tool("Read file blank.txt, lines 1-1\n1: ")))
        .toMatchObject({ text: "", start: 1, end: 1, partial: false })
    expect(readSnapshot(tool("Read file full.ts, lines 1-2\r\n1: one\r\n2: two")))
        .toMatchObject({ text: "one\ntwo", start: 1, end: 2, partial: false })
    expect(readSnapshot(tool("Read file tail.txt, lines 8-8\n8: last"))?.partial).toBe(true)
})

test("read snapshots retain truncation notices and clipped line content", () => {
    expect(readSnapshot(tool("Read file huge.ts, lines 1-1\n1: preview", true))?.partial).toBe(true)
    const line = "x".repeat(2000) + "... (line truncated to 2000 chars)"
    expect(readSnapshot(tool(`Read file long.txt, lines 1-1\n1: ${line}`)))
        .toMatchObject({ text: line, partial: true, clipped: true })
})

test.each([
    "Read directory src, entries 1-2\none.ts\ntwo.ts",
    "Image read successfully",
    "Custom read result",
    "Read file file.ts, lines 4-3",
    "Read file file.ts, lines 4-5\n4: only one line",
    "Read file file.ts, lines 4-5\n4: first\n6: second",
    "Read file file.ts, lines 4-5\n4: first\n5: second\nextra content",
])("unrecognized read results retain the generic reader: %s", (text) => {
    expect(readSnapshot(tool(text))).toBeUndefined()
})

test("incomplete, failed, and media reads are not treated as source code", () => {
    const source = tool("")
    for (const state of [
        { status: "streaming", input: "{\"path\":" },
        { status: "running", input: { path: "file.ts" }, metadata: {} },
        { status: "error", input: { path: "file.ts" }, error: { type: "tool", message: "File not found" } },
        { status: "completed", input: { path: "image.png" }, content: [{ type: "text", text: "Image read successfully" }, { type: "file", mime: "image/png", uri: "data:image/png;base64,AAAA" }] },
    ] satisfies Tool["state"][]) {
        expect(readSnapshot({ ...source, state })).toBeUndefined()
    }
})
