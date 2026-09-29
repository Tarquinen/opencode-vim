import { expect, spyOn, test } from "bun:test"
import * as OpenTUI from "@opentui/core"
import type { TextareaRenderable } from "@opentui/core"
import { toolItem, useReaderFixture } from "../../helpers/reader"

const mount = useReaderFixture()
function shell(output = "first output\nsecond output\n", command = "printf output") {
    return toolItem("shell", "Shell summary", { status: "completed", input: { command, workdir: "/workspace" },
        content: [{ type: "text", text: output }], metadata: { exit: 0 } })
}

test("shell readers separate command and output and preserve read-only Vim controls", async () => {
    const f = await mount(shell())
    for (const text of ["Shell output", "Command", "Output", "printf output", "v select · tab switch section · s prompt"]) {
        expect(f.captureCharFrame()).toContain(text)
    }
    const command = f.renderer.currentFocusedEditor as TextareaRenderable
    expect(command.id).toBe("vim-shell-command")
    expect(command.cursorOffset).toBe(0)
    await f.keys("xviwy")
    expect(command.plainText).toBe("printf output")
    expect(f.copied.at(-1)).toBe("printf")
    f.mockInput.pressTab()
    await f.renderOnce()
    expect(f.renderer.currentFocusedEditor).toBe(f.reader())
    expect(f.reader().plainText).toBe("first output\nsecond output")
    await f.keys("xVjy")
    expect(f.reader().plainText).toBe("first output\nsecond output")
    expect(f.copied.at(-1)).toBe("first output\nsecond output\n")
    f.mockInput.pressTab()
    await f.renderOnce()
    expect(f.renderer.currentFocusedEditor).toBe(command)
    await f.keys("v")
    expect(command.hasSelection()).toBe(true)
    f.reader().focus()
    await f.renderOnce()
    expect(command.hasSelection()).toBe(false)
    await f.keys("s")
    expect(f.close).toHaveBeenCalledTimes(1)
})

test.each(["", "v", "V"])("session keymaps remap panels and release Tab in reader mode %j", async (mode) => {
    const f = await mount(shell("first output"), { keymaps: { session: { "<Tab>": "passthrough", "<C-w>w": "switch-panel" } } })
    const command = f.renderer.currentFocusedEditor as TextareaRenderable
    expect(f.captureCharFrame()).toContain("v select · <C-w>w switch section · s prompt")
    expect(f.captureCharFrame()).not.toContain("tab switch")
    await f.keys(mode)
    const selection = command.getSelectedText()
    let passed = 0
    f.renderer.keyInput.on("keypress", (event) => { if (event.name === "tab" && !event.defaultPrevented) passed++ })
    f.mockInput.pressTab()
    await f.renderOnce()
    expect(passed).toBe(1)
    expect(f.renderer.currentFocusedEditor).toBe(command)
    expect(command.getSelectedText()).toBe(selection)
    f.mockInput.pressKey("w", { ctrl: true })
    expect(f.renderer.currentFocusedEditor).toBe(command)
    await f.keys("w")
    expect(f.renderer.currentFocusedEditor).toBe(f.reader())
    expect(command.hasSelection()).toBe(false)
    expect(command.plainText).toBe("printf output")
    expect(f.reader().plainText).toBe("first output")
    f.mockInput.pressKey("w", { ctrl: true })
    command.focus()
    await f.keys("w")
    expect(f.renderer.currentFocusedEditor).toBe(command)
    expect(command.cursorOffset).toBe(7)
    f.mockInput.pressKey("w", { ctrl: true })
    f.mockInput.pressEscape()
    expect(f.back).toHaveBeenCalledTimes(1)
})

test("shell output keeps deliberate blank lines and trailing spaces", async () => {
    const f = await mount(shell("output  \n\n"))
    expect(f.reader().plainText).toBe("output  \n")
})

test("shell command highlighting preserves Unicode and an active selection", async () => {
    let finish!: (value: { highlights: [number, number, string][] }) => void
    const highlighting = spyOn(OpenTUI.getTreeSitterClient(), "highlightOnce").mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    try {
        const command = "printf '你好' | cat"
        const f = await mount(shell("你好\n", command))
        expect(highlighting).toHaveBeenCalledWith(command, "bash")
        const input = f.renderer.currentFocusedEditor as TextareaRenderable
        await f.keys("viw")
        const offset = input.cursorOffset
        finish({ highlights: [[0, 6, "function"], [7, 11, "string"], [14, 17, "function"]] })
        await f.renderOnce()
        expect(input.plainText).toBe(command)
        expect(input.getSelectedText()).toBe("printf")
        expect(input.cursorOffset).toBe(offset)
        expect(input.getLineHighlights(0)).toEqual(expect.arrayContaining([
            expect.objectContaining({ start: 7, end: 13 }), expect.objectContaining({ start: 16, end: 19 }),
        ]))
    } finally { highlighting.mockRestore() }
})

test("shell diff colors preserve Unicode output, selection and copying", async () => {
    const output = "diff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -1 +1 @@\n-hello\n+你好 👩‍💻"
    const f = await mount(shell(output, "git diff"))
    const input = f.reader()
    expect(input.getLineHighlights(4)[0]?.styleId).not.toBe(input.getLineHighlights(5)[0]?.styleId)
    expect(input.getLineHighlights(5)[0]?.end).toBe(Bun.stringWidth("+你好 👩‍💻"))
    f.mockInput.pressTab()
    await f.keys("GVy")
    expect(f.copied.at(-1)).toBe("+你好 👩‍💻\n")
    expect(input.plainText).toBe(output)
    f.mockInput.pressEscape()
    expect(f.back).toHaveBeenCalledTimes(1)
})
