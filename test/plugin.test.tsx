import { afterEach, expect, test } from "bun:test"
import { InputRenderable, RGBA, TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { render, type JSX } from "@opentui/solid"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"
import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import type { VimOptions } from "../src/modules/vim/config"

const entrypoint = process.env.OPENCODE_VIM_TEST_ENTRYPOINT
if (entrypoint) ensureRuntimePluginSupport({ additional: { "@opencode/plugin/tui": { Plugin } } })
const { default: plugin }: typeof import("../tui") = await import(entrypoint ?? "../tui")

let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); dispose = undefined })

async function mount(options: VimOptions = {}) {
    const screen = await createTestRenderer({ width: 40, height: 8, kittyKeyboard: true })
    const input = new TextareaRenderable(screen.renderer, { id: "prompt", height: 3, width: 40, initialValue: "hello" })
    screen.renderer.root.add(input)
    input.focus() // Plugin loading must also work after the prompt already has focus.
    const [enabled, setEnabled] = createSignal(true)
    const [success, setSuccess] = createSignal(RGBA.fromHex("#00ff00"))
    const [pending, setPending] = createSignal<Array<{ key: string }>>([])
    const [mounted, setMounted] = createSignal(true)
    const [hostMode, setHostMode] = createSignal("base")
    const [commands, setCommands] = createSignal([{ id: "prompt.submit" }])
    const dispatched: string[] = []
    const [footer, setFooter] = createSignal<() => JSX.Element>(() => null)
    let toggle: () => void = () => {}
    const context = {
        renderer: screen.renderer,
        options: { defaultMode: "normal", pendingDisplayDelay: 0, ...options },
        get theme() {
            return { background: { base: RGBA.fromHex("#000000") }, text: { muted: RGBA.fromHex("#888888"), feedback: {
                success: { base: success() }, warning: { base: RGBA.fromHex("#ffff00") }, info: { base: RGBA.fromHex("#00ffff") },
            } } }
        },
        storage: { store: () => [{ get enabled() { return enabled() } }, (fn: (draft: { enabled: boolean }) => void) => {
            const draft = { enabled: enabled() }; fn(draft); setEnabled(draft.enabled)
        }] },
        keymap: {
            pending,
            mode: { current: hostMode },
            commands, dispatch(command: string) { dispatched.push(command) },
            layer(fn: () => { commands: Array<{ run: () => void }> }) { toggle = fn().commands[0].run },
        },
        ui: {
            router: { current: () => ({ type: "home" }) }, toast: { show() {} },
            slot(slot: { append?: string; render: (props: { mode: string }) => JSX.Element }) {
                if (slot.append === "app") void render(() => <>{mounted() ? slot.render({ mode: "normal" }) : null}{footer()()}</>, screen.renderer)
                else setFooter(() => () => slot.render({ mode: "normal" }))
                return () => setFooter(() => () => null)
            },
        },
    }
    plugin.setup(context as unknown as Parameters<typeof plugin.setup>[0])
    await screen.renderOnce()
    dispose = () => screen.renderer.destroy()
    function openDialog(value = "", kind: "select" | "prompt" | "other" = "select") {
        input.blur()
        setHostMode("modal")
        setCommands(kind === "select"
            ? ["dialog.select.next", "dialog.select.prev", "dialog.select.submit"].map((id) => ({ id }))
            : kind === "prompt" ? [{ id: "dialog.prompt.submit" }] : [])
        const editor = new InputRenderable(screen.renderer, { id: "filter", width: 30, value })
        screen.renderer.root.add(editor)
        editor.focus()
        return editor
    }
    function closeDialog(editor: InputRenderable) {
        editor.destroy()
        setHostMode("base")
        setCommands([{ id: "prompt.submit" }])
        input.focus()
    }
    return { ...screen, input, toggle, setSuccess, setPending, openDialog, closeDialog, dispatched, unmount: () => setMounted(false) }
}

test("plugin intercepts keys before an already-focused textarea", async () => {
    const f = await mount()
    f.mockInput.pressKey("x")
    expect(f.input.plainText).toBe("ello")
    expect(f.input.cursorStyle.style).toBe("block")
})

test("mode status, colors and toggle update without polling", async () => {
    const f = await mount()
    expect(f.captureCharFrame()).toContain("NORMAL")
    f.mockInput.pressKey("i")
    await f.renderOnce()
    expect(f.captureCharFrame()).toContain("INSERT")
    expect(f.input.cursorStyle.style).toBe("line")
    f.setSuccess(RGBA.fromHex("#ff00ff"))
    await f.renderOnce()
    const frame = f.captureSpans()
    const status = frame.lines.flatMap((line) => line.spans).find((span) => span.text.includes("INSERT"))
    expect(status?.fg).toEqual(RGBA.fromHex("#ff00ff"))
    f.mockInput.pressEscape()
    await f.renderOnce()
    const normalFrame = f.captureCharFrame()
    f.mockInput.pressKey("d")
    await f.renderOnce()
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
    f.mockInput.pressKey("i")
    await f.renderOnce()
    expect(f.captureCharFrame()).toContain("INSERT")
    const insertFrame = f.captureCharFrame()
    f.mockInput.pressKey("k")
    await f.renderOnce()
    expect(f.captureCharFrame()).toBe(insertFrame)
    f.mockInput.pressKey("j")
    await f.renderOnce()
    expect(f.captureCharFrame()).toContain("NORMAL")
    expect(f.captureCharFrame()).not.toContain("INSERT")
    f.mockInput.pressKey("v")
    await f.renderOnce()
    expect(f.captureCharFrame()).toContain("VISUAL")
})

test("focus changes restore the editor's original cursor", async () => {
    const f = await mount()
    f.mockInput.pressKey("i")
    expect(f.input.cursorStyle.style).toBe("line")
    f.input.blur()
    expect(f.input.cursorStyle.style).toBe("block")
    f.input.focus()
    expect(f.input.cursorStyle.style).toBe("line")
})

test("host shortcuts and pending leader sequences reach the host", async () => {
    const f = await mount()
    const received: string[] = []
    f.renderer.keyInput.on("keypress", (event) => {
        received.push(event.name)
        event.preventDefault()
    })
    f.mockInput.pressKey("x", { ctrl: true })
    f.setPending([{ key: "ctrl+x" }])
    f.mockInput.pressKey("p")
    expect(received).toEqual(["x", "p"])
    expect(f.input.plainText).toBe("hello")
})

test("unmount removes handlers and restores native editing", async () => {
    const f = await mount()
    const listeners = f.renderer.keyInput.listenerCount("keypress")
    f.mockInput.pressKey("v")
    expect(f.input.hasSelection()).toBe(true)
    f.unmount()
    await f.renderOnce()
    expect(f.renderer.keyInput.listenerCount("keypress")).toBe(listeners - 1)
    expect(f.input.hasSelection()).toBe(false)
    expect(f.captureCharFrame()).not.toContain("VISUAL")
    f.mockInput.pressKey("x")
    expect(f.input.plainText).toBe("xhello")
})

test("dialog search deletion and undo emit updated filter text", async () => {
    const f = await mount()
    const editor = f.openDialog("hello")
    const queries: string[] = []
    editor.on("input", (value: string) => queries.push(value))
    f.mockInput.pressKey("0")
    f.mockInput.pressKey("x")
    expect(editor.value).toBe("ello")
    expect(queries).toEqual(["ello"])
    f.mockInput.pressKey("u")
    expect(editor.value).toBe("hello")
    expect(queries).toEqual(["ello", "hello"])
    f.mockInput.pressKey("d")
    f.mockInput.pressKey("w")
    expect(editor.value).toBe("")
    expect(queries.at(-1)).toBe("")
    expect(f.input.plainText).toBe("hello")
})

test("dialog j/k navigate only in idle normal mode", async () => {
    const f = await mount()
    const editor = f.openDialog()
    f.mockInput.pressKey("j")
    f.mockInput.pressKey("k")
    expect(f.dispatched).toEqual(["dialog.select.next", "dialog.select.prev"])
    expect(editor.value).toBe("")
    f.mockInput.pressKey("i")
    f.mockInput.pressKey("j")
    f.mockInput.pressKey("k")
    expect(editor.value).toBe("jk")
    f.mockInput.pressEscape()
    f.mockInput.pressKey("f")
    f.mockInput.pressKey("j")
    expect(f.dispatched).toHaveLength(2)
    f.mockInput.pressEnter()
    expect(f.dispatched.at(-1)).toBe("dialog.select.submit")
})

test("dialog custom mappings take precedence over list navigation", async () => {
    const f = await mount({ keymaps: { normal: { jj: "x" }, insert: { kj: "normal" } } })
    const editor = f.openDialog("hello")
    f.mockInput.pressKey("0")
    f.mockInput.pressKey("j")
    f.mockInput.pressKey("j")
    expect(editor.value).toBe("ello")
    expect(f.dispatched).toEqual([])
    f.mockInput.pressKey("i")
    f.mockInput.pressKey("k")
    f.mockInput.pressKey("j")
    expect(editor.value).toBe("ello")
    expect(editor.cursorStyle.style).toBe("block")
})

test("dialog editing preserves the prompt's mode and undo history", async () => {
    const f = await mount()
    f.mockInput.pressKey("x")
    const editor = f.openDialog("models")
    f.mockInput.pressKey("0")
    f.mockInput.pressKey("x")
    f.mockInput.pressKey("i")
    f.closeDialog(editor)
    expect(f.input.cursorStyle.style).toBe("block")
    f.mockInput.pressKey("u")
    expect(f.input.plainText).toBe("hello")
})

test("dialog Escape exits insert first and leaves closing to the host", async () => {
    const f = await mount({ defaultMode: "insert" })
    const editor = f.openDialog("model")
    const hostKeys: string[] = []
    f.renderer.keyInput.on("keypress", (event) => { hostKeys.push(event.name); event.preventDefault() })
    f.mockInput.pressEscape()
    expect(editor.cursorStyle.style).toBe("block")
    expect(hostKeys).toEqual([])
    f.mockInput.pressEscape()
    for (const key of ["TAB", "HOME", "END", "\u001b[5~", "\u001b[6~", "ARROW_LEFT", "ARROW_RIGHT"]) f.mockInput.pressKey(key)
    expect(hostKeys).toEqual(["escape", "tab", "home", "end", "pageup", "pagedown", "left", "right"])
})

test("dialog prompt submission does not submit the main prompt", async () => {
    const f = await mount()
    f.openDialog("name", "prompt")
    f.mockInput.pressEnter()
    expect(f.dispatched).toEqual(["dialog.prompt.submit"])
})

test("unrelated modal input keeps native behavior", async () => {
    const f = await mount()
    const editor = f.openDialog("", "other")
    f.mockInput.pressKey("x")
    f.mockInput.pressKey("j")
    expect(editor.value).toBe("xj")
    expect(f.dispatched).toEqual([])
})
