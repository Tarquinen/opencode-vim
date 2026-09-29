import { expect, test } from "bun:test"
import { InputRenderable, RGBA, TextareaRenderable } from "@opentui/core"
import { createEffect, createRoot, createSignal } from "solid-js"
import { usePluginFixture } from "../helpers/plugin"

const mount = usePluginFixture()

test("focus callbacks do not subscribe caller effects to Vim or keymap state", async () => {
    const f = await mount({ defaultMode: "insert" })
    const other = new TextareaRenderable(f.renderer, { height: 3, width: 40 })
    f.renderer.root.add(other)
    const [input, setInput] = createSignal(other)
    let focusRuns = 0
    const stop = createRoot((dispose) => {
        createEffect(() => { focusRuns++; input().focus() })
        return dispose
    })
    try {
        expect(f.renderer.currentFocusedEditor).toBe(other)
        expect(focusRuns).toBe(1)
        f.setCommands([{ id: "prompt.submit" }, { id: "prompt.history.previous" }])
        expect(focusRuns).toBe(1)
        f.mockInput.pressEscape()
        await f.renderOnce()
        expect(other.cursorStyle.style).toBe("block")
        expect(focusRuns).toBe(1)
        setInput(f.input)
        expect(f.renderer.currentFocusedEditor).toBe(f.input)
        expect(focusRuns).toBe(2)
        await f.keys("i")
        expect(f.input.cursorStyle.style).toBe("line")
        expect(focusRuns).toBe(2)
    } finally { stop() }
})

test("plugin intercepts keys before an already-focused textarea", async () => {
    const f = await mount()
    f.mockInput.pressKey("x")
    expect(f.input.plainText).toBe("ello")
    expect(f.input.cursorStyle.style).toBe("block")
})

test("mode status, colors and toggle update without polling", async () => {
    const f = await mount()
    expect(f.captureCharFrame()).toContain("NORMAL")
    await f.keys("i")
    expect(f.captureCharFrame()).toContain("INSERT")
    expect(f.input.cursorStyle.style).toBe("line")
    f.setSuccess(RGBA.fromHex("#ff00ff"))
    await f.renderOnce()
    const status = f.captureSpans().lines.flatMap((line) => line.spans).find((span) => span.text.includes("INSERT"))
    expect(status?.fg).toEqual(RGBA.fromHex("#ff00ff"))
    f.mockInput.pressEscape()
    await f.renderOnce()
    const normalFrame = f.captureCharFrame()
    await f.keys("d")
    expect(f.captureCharFrame()).toBe(normalFrame)
    f.toggle()
    await f.renderOnce()
    expect(f.captureCharFrame()).not.toContain("NORMAL")
    f.mockInput.pressKey("X", { shift: true })
    expect(f.input.plainText).toContain("X")
})

test("insert-mode startup updates the status on Escape and kj", async () => {
    const f = await mount({ defaultMode: "insert", keymaps: { insert: { kj: "normal" } } })
    expect(f.captureCharFrame()).toContain("INSERT")
    f.mockInput.pressEscape()
    await f.renderOnce()
    expect(f.captureCharFrame()).toContain("NORMAL")
    expect(f.captureCharFrame()).not.toContain("INSERT")
    expect(f.input.cursorStyle.style).toBe("block")
    await f.keys("i")
    expect(f.captureCharFrame()).toContain("INSERT")
    const insertFrame = f.captureCharFrame()
    await f.keys("k")
    expect(f.captureCharFrame()).toBe(insertFrame)
    await f.keys("j")
    expect(f.captureCharFrame()).toContain("NORMAL")
    expect(f.captureCharFrame()).not.toContain("INSERT")
    await f.keys("v")
    expect(f.captureCharFrame()).toContain("VISUAL")
})

test("focus changes restore the editor's original cursor", async () => {
    const f = await mount()
    await f.keys("i")
    expect(f.input.cursorStyle.style).toBe("line")
    f.input.blur()
    expect(f.input.cursorStyle.style).toBe("block")
    f.input.focus()
    expect(f.input.cursorStyle.style).toBe("line")
})

test("shortcuts and pending leader sequences are not consumed", async () => {
    const f = await mount()
    const received: string[] = []
    f.renderer.keyInput.on("keypress", (event) => { received.push(event.name); event.preventDefault() })
    f.mockInput.pressKey("x", { ctrl: true })
    f.setPending([{ key: "ctrl+x" }])
    f.mockInput.pressKey("p")
    expect(received).toEqual(["x", "p"])
    expect(f.input.plainText).toBe("hello")
})

test.each([["normal", ""], ["insert", "i"], ["visual", "vl"], ["visual-line", "V"]])(
    "Shift+Tab is not consumed or changes %s mode or selection", async (_mode, keys) => {
        const f = await mount()
        await f.keys(keys)
        const frame = f.captureCharFrame()
        const offset = f.input.cursorOffset
        const selection = f.input.getSelectedText()
        let received = 0
        f.renderer.keyInput.on("keypress", (event) => {
            if (event.name !== "tab" || !event.shift) return
            received++; event.preventDefault()
        })
        f.mockInput.pressKey("TAB", { shift: true })
        await f.renderOnce()
        expect(received).toBe(1)
        expect(f.captureCharFrame()).toBe(frame)
        expect(f.input.cursorOffset).toBe(offset)
        expect(f.input.getSelectedText()).toBe(selection)
        expect(f.input.plainText).toBe("hello")
    },
)

test("a plain Tab mapping does not capture Shift+Tab", async () => {
    const f = await mount({ keymaps: { normal: { "<Tab>": "x" } } })
    const received: boolean[] = []
    f.renderer.keyInput.on("keypress", (event) => { received.push(event.shift); event.preventDefault() })
    f.mockInput.pressKey("TAB", { shift: true })
    expect(received).toEqual([true])
    expect(f.input.plainText).toBe("hello")
    f.mockInput.pressKey("TAB")
    expect(received).toEqual([true])
    expect(f.input.plainText).toBe("ello")
})

test("unmount removes handlers and restores native editing", async () => {
    const f = await mount()
    const listeners = f.renderer.keyInput.listenerCount("keypress")
    await f.keys("v")
    expect(f.input.hasSelection()).toBe(true)
    f.unmount()
    await f.renderOnce()
    expect(f.renderer.keyInput.listenerCount("keypress")).toBe(listeners - 2)
    expect(f.input.hasSelection()).toBe(false)
    expect(f.captureCharFrame()).not.toContain("VISUAL")
    f.mockInput.pressKey("x")
    expect(f.input.plainText).toBe("xhello")
})

test("InputRenderable edits and undo emit input events", async () => {
    const f = await mount()
    const input = new InputRenderable(f.renderer, { width: 30, value: "hello" })
    f.renderer.root.add(input)
    f.setMode("modal")
    f.setCommands([{ id: "dialog.select.submit" }])
    input.focus()
    const queries: string[] = []
    input.on("input", (value: string) => queries.push(value))
    await f.keys("0x")
    expect(input.value).toBe("ello")
    expect(queries).toEqual(["ello"])
    await f.keys("u")
    expect(input.value).toBe("hello")
    expect(queries).toEqual(["ello", "hello"])
    await f.keys("dw")
    expect(input.value).toBe("")
    expect(queries.at(-1)).toBe("")
    expect(f.input.plainText).toBe("hello")
})

test("unrecognized modal inputs keep native behavior", async () => {
    const f = await mount()
    const input = new InputRenderable(f.renderer, { width: 30, value: "" })
    f.renderer.root.add(input)
    f.setMode("modal")
    f.setCommands([])
    input.focus()
    await f.keys("xj")
    expect(input.value).toBe("xj")
    expect(f.dispatched).toEqual([])
})

test("dialog command dispatch requires idle normal mode and respects mappings", async () => {
    const f = await mount({ keymaps: { normal: { jj: "x" }, insert: { kj: "normal" } } })
    const input = new InputRenderable(f.renderer, { width: 30, value: "hello" })
    f.renderer.root.add(input)
    f.setMode("modal")
    f.setCommands(["dialog.select.next", "dialog.select.prev", "dialog.select.submit"].map((id) => ({ id })))
    input.focus()
    await f.keys("0jj")
    expect(input.value).toBe("ello")
    expect(f.dispatched).toEqual([])
    await f.keys("ikj")
    expect(input.value).toBe("ello")
    expect(input.cursorStyle.style).toBe("block")
    await f.keys("kfj")
    expect(f.dispatched).toEqual(["dialog.select.prev"])
})

test("dialog j/k dispatch only in idle normal mode", async () => {
    const f = await mount()
    const input = new InputRenderable(f.renderer, { width: 30, value: "" })
    f.renderer.root.add(input)
    f.setMode("modal")
    f.setCommands(["dialog.select.next", "dialog.select.prev", "dialog.select.submit"].map((id) => ({ id })))
    input.focus()
    await f.keys("jk")
    expect(f.dispatched).toEqual(["dialog.select.next", "dialog.select.prev"])
    expect(input.value).toBe("")
    await f.keys("ijk")
    expect(input.value).toBe("jk")
    f.mockInput.pressEscape()
    await f.keys("fj")
    expect(f.dispatched).toHaveLength(2)
    f.mockInput.pressEnter()
    expect(f.dispatched.at(-1)).toBe("dialog.select.submit")
})

test("dialog Escape exits insert before yielding Escape and native navigation keys", async () => {
    const f = await mount({ defaultMode: "insert" })
    f.setMode("modal")
    f.setCommands([{ id: "dialog.select.submit" }])
    const received: string[] = []
    f.renderer.keyInput.on("keypress", (event) => { received.push(event.name); event.preventDefault() })
    f.mockInput.pressEscape()
    expect(f.input.cursorStyle.style).toBe("block")
    expect(received).toEqual([])
    f.mockInput.pressEscape()
    for (const key of ["TAB", "HOME", "END", "\u001b[5~", "\u001b[6~", "ARROW_LEFT", "ARROW_RIGHT"]) f.mockInput.pressKey(key)
    expect(received).toEqual(["escape", "tab", "home", "end", "pageup", "pagedown", "left", "right"])
})

test("prompt-dialog submit dispatches only its own command", async () => {
    const f = await mount()
    f.setMode("modal")
    f.setCommands([{ id: "dialog.prompt.submit" }])
    f.mockInput.pressEnter()
    expect(f.dispatched).toEqual(["dialog.prompt.submit"])
})
