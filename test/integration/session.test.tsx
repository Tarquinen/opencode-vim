import { expect, mock, test } from "bun:test"
import type { Context } from "@opencode/plugin/tui/context"
import { TextareaRenderable, type KeyEvent } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { render } from "@opentui/solid"
import { createSignal, Show } from "solid-js"
import { createSessionMode, SESSION_MODE } from "../../src/session"
import { createVimConfig } from "../../src/modules/vim/config"
import type { VimClipboard } from "../../src/clipboard"
import { testTheme } from "../helpers/theme"

// Exercise our lifecycle with empty data and recorded API calls. There is no
// transcript renderer, command implementation, dialog or host focus manager.
test.each(["close", "route", "unmount"])("session %s releases mode, drawing and focus resources", async (exit) => {
    const screen = await createTestRenderer({ width: 40, height: 12 })
    try {
        const prompt = new TextareaRenderable(screen.renderer, { initialValue: "draft", width: 40, height: 3 })
        screen.renderer.root.add(prompt)
        prompt.focus()
        const [mounted, setMounted] = createSignal(true)
        const [route, setRoute] = createSignal({ type: "session", sessionID: "one" })
        let mode = "base"
        const pop = mock(() => { mode = "base" })
        const push = mock(() => { mode = SESSION_MODE; return pop })
        const dispatch = mock(() => {})
        const clear = mock(() => {})
        const context = {
            renderer: screen.renderer,
            theme: testTheme(),
            keymap: { mode: { current: () => mode, push }, layer() {}, pending: () => [], dispatch },
            data: { session: { message: { list: () => [] }, permission: { list: () => [] } } },
            ui: { router: { current: route }, dialog: { clear } },
        } as unknown as Context
        let session!: ReturnType<typeof createSessionMode>
        const listeners = screen.renderer.keyInput.listenerCount("keypress")
        function Session() {
            session = createSessionMode(context, createVimConfig({ keymaps: { normal: { j: "x" }, session: { j: "passthrough" } } }), {} as VimClipboard)
            return <box id="session-status" width={20} flexDirection="row"><session.Status /></box>
        }
        await render(() => <Show when={mounted()}><Session /></Show>, screen.renderer)
        await screen.renderOnce()
        // Constrained footer space must not wrap the hints and resize the transcript.
        expect(screen.renderer.root.findDescendantById("session-status")?.height).toBe(1)
        expect(session.enter()).toBe(true)
        expect(session.active()).toBe(true)
        expect(push).toHaveBeenCalledWith(SESSION_MODE)
        expect(dispatch).not.toHaveBeenCalled()
        const target = screen.renderer.currentFocusedRenderable!
        expect(target.id).toBe("vim-session-focus")
        const passed: string[] = []
        const observe = (event: KeyEvent) => { passed.push(event.name) }
        screen.renderer.keyInput.on("keypress", observe)
        screen.mockInput.pressKey("j")
        screen.mockInput.pressKey("TAB", { shift: true })
        screen.renderer.keyInput.off("keypress", observe)
        expect(passed).toEqual(["j", "tab"])
        expect(dispatch).not.toHaveBeenCalled()
        expect(session.active()).toBe(true)
        expect(prompt.plainText).toBe("draft")
        screen.mockInput.pressKey("k")
        expect(dispatch).toHaveBeenCalledWith("session.line.up")
        if (exit === "close") session.close()
        if (exit === "route") setRoute({ type: "session", sessionID: "two" })
        if (exit === "unmount") setMounted(false)
        await screen.renderOnce()
        expect(session.active()).toBe(false)
        expect(pop).toHaveBeenCalledTimes(1)
        expect(target.isDestroyed).toBe(true)
        expect(clear).not.toHaveBeenCalled()
        if (exit !== "route") expect(screen.renderer.currentFocusedEditor).toBe(prompt)
        setMounted(false)
        expect(screen.renderer.keyInput.listenerCount("keypress")).toBe(listeners)
    } finally { screen.renderer.destroy() }
})
