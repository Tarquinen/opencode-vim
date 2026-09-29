import { expect, test } from "bun:test"
import { InputRenderable } from "@opentui/core"
import { usePluginFixture } from "../helpers/plugin"

const mount = usePluginFixture()

test.each(["p", "P", "2p", "2P"])("%s pastes the current desktop clipboard with Vim counts and undo", async (key) => {
    const f = await mount()
    f.input.setText("")
    f.clipboard.text = "  中 👩‍💻\r\nsecond\r\n"
    await f.keys(key)
    const text = "  中 👩‍💻\nsecond"
    expect(f.input.plainText).toBe(key.startsWith("2") ? text + "\n" + text : text)
    await f.keys("u")
    expect(f.input.plainText).toBe("")
    f.mockInput.pressKey("r", { ctrl: true })
    expect(f.input.plainText).toContain(text)
})

test("p reads external changes instead of reusing an earlier yank", async () => {
    const f = await mount()
    await f.keys("yiw")
    expect(f.clipboard.text).toBe("hello")
    f.clipboard.text = "outside"
    await f.keys("$p")
    expect(f.input.plainText).toBe("hellooutside")
    f.clipboard.text = "new"
    await f.keys("p")
    expect(f.input.plainText).toBe("hellooutsidenew")
    f.clipboard.text = ""
    await f.keys("p")
    expect(f.input.plainText).toBe("hellooutsidenew")
})

test("linewise clipboard text fills an empty prompt with no leading blank line and supports undo/redo", async () => {
    const f = await mount()
    const text = "quoted 中 👩‍💻\nsecond line"
    f.input.setText("")
    f.clipboard.text = text + "\n"
    await f.keys("p")
    expect(f.input.plainText).toBe(text)
    expect(f.input.cursorOffset).toBe(0)
    await f.keys("u")
    expect(f.input.plainText).toBe("")
    f.mockInput.pressKey("r", { ctrl: true })
    expect(f.input.plainText).toBe(text)
})

test.each(["yiw", "dd", "ciw", "x", "vlld"])("%s writes the system clipboard", async (key) => {
    const f = await mount()
    await f.keys(key)
    const expected = key === "dd" ? "hello\n" : key === "x" ? "h" : key === "vlld" ? "hel" : "hello"
    expect(f.clipboard.text).toBe(expected)
    expect(f.copied).toEqual([expected])
})

test("rapid ddp waits for the cut to reach the clipboard", async () => {
    const f = await mount()
    let finish!: () => void
    const writing = new Promise<void>((resolve) => { finish = resolve })
    f.clipboard.text = "unrelated"
    f.clipboard.host.writeText.mockImplementationOnce(async (text) => {
        await writing
        f.clipboard.text = text
        return { status: "written" }
    })
    await f.keys("ddp")
    expect(f.input.plainText).toBe("")
    expect(f.clipboard.host.read).not.toHaveBeenCalled()
    finish()
    await f.waitFor(() => f.input.plainText === "hello")
    await f.keys("u")
    expect(f.input.plainText).toBe("")
})

test("rapid cuts reach the clipboard in order before a put reads it", async () => {
    const f = await mount()
    let finish!: () => void
    const writing = new Promise<void>((resolve) => { finish = resolve })
    f.clipboard.host.writeText.mockImplementationOnce(async (text) => {
        await writing
        f.clipboard.text = text
        return { status: "written" }
    })
    await f.keys("xxp")
    expect(f.clipboard.host.writeText).toHaveBeenCalledTimes(1)
    finish()
    await f.waitFor(() => f.input.plainText === "lelo")
    expect(f.clipboard.text).toBe("e")
    expect(f.copied).toEqual(["h", "e"])
})

test("a pending paste keeps subsequent puts, native typing and bracketed paste in order", async () => {
    const f = await mount()
    f.input.setText("")
    f.clipboard.text = "A"
    let finish!: () => void
    const reading = new Promise<void>((resolve) => { finish = resolve })
    const read = f.clipboard.host.read.getMockImplementation()!
    f.clipboard.host.read.mockImplementationOnce(async () => { await reading; return read() })
    await f.keys("ppiB")
    await f.mockInput.pasteBracketedText("C")
    f.mockInput.pressEscape()
    expect(f.input.plainText).toBe("")
    finish()
    await f.waitFor(() => f.input.plainText === "ABCA")
    expect(f.input.cursorStyle.style).toBe("block")
})

test("mapped puts and dot repeat refresh the clipboard", async () => {
    const f = await mount({ keymaps: { normal: { Q: "2p" } } })
    f.input.setText("")
    f.clipboard.text = "a"
    await f.keys("Q")
    expect(f.input.plainText).toBe("aa")
    f.clipboard.text = "b"
    await f.keys(".")
    expect(f.input.plainText).toBe("aabb")
    await f.keys("u")
    expect(f.input.plainText).toBe("aa")
})

test("a mapping can yank and put without pasting stale clipboard text", async () => {
    const f = await mount({ keymaps: { normal: { Q: "yiw$p" } } })
    f.clipboard.text = "external"
    await f.keys("Q")
    expect(f.input.plainText).toBe("hellohello")
    expect(f.clipboard.text).toBe("hello")
})

test("named yanks and puts stay separate from the clipboard", async () => {
    const f = await mount()
    f.clipboard.text = "external"
    await f.keys('"ayiw$"ap')
    expect(f.input.plainText).toBe("hellohello")
    expect(f.clipboard.text).toBe("external")
    expect(f.copied).toEqual([])
    expect(f.clipboard.host.read).not.toHaveBeenCalled()
    await f.keys("p")
    expect(f.input.plainText).toBe("hellohelloexternal")
})

test("textarea and input adapters share a fallback when clipboard access fails", async () => {
    const f = await mount()
    f.clipboard.host.read.mockRejectedValue(new Error("clipboard unavailable"))
    f.clipboard.host.writeText.mockRejectedValue(new Error("clipboard unavailable"))
    f.renderer.copyToClipboardOSC52 = () => false
    const editor = new InputRenderable(f.renderer, { width: 30, value: "dialog" })
    f.renderer.root.add(editor)
    f.setMode("modal")
    f.setCommands([{ id: "dialog.select.submit" }])
    editor.focus()
    await f.keys("0yiw")
    f.setMode("base")
    f.setCommands([{ id: "prompt.submit" }])
    f.input.focus()
    await f.keys("$p")
    expect(f.input.plainText).toBe("hellodialog")
    await f.keys("0yiw")
    editor.value = ""
    f.setMode("modal")
    f.setCommands([{ id: "dialog.select.submit" }])
    editor.focus()
    await f.keys("p")
    expect(editor.value).toBe("hellodialog")
})

test("remote puts use shared yanks without reading the server's clipboard", async () => {
    const f = await mount()
    Object.defineProperty(f.renderer, "capabilities", { value: { remote: true, osc52_support: "supported" } })
    f.clipboard.text = "server clipboard"
    await f.keys("yiw$p")
    expect(f.input.plainText).toBe("hellohello")
    expect(f.clipboard.host.read).not.toHaveBeenCalled()
    expect(f.clipboard.host.writeText).not.toHaveBeenCalled()
    expect(f.copied).toEqual(["hello"])
})

test("an unavailable clipboard falls back, but an empty clipboard does not paste old text", async () => {
    const f = await mount()
    await f.keys("yiw")
    f.clipboard.host.read.mockResolvedValueOnce({ status: "unsupported" })
    await f.keys("$p")
    expect(f.input.plainText).toBe("hellohello")
    f.clipboard.host.read.mockResolvedValueOnce({ status: "empty" })
    await f.keys("p")
    expect(f.input.plainText).toBe("hellohello")
})

test.each(["focus", "edit", "cursor", "route", "toggle", "unmount"])("a pending put is cancelled on %s", async (change) => {
    const f = await mount()
    let finish!: () => void
    const reading = new Promise<void>((resolve) => { finish = resolve })
    const read = f.clipboard.host.read.getMockImplementation()!
    f.clipboard.text = "late"
    f.clipboard.host.read.mockImplementationOnce(async () => { await reading; return read() })
    await f.keys("p")
    const editor = new InputRenderable(f.renderer, { width: 30, value: "query" })
    f.renderer.root.add(editor)
    if (change === "focus") editor.focus()
    if (change === "edit") f.input.setText("edited")
    if (change === "cursor") f.input.cursorOffset = 2
    if (change === "route") f.setRoute({ type: "session", sessionID: "session-2" })
    if (change === "toggle") f.toggle()
    if (change === "unmount") f.unmount()
    await f.renderOnce()
    finish()
    await f.renderOnce()
    expect(f.input.plainText).toBe(change === "edit" ? "edited" : "hello")
    expect(editor.value).toBe("query")
})
