import { expect, test } from "bun:test"
import { textItem, useReaderFixture } from "../../helpers/reader"

const mount = useReaderFixture()

test("reader selects and copies characters and lines, and remembers its cursor", async () => {
    const f = await mount(textItem("one two\nsecond line"))
    expect(f.setDialog).toHaveBeenCalledWith({ size: "large", centered: true })
    expect(f.reader().showCursor).toBe(true)
    await f.keys("wvll")
    expect(f.reader().getSelectedText()).toBe("two")
    expect(f.captureCharFrame()).toContain("VISUAL")
    await f.keys("y")
    expect(f.copied).toEqual(["two"])
    await f.reopen()
    expect(f.reader().cursorOffset).toBe(4)
    await f.keys("Vjy")
    expect(f.copied.at(-1)).toBe("one two\nsecond line\n")
})

test("linewise copies preserve Unicode and append exactly one newline", async () => {
    const text = "quoted 中 👩‍💻\nsecond line"
    const f = await mount(textItem(text))
    await f.keys("Vjy")
    expect(f.copied).toEqual([text + "\n"])
})

test("reader blocks edits, custom editing maps and bracketed paste", async () => {
    const text = "six words here\nmore words"
    const f = await mount(textItem(text), { keymaps: { normal: { j: "dd", Q: "insert" } } })
    await f.keys("iaAoOdDcxpru.Q")
    await f.mockInput.pasteBracketedText("MUTATION")
    expect(f.reader().plainText).toBe(text)
    expect(f.captureCharFrame()).toContain("v select · s prompt")
    await f.keys("0fs")
    expect(f.close).not.toHaveBeenCalled()
    await f.keys("0yiw")
    expect(f.copied.at(-1)).toBe("six")
    await f.keys("j")
    expect(f.reader().cursorOffset).toBeGreaterThan(0)
    expect(f.reader().plainText).toBe(text)
    await f.keys("s")
    expect(f.close).toHaveBeenCalledTimes(1)
})

test("session Tab passthrough hides panel hints and keeps the reader read-only", async () => {
    const f = await mount(textItem("one two"), { keymaps: { session: { "<Tab>": "passthrough" } } })
    expect(f.captureCharFrame()).toContain("v select · s prompt")
    expect(f.captureCharFrame()).not.toContain("switch")
    let passed = 0
    f.renderer.keyInput.on("keypress", (event) => { if (event.name === "tab" && !event.defaultPrevented) passed++ })
    f.mockInput.pressTab()
    await f.keys("xw")
    expect(passed).toBe(1)
    expect(f.reader().plainText).toBe("one two")
    expect(f.reader().cursorOffset).toBe(4)
})

test("session passthrough ignores prompt mappings and preserves cursor and text", async () => {
    const f = await mount(textItem("first message\nlast message"), { keymaps: {
        normal: { j: "x" }, session: { j: "passthrough", "<Tab>": "passthrough", "<C-w>w": "switch-panel" },
    } })
    const passed: string[] = []
    f.renderer.keyInput.on("keypress", (event) => { if (!event.defaultPrevented) passed.push(event.ctrl ? `ctrl+${event.name}` : event.name) })
    f.mockInput.pressTab()
    f.mockInput.pressKey("w", { ctrl: true })
    await f.keys("j")
    expect(passed).toEqual(["tab", "ctrl+w", "j"])
    expect(f.reader().cursorOffset).toBe(0)
    expect(f.reader().plainText).toBe("first message\nlast message")
})

test("custom session keys respect pending motions and visual selections", async () => {
    const f = await mount(textItem("one q answer"), { sessionKey: "q" })
    expect(f.captureCharFrame()).toContain("v select · q prompt")
    await f.keys("sfq")
    expect(f.reader().cursorOffset).toBe(4)
    expect(f.close).not.toHaveBeenCalled()
    await f.keys("vq")
    expect(f.close).not.toHaveBeenCalled()
    expect(f.captureCharFrame()).toContain("VISUAL")
    f.mockInput.pressEscape()
    await f.keys("q")
    expect(f.close).toHaveBeenCalledTimes(1)
})

test.each(["s", "c"])("Ctrl+%s closes the reader unless a host leader is pending", async (key) => {
    const f = await mount(textItem("Answer"), { sessionKey: `<C-${key}>` })
    expect(f.captureCharFrame()).toContain(`<C-${key}> prompt`)
    f.setPending([{ key: "ctrl+x" }])
    f.mockInput.pressKey(key, { ctrl: true })
    expect(f.close).not.toHaveBeenCalled()
    f.setPending([])
    f.mockInput.pressKey(key, { ctrl: true })
    expect(f.close).toHaveBeenCalledTimes(1)
})

test("streaming props leave the active snapshot and selection stable until reopened", async () => {
    const f = await mount(textItem("hello"))
    await f.keys("vll")
    f.setItem(textItem("hello world"))
    await f.renderOnce()
    expect(f.reader().plainText).toBe("hello")
    expect(f.reader().getSelectedText()).toBe("hel")
    f.mockInput.pressEscape()
    await f.renderOnce()
    expect(f.reader().showCursor).toBe(true)
    expect(f.reader().hasSelection()).toBe(false)
    await f.reopen()
    expect(f.reader().plainText).toBe("hello world")
})

test("paging and resizing retain text and the remembered position", async () => {
    const text = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join("\n")
    const f = await mount(textItem(text))
    f.mockInput.pressKey("d", { ctrl: true })
    f.mockInput.pressKey("f", { ctrl: true })
    await f.renderOnce()
    expect(f.reader().scrollY).toBeGreaterThan(0)
    expect(f.reader().height).toBeLessThan(f.renderer.height / 2)
    f.resize(44, 20)
    await f.renderOnce()
    expect(f.reader().plainText).toBe(text)
    const offset = f.reader().cursorOffset
    await f.reopen()
    expect(f.reader().cursorOffset).toBe(offset)
    f.mockInput.pressKey("u", { ctrl: true })
    expect(f.reader().cursorOffset).toBeLessThan(offset)
})

test("Escape cancels selection before returning; close button and Ctrl+C request back", async () => {
    const f = await mount(textItem("one two three"))
    await f.keys("wv")
    f.mockInput.pressEscape()
    expect(f.back).not.toHaveBeenCalled()
    f.mockInput.pressEscape()
    expect(f.back).toHaveBeenCalledTimes(1)
    const close = f.renderer.root.findDescendantById("vim-message-close")!
    await f.mockMouse.click(close.x, close.y)
    expect(f.back).toHaveBeenCalledTimes(2)
    f.mockInput.pressKey("c", { ctrl: true })
    expect(f.back).toHaveBeenCalledTimes(3)
    const listeners = f.renderer.keyInput.listenerCount("keypress")
    f.unmount()
    await f.renderOnce()
    expect(f.reader()).toBeUndefined()
    expect(f.renderer.keyInput.listenerCount("keypress")).toBe(listeners - 1)
    f.mockInput.pressKey("c", { ctrl: true })
    expect(f.back).toHaveBeenCalledTimes(3)
})
