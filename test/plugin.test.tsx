import { afterEach, expect, test } from "bun:test"
import { InputRenderable, RGBA, ScrollBoxRenderable, TextareaRenderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { render, useTerminalDimensions, type JSX } from "@opentui/solid"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"
import { Plugin } from "@opencode/plugin/tui"
import { createSignal, For, Show } from "solid-js"
import type { VimOptions } from "../src/modules/vim/config"

const entrypoint = process.env.OPENCODE_VIM_TEST_ENTRYPOINT
if (entrypoint) ensureRuntimePluginSupport({ additional: { "@opencode/plugin/tui": { Plugin } } })
const { default: plugin }: typeof import("../tui") = await import(entrypoint ?? "../tui")

let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); dispose = undefined })

type TestMessage = { id: string; type: "user" | "assistant"; time: { created: number }; text?: string; content?: Array<{ type: string; text: string; id?: string; name?: string }> }
function message(id: number, text: string, type: "user" | "assistant" = "assistant"): TestMessage {
    return { id: String(id), type, time: { created: id }, ...(type === "user" ? { text } : { content: [{ type: "text", text }] }) }
}

async function mount(options: VimOptions = {}, session?: { messages: TestMessage[]; older?: TestMessage[]; window?: { start: number; end?: number }; group?: string[] }) {
    const screen = await createTestRenderer({ width: session ? 80 : 40, height: session ? 16 : 8, kittyKeyboard: true })
    const input = new TextareaRenderable(screen.renderer, { id: "prompt", height: 3, width: 40, initialValue: "hello" })
    screen.renderer.root.add(input)
    if (session) { input.position = "absolute"; input.top = 11 }
    input.focus() // Plugin loading must also work after the prompt already has focus.
    const [enabled, setEnabled] = createSignal(true)
    const [success, setSuccess] = createSignal(RGBA.fromHex("#00ff00"))
    const [pending, setPending] = createSignal<Array<{ key: string }>>([])
    const [mounted, setMounted] = createSignal(true)
    const [hostMode, setHostMode] = createSignal("base")
    const [commands, setCommands] = createSignal([{ id: "prompt.submit" }])
    const [route, setRoute] = createSignal<{ type: "home" } | { type: "session"; sessionID: string }>(session ? { type: "session", sessionID: "session-1" } : { type: "home" })
    const [messages, setMessages] = createSignal(session?.messages ?? [])
    const [dialog, setDialog] = createSignal<{ render: () => JSX.Element; onClose?: () => void }>()
    const [dialogOptions, setDialogOptions] = createSignal<{ size?: string; centered?: boolean }>({})
    let modalReturnMode = "base"
    let modalReturnFocus = screen.renderer.currentFocusedRenderable
    const [slack, setSlack] = createSignal(0)
    const [windowStart, setWindowStart] = createSignal(session?.window?.start ?? 0)
    const [windowEnd, setWindowEnd] = createSignal(session?.window?.end)
    const [groupExpanded, setGroupExpanded] = createSignal(false)
    let transcript: ScrollBoxRenderable | undefined
    let targetID: string | undefined
    let navigationID: string | undefined
    let pendingScroll: { position: number | "bottom" } | { height?: number; delta: number } | undefined
    let older = session?.older ?? []
    const copied: string[] = []
    // Never touch the real desktop clipboard during tests.
    Object.defineProperty(screen.renderer, "capabilities", { value: { remote: true, osc52_support: "supported" } })
    screen.renderer.copyToClipboardOSC52 = (text) => { copied.push(text); return true }
    const dispatched: string[] = []
    const [footer, setFooter] = createSignal<() => JSX.Element>(() => null)
    let toggle: () => void = () => {}
    const context = {
        renderer: screen.renderer,
        options: { defaultMode: "normal", pendingDisplayDelay: 0, ...options },
        get theme() {
            const tokens = { background: { base: RGBA.fromHex("#000000"), raised: { high: RGBA.fromHex("#222222") } }, text: { base: RGBA.fromHex("#ffffff"), muted: RGBA.fromHex("#888888"), feedback: {
                success: { base: success() }, warning: { base: RGBA.fromHex("#ffff00") }, info: { base: RGBA.fromHex("#00ffff") },
            } } }
            return { ...tokens, surface: () => tokens }
        },
        storage: { store: () => [{ get enabled() { return enabled() } }, (fn: (draft: { enabled: boolean }) => void) => {
            const draft = { enabled: enabled() }; fn(draft); setEnabled(draft.enabled)
        }] },
        keymap: {
            pending,
            mode: { current: hostMode, push(mode: string) { const previous = hostMode(); setHostMode(mode); return () => setHostMode(previous) } },
            commands, dispatch(command: string) {
                dispatched.push(command)
                if (command === "session.first" || command === "session.last" || command.startsWith("session.line.")) {
                    targetID = navigationID = undefined
                    setSlack(0)
                    const delta = command === "session.line.up" ? -1 : 1
                    const before = transcript?.scrollHeight ?? 0
                    if (command === "session.first") {
                        setMessages([...older, ...messages()]); older = []
                        setWindowStart(0); setWindowEnd(undefined)
                        pendingScroll = { position: 0 }
                    } else if (command === "session.last") {
                        setWindowEnd(undefined)
                        pendingScroll = { position: "bottom" }
                    } else if (delta < 0 && transcript && transcript.scrollTop <= transcript.viewport.height) {
                        if (windowStart()) setWindowStart(0)
                        else if (older.length) { setMessages([...older, ...messages()]); older = [] }
                        // OpenCode compensates for prepended rows after layout.
                        pendingScroll = { height: before, delta }
                    } else if (delta > 0 && (windowEnd() ?? messages().length) < messages().length) {
                        setWindowEnd(undefined)
                        pendingScroll = { delta }
                    } else transcript?.scrollBy(delta)
                    return
                }
                const index = messages().findIndex((item) => item.id === navigationID)
                if ((command === "session.first" || (command === "session.message.previous" && index === 0)) && older.length) {
                    setMessages([...older, ...messages()]); older = []
                }
                const navigable = messages().filter((item) => item.type === "user" ? item.text?.trim()
                    : item.content?.some((part) => part.type === "text" && part.text.trim()))
                const current = navigable.findIndex((item) => item.id === navigationID)
                if (command === "session.message.previous") navigationID = navigable[Math.max(0, current - 1)]?.id
                else if (command === "session.message.next") navigationID = navigable[Math.min(navigable.length - 1, current + 1)]?.id
                else if (command === "session.first") navigationID = navigable[0]?.id
                else if (command === "session.last") navigationID = navigable.at(-1)?.id
                else if (command === "session.messages_last_user") navigationID = navigable.findLast((item) => item.type === "user")?.id
                else return
                targetID = navigationID
            },
            layer(fn: () => { commands: Array<{ run: () => void }> }) { toggle = fn().commands[0].run },
        },
        data: { session: { message: { list: messages } } },
        ui: {
            router: { current: route }, toast: { show() {} },
            dialog: {
                show(view: () => JSX.Element, onClose?: () => void) {
                    if (!dialog()) {
                        modalReturnMode = hostMode()
                        modalReturnFocus = screen.renderer.currentFocusedRenderable
                        modalReturnFocus?.blur()
                    }
                    dialog()?.onClose?.()
                    setHostMode("modal")
                    setDialog({ render: view, onClose })
                },
                set: setDialogOptions,
                clear() {
                    dialog()?.onClose?.()
                    setDialog(undefined)
                    setHostMode(modalReturnMode)
                    setTimeout(() => {
                        if (!dialog() && modalReturnFocus && !modalReturnFocus.isDestroyed) modalReturnFocus.focus()
                    }, 1)
                },
            },
            slot(slot: { append?: string; render: (props: any) => JSX.Element }) {
                if (slot.append === "app") void render(() => <>
                    <Show when={session}>
                        <scrollbox ref={(value) => { transcript = value }} id="native-transcript" height={10} width={76} left={2}>
                            <For each={messages().slice(windowStart(), windowEnd())}>{(item) => (
                                <Show when={!session?.group?.includes(item.id)} fallback={
                                    <Show when={item.id === session?.group?.[0]}>
                                        <box id={item.id} marginTop={1} flexShrink={0}>
                                            <box>
                                                <box onMouseUp={() => setGroupExpanded(!groupExpanded())}>
                                                    <box flexDirection="row"><text>→</text><text>Explored: 2 reads</text></box>
                                                </box>
                                                <Show when={groupExpanded()}>
                                                    <For each={messages().filter((entry) => session?.group?.includes(entry.id))}>{(entry) => (
                                                        <box><text>{entry.content![0].text}</text></box>
                                                    )}</For>
                                                </Show>
                                            </box>
                                        </box>
                                    </Show>
                                }>
                                <For each={item.type === "user" ? [{ type: "message", text: item.text! }] : item.content ?? []}>{(part, index) => (
                                    <box id={index() === 0 ? item.id : `session-part:${item.id}:${part.type === "tool" ? (part as { id: string }).id : `${part.type}:${item.content!.slice(0, index()).filter((other) => other.type === part.type).length}`}`}
                                        marginTop={1} flexShrink={0}>
                                        <text>{part.text}</text>
                                    </box>
                                )}</For>
                                </Show>
                            )}</For>
                            <Show when={slack()}>{(height) => <box id="session-navigation-slack" height={height()} flexShrink={0} />}</Show>
                        </scrollbox>
                    </Show>
                    {mounted() ? slot.render({ mode: "normal" }) : null}{footer()()}
                    <Show when={dialog()} keyed>{(item) => <Modal>{item.render()}</Modal>}</Show>
                </>, screen.renderer)
                else setFooter(() => () => slot.render({ mode: "normal" }))
                return () => setFooter(() => () => null)
            },
        },
    }
    function Modal(props: { children: JSX.Element }) {
        const dimensions = useTerminalDimensions()
        return <box position="absolute" top={0} left={0} width={dimensions().width} height={dimensions().height}
            zIndex={3000} alignItems="center" justifyContent={dialogOptions().centered ? "center" : undefined}
            backgroundColor={RGBA.fromInts(0, 0, 0, 150)} onMouseUp={() => context.ui.dialog.clear()}>
            <box id="host-dialog" width={dialogOptions().size === "large" ? 88 : 60} maxWidth={dimensions().width - 2}
                paddingTop={1} backgroundColor={context.theme.background.base} onMouseUp={(event) => event.stopPropagation()}>
                {props.children}
            </box>
        </box>
    }
    screen.renderer.keyInput.on("keypress", (event) => {
        if (event.defaultPrevented || !dialog()) return
        if (event.name === "escape") context.ui.dialog.clear()
        // Native Ctrl+C clears a focused editor.
        if (event.ctrl && event.name === "c") screen.renderer.currentFocusedEditor?.setText("")
    })
    plugin.setup(context as unknown as Parameters<typeof plugin.setup>[0])
    await screen.renderOnce()
    transcript?.scrollTo(transcript.scrollHeight)
    async function renderOnce() {
        await screen.renderOnce()
        if (pendingScroll && transcript) {
            const action = pendingScroll
            pendingScroll = undefined
            if ("delta" in action) transcript.scrollBy((action.height === undefined ? 0 : transcript.scrollHeight - action.height) + action.delta)
            else transcript.scrollTo(action.position === "bottom" ? transcript.scrollHeight : action.position)
        }
        if (targetID && transcript) {
            const row = transcript.getRenderable(targetID)
            if (row) {
                const top = transcript.scrollTop + row.y - transcript.viewport.y
                setSlack(Math.max(0, top + transcript.viewport.height - (transcript.scrollHeight - slack())))
                await screen.renderOnce()
                transcript.scrollTo(top)
            }
            targetID = undefined
        }
        await screen.renderOnce()
        await screen.renderOnce()
    }
    await renderOnce()
    dispose = () => screen.renderer.destroy()
    let dialogReturnMode = "base"
    let dialogReturnInput = screen.renderer.currentFocusedEditor
    function openDialog(value = "", kind: "select" | "prompt" | "other" = "select") {
        dialogReturnMode = hostMode()
        dialogReturnInput = screen.renderer.currentFocusedEditor
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
        setHostMode(dialogReturnMode)
        setCommands([{ id: "prompt.submit" }])
        dialogReturnInput?.focus()
    }
    return { ...screen, renderOnce, input, toggle, setSuccess, setPending, openDialog, closeDialog, dispatched, hostMode, setRoute,
        setMessages, copied, dialog, dialogOptions, clearModal: () => context.ui.dialog.clear(),
        replaceModal: () => context.ui.dialog.show(() => <text>Another dialog</text>), transcript: () => transcript!,
        async scrollTranscript(position: number | "bottom") {
            navigationID = undefined
            setSlack(0)
            await screen.renderOnce()
            transcript!.scrollTo(position === "bottom" ? transcript!.scrollHeight : position)
            await renderOnce()
        },
        async keys(keys: string) {
            for (const key of keys) screen.mockInput.pressKey(key, { shift: key !== key.toLowerCase() })
            await renderOnce()
        },
        reader: () => screen.renderer.root.findDescendantById("vim-session-message") as TextareaRenderable,
        unmount: () => setMounted(false) }
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
    expect(f.renderer.keyInput.listenerCount("keypress")).toBe(listeners - 2)
    expect(f.input.hasSelection()).toBe(false)
    expect(f.captureCharFrame()).not.toContain("VISUAL")
    f.mockInput.pressKey("x")
    expect(f.input.plainText).toBe("xhello")
})

test.each(["normal", "insert"] as const)("dialogs inherit the prompt's current %s mode rather than the startup mode", async (mode) => {
    const f = await mount({ defaultMode: mode === "normal" ? "insert" : "normal" })
    if (mode === "normal") f.mockInput.pressEscape()
    else f.mockInput.pressKey("i")
    const cursor = mode === "normal" ? "block" : "line"

    for (const kind of ["select", "prompt"] as const) {
        const editor = f.openDialog("query", kind)
        expect(editor.cursorStyle.style).toBe(cursor)
        await f.renderOnce()
        expect(f.captureCharFrame()).toContain(mode.toUpperCase())
        if (mode === "normal") {
            f.mockInput.pressKey("0")
            f.mockInput.pressKey("x")
            expect(editor.value).toBe("uery")
            f.mockInput.pressKey("i")
        } else {
            f.mockInput.pressKey("x")
            expect(editor.value).toContain("x")
            f.mockInput.pressEscape()
        }
        await f.renderOnce()
        expect(f.captureCharFrame()).toContain(mode === "normal" ? "INSERT" : "NORMAL")
        expect(f.captureCharFrame()).not.toContain(mode.toUpperCase())
        f.closeDialog(editor)
        await f.renderOnce()
        expect(f.captureCharFrame()).toContain(mode.toUpperCase())
        expect(f.input.cursorStyle.style).toBe(cursor)
        expect(f.input.plainText).toBe("hello")
    }
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

test("s marks the existing transcript without changing its layout or opening a reader", async () => {
    const f = await mount({}, { messages: [message(1, "Question", "user"), message(2, "Answer")] })
    await f.keys("lx")
    const offset = f.input.cursorOffset
    const row = f.transcript().getRenderable("2")!
    const layout = { y: row.y, height: row.height, width: row.width, scroll: f.transcript().scrollTop }
    const before = f.captureCharFrame().split("\n").slice(0, 10).join("\n")
    await f.keys("s")
    expect(f.hostMode()).toBe("opencode-vim.session")
    expect(f.captureCharFrame()).toContain("SESSION · Enter open · yy copy · s prompt")
    expect(f.captureCharFrame()).toContain("▎Answer")
    expect(f.reader()).toBeUndefined()
    expect({ y: row.y, height: row.height, width: row.width, scroll: f.transcript().scrollTop }).toEqual(layout)
    expect(f.captureCharFrame().split("\n").slice(0, 10).join("\n").replaceAll("▎", " ")).toBe(before)
    await f.keys("s")
    expect(f.hostMode()).toBe("base")
    expect(f.captureCharFrame()).not.toContain("▎")
    expect(f.renderer.currentFocusedEditor).toBe(f.input)
    expect(f.input.cursorOffset).toBe(offset)
    expect(f.captureCharFrame()).toContain("NORMAL")
    await f.keys("u")
    expect(f.input.plainText).toBe("hello")
})

test("s only opens from idle prompt normal mode and respects mappings", async () => {
    const f = await mount({ keymaps: { normal: { ss: "x" } } }, { messages: [message(1, "Answer")] })
    await f.keys("ss")
    expect(f.hostMode()).toBe("base")
    expect(f.input.plainText).toBe("ello")
    await f.keys("is")
    expect(f.hostMode()).toBe("base")
    expect(f.input.plainText).toBe("sello")
    f.mockInput.pressEscape()
    await f.keys("fs")
    expect(f.hostMode()).toBe("base")
    f.openDialog("search")
    await f.keys("s")
    expect(f.hostMode()).toBe("modal")
})

test("sessionKey changes the toggle and footer hints in browsing and the message modal", async () => {
    const f = await mount({ sessionKey: "q" }, { messages: [message(1, "one q answer")] })
    await f.keys("s")
    expect(f.hostMode()).toBe("base")
    await f.keys("q")
    expect(f.hostMode()).toBe("opencode-vim.session")
    expect(f.captureCharFrame()).toContain("SESSION · Enter open · yy copy · q prompt")
    await f.keys("s")
    expect(f.hostMode()).toBe("opencode-vim.session")
    await f.keys("q")
    expect(f.hostMode()).toBe("base")
    await f.keys("q")
    f.mockInput.pressEnter()
    await f.renderOnce()
    expect(f.captureCharFrame()).toContain("v select · V lines · q prompt")
    await f.keys("sfq")
    expect(f.hostMode()).toBe("modal")
    expect(f.reader().cursorOffset).toBe(4)
    await f.keys("vq")
    expect(f.hostMode()).toBe("modal")
    expect(f.captureCharFrame()).toContain("VISUAL")
    f.mockInput.pressEscape()
    await f.keys("q")
    expect(f.hostMode()).toBe("base")
    expect(f.dialog()).toBeUndefined()
    expect(f.input.plainText).toBe("hello")
})

test("custom session keys respect prompt mappings, pending motions and insert/dialog scope", async () => {
    const f = await mount({ sessionKey: "q", keymaps: { normal: { qq: "x" } } }, { messages: [message(1, "Answer")] })
    await f.keys("qq")
    expect(f.hostMode()).toBe("base")
    expect(f.input.plainText).toBe("ello")
    await f.keys("iq")
    expect(f.input.plainText).toBe("qello")
    f.mockInput.pressEscape()
    await f.keys("fq")
    expect(f.hostMode()).toBe("base")
    f.openDialog("search")
    await f.keys("q")
    expect(f.hostMode()).toBe("modal")
})

test.each(["s", "c"])("Ctrl+%s can toggle session mode from both browsing and the modal", async (key) => {
    const sessionKey = `<C-${key}>`
    const f = await mount({ sessionKey }, { messages: [message(1, "Answer")] })
    f.setPending([{ key: "ctrl+x" }])
    f.mockInput.pressKey(key, { ctrl: true })
    expect(f.hostMode()).toBe("base")
    f.setPending([])
    f.mockInput.pressKey(key, { ctrl: true })
    await f.renderOnce()
    expect(f.hostMode()).toBe("opencode-vim.session")
    expect(f.captureCharFrame()).toContain(`${sessionKey} prompt`)
    f.mockInput.pressKey(key, { ctrl: true })
    expect(f.hostMode()).toBe("base")
    f.mockInput.pressKey(key, { ctrl: true })
    f.mockInput.pressEnter()
    await f.renderOnce()
    expect(f.hostMode()).toBe("modal")
    expect(f.captureCharFrame()).toContain(`${sessionKey} prompt`)
    f.mockInput.pressKey(key, { ctrl: true })
    await f.renderOnce()
    expect(f.hostMode()).toBe("base")
    expect(f.dialog()).toBeUndefined()
    expect(f.input.plainText).toBe("hello")
})

test("a multi-key sessionKey falls back to the default toggle", async () => {
    const f = await mount({ sessionKey: "gs" }, { messages: [message(1, "Answer")] })
    await f.keys("s")
    expect(f.hostMode()).toBe("opencode-vim.session")
    expect(f.captureCharFrame()).toContain("SESSION · Enter open · yy copy · s prompt")
    await f.keys("s")
    expect(f.hostMode()).toBe("base")
})

test("message navigation uses native history loading and marks newly mounted messages", async () => {
    const recent = [message(4, "Fourth"), message(5, "Fifth")]
    const f = await mount({}, { messages: recent, older: [message(1, "First", "user"), message(2, "Second"), message(3, "Third")] })
    await f.keys("s")
    expect(f.captureCharFrame()).toContain("▎Fifth")
    f.dispatched.length = 0
    await f.keys("2k")
    expect(f.captureCharFrame()).toContain("▎Third")
    expect(f.dispatched).toContain("session.line.up")
    expect(f.dispatched).not.toContain("session.message.previous")
    await f.keys("gg")
    expect(f.captureCharFrame()).toContain("▎First")
    expect(f.captureCharFrame()).toContain("SESSION · Enter open · yy copy · s prompt")
    await f.keys("2j")
    expect(f.captureCharFrame()).toContain("▎Third")
    f.setMessages([...recent, message(6, "Sixth")])
    await f.renderOnce()
    await f.keys("G")
    expect(f.captureCharFrame()).toContain("▎Sixth")
    expect(f.reader()).toBeUndefined()
})

test("whole-message yank preserves Markdown and can be pasted in the prompt", async () => {
    const text = "# Heading\n\n```ts\nconst 中 = '👍🏽'\n```"
    const f = await mount({}, { messages: [message(1, text)] })
    await f.keys("syy")
    expect(f.copied).toEqual([text])
    await f.keys("s$p")
    expect(f.input.plainText).toBe("hello" + text)
})

test("lines copied from a message fill an empty prompt without a leading blank line", async () => {
    const text = "quoted 中 👩‍💻\nsecond line"
    const f = await mount({}, { messages: [message(1, text)] })
    f.input.setText("")
    await f.keys("s")
    f.mockInput.pressEnter()
    await f.keys("Vjy")
    expect(f.copied).toEqual([text + "\n"])
    await f.keys("sp")
    expect(f.input.plainText).toBe(text)
    expect(f.input.cursorOffset).toBe(0)
    await f.keys("u")
    expect(f.input.plainText).toBe("")
    f.mockInput.pressKey("r", { ctrl: true })
    expect(f.input.plainText).toBe(text)
})

test("session yy briefly highlights only the copied item without changing its text or layout", async () => {
    const text = "Yanked 中 👍🏽 é\nSecond line"
    const f = await mount({}, { messages: [message(1, "Question", "user"), message(2, text)] })
    await f.keys("s")
    const before = f.captureSpans().lines.slice(0, 10)
    const characters = f.captureCharFrame().split("\n").slice(0, 10)
    const scroll = f.transcript().scrollTop
    await f.keys("yy")
    const spans = f.captureSpans().lines.flatMap((line) => line.spans)
    for (const part of text.split("\n")) {
        const span = spans.find((span) => span.text.includes(part))
        expect(span?.bg).toEqual(RGBA.fromHex("#00ffff"))
        expect(span?.fg).toEqual(RGBA.fromHex("#000000"))
    }
    expect(spans.find((span) => span.text.includes("Question"))?.bg).not.toEqual(RGBA.fromHex("#00ffff"))
    expect(f.captureCharFrame().split("\n").slice(0, 10)).toEqual(characters)
    expect(f.transcript().scrollTop).toBe(scroll)
    expect(f.copied).toEqual([text])
    await Bun.sleep(280)
    await f.renderOnce()
    expect(f.captureSpans().lines.slice(0, 10)).toEqual(before)
})

test("session yank flashes stay inside the viewport and clear on navigation or exit", async () => {
    const text = Array.from({ length: 24 }, (_, index) => `row ${index} 中`).join("\n")
    const f = await mount({}, { messages: [message(1, "Question", "user"), message(2, text)] })
    await f.keys("syy")
    const view = f.transcript().viewport
    const flashed = f.captureSpans().lines
    for (let y = 0; y < flashed.length; y++) {
        expect(flashed[y].spans.some((span) => span.bg.equals(RGBA.fromHex("#00ffff"))))
            .toBe(y >= view.y && y < view.y + view.height)
    }
    expect(f.copied).toEqual([text])
    await f.keys("k")
    expect(f.captureSpans().lines.flatMap((line) => line.spans).some((span) => span.bg.equals(RGBA.fromHex("#00ffff")))).toBe(false)
    await f.keys("yy")
    expect(f.captureSpans().lines.flatMap((line) => line.spans).some((span) => span.bg.equals(RGBA.fromHex("#00ffff")))).toBe(true)
    await f.keys("ss")
    expect(f.captureSpans().lines.flatMap((line) => line.spans).some((span) => span.bg.equals(RGBA.fromHex("#00ffff")))).toBe(false)
})

test("entering a message reveals a cursor, supports visual yanks and returns in steps", async () => {
    const f = await mount({}, { messages: [message(1, "one two\nsecond line")] })
    await f.keys("s")
    f.dispatched.length = 0
    const scroll = f.transcript().scrollTop
    const rows = f.transcript().getChildren().map((row) => [row.id, row.y, row.height])
    f.mockInput.pressEnter()
    await f.keys("wvll")
    expect(f.dialogOptions()).toEqual({ size: "large", centered: true })
    expect(f.hostMode()).toBe("modal")
    const modal = f.renderer.root.findDescendantById("host-dialog")!
    expect(modal.x).toBeGreaterThan(0)
    expect(modal.y).toBeGreaterThan(0)
    expect(modal.y + modal.height).toBeLessThan(f.renderer.height)
    expect(Math.abs(modal.y - (f.renderer.height - modal.height) / 2)).toBeLessThanOrEqual(1)
    expect(f.transcript().getChildren().map((row) => [row.id, row.y, row.height])).toEqual(rows)
    expect(f.reader().showCursor).toBe(true)
    expect(f.reader().getSelectedText()).toBe("two")
    expect(f.captureCharFrame()).toContain("VISUAL")
    await f.keys("y")
    expect(f.copied).toEqual(["two"])
    f.mockInput.pressEscape()
    await f.renderOnce()
    expect(f.reader()).toBeUndefined()
    expect(f.dialog()).toBeUndefined()
    expect(f.hostMode()).toBe("opencode-vim.session")
    expect(f.transcript().scrollTop).toBe(scroll)
    f.mockInput.pressEnter()
    expect(f.reader().cursorOffset).toBe(4)
    await f.keys("Vjy")
    expect(f.copied.at(-1)).toBe("one two\nsecond line\n")
    f.mockInput.pressEscape()
    f.mockInput.pressEscape()
    expect(f.hostMode()).toBe("base")
    expect(f.input.plainText).toBe("hello")
    expect(f.dispatched).toEqual([])
})

test("reader blocks edits, custom editing maps and bracketed paste", async () => {
    const text = "six words here\nmore words"
    const f = await mount({ keymaps: { normal: { j: "dd", Q: "insert" } } }, { messages: [message(1, text)] })
    await f.keys("s")
    await f.mockInput.pasteBracketedText("MUTATION")
    f.mockInput.pressEnter()
    await f.keys("iaAoOdDcxpru.Q")
    await f.mockInput.pasteBracketedText("MUTATION")
    expect(f.reader().plainText).toBe(text)
    expect(f.captureCharFrame()).toContain("MESSAGE")
    await f.keys("0fs")
    expect(f.reader()).toBeDefined()
    await f.keys("0yiw")
    expect(f.copied.at(-1)).toBe("six")
    await f.keys("j")
    expect(f.reader().cursorOffset).toBeGreaterThan(0)
    expect(f.reader().plainText).toBe(text)
    await f.keys("s")
    expect(f.reader()).toBeUndefined()
    expect(f.hostMode()).toBe("base")
})

test("streaming updates do not move a selection, and browsing refreshes the text", async () => {
    const f = await mount({}, { messages: [message(1, "hello")] })
    await f.keys("s")
    f.mockInput.pressEnter()
    await f.keys("vll")
    f.setMessages([message(1, "hello world")])
    await f.renderOnce()
    expect(f.reader().plainText).toBe("hello")
    expect(f.reader().getSelectedText()).toBe("hel")
    f.mockInput.pressEscape()
    await f.renderOnce()
    expect(f.reader().showCursor).toBe(true)
    expect(f.reader().hasSelection()).toBe(false)
    f.mockInput.pressEscape()
    await f.renderOnce()
    expect(f.reader()).toBeUndefined()
    expect(f.captureCharFrame()).toContain("▎hello world")
})

test("paging a long message scrolls the viewport and retains its position", async () => {
    const text = Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join("\n")
    const f = await mount({}, { messages: [message(1, text)] })
    await f.keys("s")
    f.mockInput.pressEnter()
    await f.renderOnce()
    f.mockInput.pressKey("d", { ctrl: true })
    f.mockInput.pressKey("f", { ctrl: true })
    await f.renderOnce()
    expect(f.reader().scrollY).toBeGreaterThan(0)
    expect(f.reader().height).toBeLessThan(f.renderer.height / 2)
    f.resize(44, 20)
    await f.renderOnce()
    const modal = f.renderer.root.findDescendantById("host-dialog")!
    expect(modal.width).toBeLessThan(44)
    expect(modal.height).toBeLessThan(20)
    expect(f.reader().plainText).toBe(text)
    const offset = f.reader().cursorOffset
    f.mockInput.pressEscape()
    f.mockInput.pressEnter()
    expect(f.reader().cursorOffset).toBe(offset)
    f.mockInput.pressKey("u", { ctrl: true })
    expect(f.reader().cursorOffset).toBeLessThan(offset)
})

test("message modal dismissals restore browsing and save the cursor", async () => {
    const f = await mount({}, { messages: [message(1, "one two three")] })
    await f.keys("s")
    f.mockInput.pressEnter()
    await f.keys("w")
    const close = f.renderer.root.findDescendantById("vim-message-close")!
    await f.mockMouse.click(close.x, close.y)
    await f.renderOnce()
    expect(f.reader()).toBeUndefined()
    expect(f.hostMode()).toBe("opencode-vim.session")
    expect(f.captureCharFrame()).toContain("▎one two three")
    f.mockInput.pressEnter()
    expect(f.reader().cursorOffset).toBe(4)
    await f.renderOnce()
    await f.mockMouse.click(0, 0)
    expect(f.reader()).toBeUndefined()
    f.mockInput.pressEnter()
    f.mockInput.pressKey("c", { ctrl: true })
    expect(f.reader()).toBeUndefined()
    expect(f.hostMode()).toBe("opencode-vim.session")
    await f.keys("yy")
    expect(f.copied.at(-1)).toBe("one two three")
    expect(f.input.plainText).toBe("hello")
})

test("replacing the message modal disposes its keys without closing the replacement", async () => {
    const f = await mount({}, { messages: [message(1, "Answer")] })
    await f.keys("s")
    const listeners = f.renderer.keyInput.listenerCount("keypress")
    f.mockInput.pressEnter()
    await f.renderOnce()
    f.replaceModal()
    await f.renderOnce()
    expect(f.reader()).toBeUndefined()
    expect(f.renderer.keyInput.listenerCount("keypress")).toBe(listeners)
    expect(f.captureCharFrame()).toContain("Another dialog")
    f.toggle()
    expect(f.dialog()).toBeDefined()
    expect(f.captureCharFrame()).toContain("Another dialog")
    f.clearModal()
})

test("empty sessions use the native transcript and can be exited", async () => {
    const f = await mount({}, { messages: [] })
    await f.keys("s")
    expect(f.captureCharFrame()).toContain("SESSION · Enter open · yy copy · s prompt")
    expect(f.reader()).toBeUndefined()
    await f.keys("k")
    await f.renderOnce()
    expect(f.dispatched).toEqual(["session.line.up"])
    await f.keys("s")
    expect(f.renderer.currentFocusedEditor).toBe(f.input)
})

test("disabling or unloading Vim removes the native marker and reader", async () => {
    const f = await mount({}, { messages: [message(1, "Answer")] })
    const listeners = f.renderer.keyInput.listenerCount("keypress")
    await f.keys("s")
    f.toggle()
    await f.renderOnce()
    expect(f.hostMode()).toBe("base")
    expect(f.captureCharFrame()).not.toContain("▎")
    expect(f.renderer.keyInput.listenerCount("keypress")).toBe(listeners)
    f.toggle()
    await f.keys("s")
    f.mockInput.pressEnter()
    f.unmount()
    await f.renderOnce()
    expect(f.reader()).toBeUndefined()
    expect(f.renderer.keyInput.listenerCount("keypress")).toBe(listeners - 2)
})

test("session browsing and reading yield to dialogs, then restore their focus", async () => {
    const f = await mount({}, { messages: [message(1, "Answer")] })
    await f.keys("s")
    f.dispatched.length = 0
    const browsingDialog = f.openDialog("search")
    await f.keys("j")
    expect(f.dispatched).toEqual(["dialog.select.next"])
    expect(f.captureCharFrame()).not.toContain("▎")
    expect(f.captureCharFrame()).toContain("NORMAL")
    expect(f.captureCharFrame()).not.toContain("SESSION")
    await f.keys("i")
    expect(f.captureCharFrame()).toContain("INSERT")
    f.closeDialog(browsingDialog)
    await f.renderOnce()
    expect(f.captureCharFrame()).toContain("SESSION")
    f.mockInput.pressEnter()
    expect(f.renderer.currentFocusedEditor).toBe(f.reader())
    expect(f.reader().showCursor).toBe(true)
    const editor = f.openDialog("models")
    await f.keys("0is")
    expect(editor.value).toBe("smodels")
    expect(f.reader().plainText).toBe("Answer")
    f.closeDialog(editor)
    await f.keys("l")
    expect(f.reader().cursorOffset).toBe(1)
    await f.keys("s")
    expect(f.reader()).toBeUndefined()
    expect(f.renderer.currentFocusedEditor).toBe(f.input)
})

test("switching sessions closes the reader and removes its selection marker", async () => {
    const f = await mount({}, { messages: [message(1, "Answer")] })
    await f.keys("s")
    f.mockInput.pressEnter()
    f.setRoute({ type: "session", sessionID: "other-session" })
    await f.renderOnce()
    expect(f.reader()).toBeUndefined()
    expect(f.hostMode()).toBe("base")
    expect(f.captureCharFrame()).not.toContain("▎")
})

test("native marker selects one text part at a time and clips to the viewport", async () => {
    const reply = message(1, "First part")
    reply.content!.push({ type: "text", text: "Second part\nThird line" })
    const f = await mount({}, { messages: [reply, message(2, "Next message", "user")] })
    await f.keys("sgg")
    const frame = f.captureCharFrame()
    expect(frame).toContain("▎First part")
    expect(frame).not.toContain("▎Second part")
    expect(frame).not.toContain("▎Third line")
    expect(frame).not.toContain("▎Next message")
    await f.keys("yy")
    expect(f.copied.at(-1)).toBe("First part")
    await f.keys("jyy")
    expect(f.captureCharFrame()).toContain("▎Second part")
    expect(f.captureCharFrame()).toContain("▎Third line")
    expect(f.copied.at(-1)).toBe("Second part\nThird line")
    f.mockInput.pressEnter()
    expect(f.reader().plainText).toBe("Second part\nThird line")
    f.mockInput.pressEscape()
    await f.keys("G")
    const lines = f.captureCharFrame().split("\n")
    expect(lines.filter((line) => line.includes("▎"))).toHaveLength(1)

    f.setMessages([message(2, Array.from({ length: 30 }, (_, i) => `row ${i}`).join("\n"), "user")])
    await f.renderOnce()
    f.transcript().scrollTo(5)
    await f.renderOnce()
    const scrolled = f.captureCharFrame().split("\n")
    expect(scrolled.slice(0, 10).every((line) => line.includes("▎"))).toBe(true)
    expect(scrolled.slice(10).some((line) => line.includes("▎"))).toBe(false)
    f.mockInput.pressEnter()
    expect(f.reader().plainText).toContain("row 0")
    expect(f.reader().plainText).toContain("row 29")
})

test("collapsed tool groups expand in place and individual calls can be read and copied", async () => {
    const first = message(1, "Read first.ts\nFirst output")
    first.content![0] = { type: "tool", id: "tool-1", name: "read", text: "Read first.ts\nFirst output" }
    const second = message(2, "Read second.ts\nSecond output")
    second.content![0] = { type: "tool", id: "tool-2", name: "read", text: "Read second.ts\nSecond output" }
    const f = await mount({}, { messages: [first, second, message(3, "Done")], group: ["1", "2"] })
    await f.keys("sk")
    expect(f.captureCharFrame()).toContain("▎→Explored: 2 reads")
    expect(f.captureCharFrame()).toContain("SESSION · Enter open · yy copy · s prompt")
    f.mockInput.pressEnter()
    await f.renderOnce()
    expect(f.reader()).toBeUndefined()
    expect(f.captureCharFrame()).toContain("First output")
    await f.keys("jyy")
    expect(f.copied.at(-1)).toBe("Read first.ts\nFirst output")
    expect(f.captureCharFrame()).toContain("▎First output")
    expect(f.captureCharFrame()).not.toContain("▎Second output")
    f.mockInput.pressEnter()
    expect(f.reader().plainText).toBe("Read first.ts\nFirst output")
    f.mockInput.pressEscape()
    await f.keys("jyy")
    expect(f.copied.at(-1)).toBe("Read second.ts\nSecond output")
    await f.keys("2k")
    f.mockInput.pressEnter()
    await f.renderOnce()
    expect(f.captureCharFrame()).not.toContain("First output")
    await f.keys("jyy")
    expect(f.copied.at(-1)).toBe("Done")
})

test("session entry and navigation work when the first native row has no ID", async () => {
    const tool = message(1, "Read file.ts\nFile contents")
    tool.content![0] = { type: "tool", id: "read-1", name: "read", text: "Read file.ts\nFile contents" }
    const f = await mount({}, { messages: [tool, message(2, "Done")], group: ["1"] })
    Reflect.set(f.transcript().getRenderable("1")!, "id", undefined)
    await f.keys("s")
    expect(f.hostMode()).toBe("opencode-vim.session")
    expect(f.captureCharFrame()).toContain("▎Done")
    await f.keys("k")
    expect(f.captureCharFrame()).toContain("▎→Explored: 2 reads")
    f.mockInput.pressEnter()
    await f.renderOnce()
    await f.keys("jyy")
    expect(f.copied.at(-1)).toBe("Read file.ts\nFile contents")
    await f.keys("j")
    expect(f.captureCharFrame()).toContain("▎Done")
    await f.keys("s")
    expect(f.renderer.currentFocusedEditor).toBe(f.input)
})

test("text, reasoning and standalone tools are separate stops within one message", async () => {
    const reply = message(1, "Start")
    reply.content!.push({ type: "reasoning", text: "Check something" },
        { type: "tool", id: "shell-1", name: "shell", text: "$ pwd\n/work" }, { type: "text", text: "Finished" })
    const f = await mount({}, { messages: [reply] })
    await f.keys("skyy")
    expect(f.copied.at(-1)).toBe("$ pwd\n/work")
    await f.keys("kyy")
    expect(f.copied.at(-1)).toBe("Check something")
    await f.keys("kyy")
    expect(f.copied.at(-1)).toBe("Start")
    await f.keys("3jyy")
    expect(f.copied.at(-1)).toBe("Finished")
})

test("session mode starts on the latest message when several messages share the viewport", async () => {
    const f = await mount({}, { messages: [
        message(1, "First question", "user"), message(2, "First answer"),
        message(3, "Latest question", "user"), message(4, "Latest answer"),
    ] })
    await f.scrollTranscript("bottom")
    expect(f.captureCharFrame()).toContain("First question")
    expect(f.captureCharFrame()).toContain("Latest answer")
    const before = f.captureCharFrame().split("\n").slice(0, 10).join("\n")
    const scroll = f.transcript().scrollTop
    const height = f.transcript().scrollHeight
    const positions = f.transcript().getChildren().map((row) => [row.id, row.y, row.height])
    await f.keys("s")
    expect(f.captureCharFrame()).toContain("▎Latest answer")
    expect(f.captureCharFrame()).not.toContain("▎First question")
    expect(f.captureCharFrame().split("\n").slice(0, 10).join("\n").replaceAll("▎", " ")).toBe(before)
    expect(f.transcript().scrollTop).toBe(scroll)
    expect(f.transcript().scrollHeight).toBe(height)
    expect(f.transcript().getChildren().map((row) => [row.id, row.y, row.height])).toEqual(positions)
    expect(f.dispatched).toEqual([])
    f.mockInput.pressEnter()
    expect(f.reader().plainText).toBe("Latest answer")
    f.mockInput.pressEscape()
    await f.keys("k")
    expect(f.captureCharFrame()).toContain("▎Latest question")
    expect(f.transcript().scrollTop).toBe(scroll)
    expect(f.dispatched).toEqual([])
    await f.keys("yy")
    expect(f.copied.at(-1)).toBe("Latest question")
    await f.keys("gg")
    expect(f.captureCharFrame()).toContain("▎First question")
    await f.keys("ss")
    expect(f.captureCharFrame()).toContain("▎Latest answer")
    await f.keys("k")
    await f.keys("yy")
    expect(f.copied.at(-1)).toBe("Latest question")
})

test("a partially visible latest reply is highlighted without scrolling or changing sticky mode", async () => {
    const text = Array.from({ length: 30 }, (_, index) => `Reply line ${index}`).join("\n")
    const f = await mount({}, { messages: [message(1, "Question", "user"), message(2, text)] })
    await f.scrollTranscript("bottom")
    f.transcript().stickyScroll = true
    await f.renderOnce()
    const top = f.transcript().scrollTop
    const before = f.captureCharFrame().split("\n").slice(0, 10).join("\n")
    expect(before).not.toContain("Reply line 0")
    await f.keys("s")
    expect(f.transcript().scrollTop).toBe(top)
    expect(f.transcript().stickyScroll).toBe(true)
    expect(f.captureCharFrame().split("\n").slice(0, 10).join("\n").replaceAll("▎", " ")).toBe(before)
    expect(f.dispatched).toEqual([])
    await f.keys("yy")
    expect(f.copied.at(-1)).toBe(text)
})

test("visible message selection is immediate and off-screen selections still scroll into view", async () => {
    const f = await mount({}, { messages: [
        message(1, Array.from({ length: 20 }, (_, index) => `Old line ${index}`).join("\n"), "user"),
        message(2, "Visible reply"), message(3, "Latest question", "user"), message(4, "Latest reply"),
    ] })
    await f.scrollTranscript("bottom")
    const top = f.transcript().scrollTop
    await f.keys("skyy")
    expect(f.copied.at(-1)).toBe("Latest question")
    expect(f.transcript().scrollTop).toBe(top)
    expect(f.dispatched).toEqual([])
    await f.keys("jG")
    expect(f.captureCharFrame()).toContain("▎Latest reply")
    expect(f.transcript().scrollTop).toBe(top)
    await f.keys("gg")
    expect(f.captureCharFrame()).not.toContain("Latest reply")
    await f.keys("ss")
    expect(f.captureCharFrame()).toContain("▎Latest reply")
    expect(f.transcript().scrollTop).toBeGreaterThan(0)
})

test("latest selection includes reasoning-only messages before the next layout", async () => {
    const thinking = message(3, "Still thinking")
    thinking.content![0].type = "reasoning"
    const f = await mount({}, { messages: [message(1, "Old answer"), message(2, "Newest answer"), thinking] })
    await f.scrollTranscript(0)
    f.mockInput.pressKey("s")
    f.mockInput.pressEnter()
    expect(f.reader().plainText).toBe("Still thinking")
    f.mockInput.pressEscape()
    await f.renderOnce()
    expect(f.captureCharFrame()).toContain("▎Still thinking")
    await f.keys("k")
    expect(f.captureCharFrame()).toContain("▎Newest answer")
    await f.keys("yy")
    expect(f.copied.at(-1)).toBe("Newest answer")
})

test("moving back down through messages scrolls at the bottom edge without navigation padding", async () => {
    const f = await mount({}, { messages: [
        message(1, Array.from({ length: 15 }, (_, index) => `Earlier line ${index}`).join("\n"), "user"),
        message(2, "Second reply\nSecond middle\nSecond end"),
        message(3, "Third question\nThird middle\nThird end", "user"),
        message(4, "Latest reply\nLatest middle\nLatest end"),
    ] })
    const scroll = f.transcript()
    const height = scroll.scrollHeight
    const bottom = scroll.viewport.y + scroll.viewport.height
    const initial = scroll.scrollTop
    await f.keys("s3k")
    expect(f.captureCharFrame()).toContain("▎Earlier line 0")
    for (const id of ["2", "3", "4"]) {
        await f.keys("j")
        const row = scroll.getRenderable(id)!
        expect(row.y).toBeGreaterThan(scroll.viewport.y)
        expect(row.y + row.height).toBe(bottom)
        expect(scroll.scrollHeight).toBe(height)
        expect(scroll.getRenderable("session-navigation-slack")).toBeUndefined()
    }
    expect(scroll.scrollTop).toBe(initial)
    expect(f.captureCharFrame()).toContain("Third question")
    expect(f.captureCharFrame()).toContain("▎Latest end")
    expect(f.dispatched).toEqual([])
    await f.keys("3k")
    await f.keys("3j")
    expect(scroll.scrollTop).toBe(initial)
    await f.keys("gg")
    await f.keys("G")
    expect(scroll.scrollTop).toBe(initial)
    expect(scroll.scrollHeight).toBe(height)
    await f.keys("3kj")
    expect(f.captureCharFrame()).toContain("▎Second reply")
})

test("scrolling down reveals individual text parts at the bottom edge", async () => {
    const reply = message(2, "First part\nFirst end")
    reply.content!.push({ type: "text", text: "Second part\nSecond end" })
    const f = await mount({}, { messages: [
        message(1, Array.from({ length: 20 }, (_, index) => `Old ${index}`).join("\n"), "user"), reply,
    ] })
    await f.keys("sgg")
    await f.keys("j")
    const scroll = f.transcript()
    const first = scroll.getRenderable("2")!
    expect(first.y + first.height).toBe(scroll.viewport.y + scroll.viewport.height)
    expect(f.captureCharFrame()).toContain("▎First part")
    expect(f.captureCharFrame()).not.toContain("▎Second end")
    await f.keys("j")
    const last = scroll.getRenderable("session-part:2:text:1")!
    expect(last.y + last.height).toBe(scroll.viewport.y + scroll.viewport.height)
    expect(f.captureCharFrame()).toContain("▎Second end")
    expect(scroll.getRenderable("session-navigation-slack")).toBeUndefined()
})

test("windowed messages mount through ordinary scrolling and return to the natural bottom", async () => {
    const f = await mount({}, { messages: [
        message(1, "Oldest question", "user"),
        message(2, Array.from({ length: 20 }, (_, index) => `Older reply ${index}`).join("\n")),
        message(3, "Visible question", "user"),
        message(4, Array.from({ length: 20 }, (_, index) => `Visible reply ${index}`).join("\n")),
        message(5, "Latest reply"),
    ], window: { start: 2, end: 4 } })
    await f.keys("s")
    expect(f.captureCharFrame()).toContain("▎Latest reply")
    expect(f.dispatched).toEqual(["session.line.down"])
    await f.keys("3k")
    expect(f.dispatched).toContain("session.line.up")
    await f.keys("yy")
    expect(f.copied.at(-1)).toContain("Older reply 0")
    expect(f.captureCharFrame()).toContain("▎Older reply")
    await f.keys("3j")
    const scroll = f.transcript()
    expect(scroll.getRenderable("5")!.y + 1).toBe(scroll.viewport.y + scroll.viewport.height)
    expect(scroll.scrollTop).toBe(scroll.scrollHeight - scroll.viewport.height)
    expect(scroll.getRenderable("session-navigation-slack")).toBeUndefined()
    expect(f.dispatched.every((command) => command.startsWith("session.line."))).toBe(true)
})

test("older-history compensation finishes before selecting a newly loaded message", async () => {
    const f = await mount({}, { messages: [message(3, "Current question", "user"), message(4, "Current reply")], older: [
        message(1, Array.from({ length: 20 }, (_, index) => `Old question ${index}`).join("\n"), "user"),
        message(2, "Previous reply"),
    ] })
    await f.keys("s2k")
    expect(f.captureCharFrame()).toContain("▎Previous reply")
    await f.keys("yy")
    expect(f.copied.at(-1)).toBe("Previous reply")
    await f.keys("2j")
    const scroll = f.transcript()
    expect(scroll.scrollTop).toBe(scroll.scrollHeight - scroll.viewport.height)
    expect(scroll.getRenderable("session-navigation-slack")).toBeUndefined()
    expect(f.dispatched).toEqual(["session.line.up"])
    await f.keys("gg")
    await f.keys("k")
    await f.keys("jyy")
    expect(f.copied.at(-1)).toBe("Previous reply")
})
