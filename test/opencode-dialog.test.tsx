import { expect, test } from "bun:test"
import { InputRenderable, TextareaRenderable } from "@opentui/core"
import { testRender, type JSX } from "@opentui/solid"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"
import { createSignal, onMount, Show } from "solid-js"
import { mkdtemp, rm } from "node:fs/promises"
import plugin from "../tui"

// Optional integration with the real OpenCode providers, keymap, and dialog UI.
// The ordinary suite also exercises InputRenderable without a source checkout.
test.skipIf(!process.env.OPENCODE_SOURCE)("OpenCode dialogs: Vim filtering and the session message modal", async () => {
    // Bun can load nested dependencies without running runtime import rewriting.
    // Keep their Solid owner/context stack shared with this test's renderer.
    const solid = await import("solid-js")
    const store = await import("solid-js/store")
    Bun.plugin({
        name: "dialog-test-shared-solid",
        setup(build) {
            build.onLoad({ filter: /[/\\]node_modules[/\\]solid-js[/\\]dist[/\\]solid\.js$/ }, () => ({ exports: solid, loader: "object" }))
            build.onLoad({ filter: /[/\\]node_modules[/\\]solid-js[/\\]store[/\\]dist[/\\]store\.js$/ }, () => ({ exports: store, loader: "object" }))
        },
    })
    ensureRuntimePluginSupport()
    const root = `${process.env.OPENCODE_SOURCE}/packages/tui`
    const [{ ConfigProvider }, { ThemeProvider, useThemes }, { Keymap }, { DialogProvider, useDialog },
        { DialogSelect }, { ToastProvider }, { TestTuiContexts }, { createTuiResolvedConfig }] = await Promise.all([
        import(`${root}/src/config/index.tsx`),
        import(`${root}/src/context/theme.tsx`),
        import(`${root}/src/context/keymap.tsx`),
        import(`${root}/src/ui/dialog.tsx`),
        import(`${root}/src/ui/dialog-select.tsx`),
        import(`${root}/src/ui/toast.tsx`),
        import(`${root}/test/fixture/tui-environment.tsx`),
        import(`${root}/test/fixture/tui-runtime.ts`),
    ])
    const directory = await mkdtemp("/tmp/opencode/vim-dialog-")
    const selected: string[] = []
    const moved: string[] = []
    let ref: { filter: string; selected?: { value: string } } | undefined
    let dialog: { stack: unknown[] } | undefined
    let screen: Awaited<ReturnType<typeof testRender>> | undefined
    let showSession = () => {}
    let prompt: TextareaRenderable | undefined
    const messageText = "one two\nsecond line"
    const options: Array<{ title: string; value: string }> = []
    for (let index = 0; index < 25; index++) options.push({ title: `Alpha ${index}`, value: String(index) })
    options.push({ title: "Beta", value: "beta" })

    function Fixture() {
        const keymap = Keymap.use()
        const keymapState = Keymap.useState()
        const themes = useThemes()
        const hostDialog = useDialog()
        dialog = hostDialog
        const [app, setApp] = createSignal<() => JSX.Element>(() => null)
        const [inSession, setInSession] = createSignal(false)
        showSession = () => setInSession(true)
        Keymap.createLayer(() => ({ mode: "base", commands: [{ id: "prompt.submit", run() {} }] }))
        plugin.setup({
            renderer: screen!.renderer,
            options: { defaultMode: "insert" },
            get theme() { return themes.currentTokens() },
            storage: { store: () => [{ enabled: true }, () => {}] },
            keymap: { ...keymap, ...keymapState, layer: Keymap.createLayer },
            data: { session: { message: { list: () => [{ id: "message-1", type: "user", text: messageText, time: { created: 1 } }] } } },
            ui: {
                router: { current: () => inSession() ? { type: "session", sessionID: "session-1" } : { type: "home" } }, toast: { show() {} },
                dialog: {
                    show: (view: () => JSX.Element, onClose?: () => void) => hostDialog.replace(view, onClose),
                    set: (options: { size: string; centered: boolean }) => { hostDialog.setSize(options.size); hostDialog.setCentered(options.centered) },
                    clear: () => hostDialog.clear(),
                },
                slot(claim: { append?: string; render: () => JSX.Element }) {
                    if (claim.append === "app") setApp(() => claim.render)
                    return () => {}
                },
            },
        } as unknown as Parameters<typeof plugin.setup>[0])
        onMount(() => hostDialog.replace(() => <DialogSelect
            title="Vim dialog integration"
            options={options}
            ref={(value: typeof ref) => { ref = value }}
            onMove={(option: { value: string }) => moved.push(option.value)}
            onSelect={(option: { value: string }) => selected.push(option.value)}
        />))
        return <>
            {app()()}
            <Show when={inSession()}>
                <scrollbox height={16} width={76} left={2}>
                    <box id="message-1"><text>{messageText}</text></box>
                </scrollbox>
                <textarea id="main-prompt" height={3} ref={(value: TextareaRenderable) => { prompt = value }} initialValue="Draft" />
            </Show>
        </>
    }

    // Defer mounting until testRender has returned the renderer used by the plugin.
    const [ready, setReady] = createSignal(false)
    try {
        screen = await testRender(() => <TestTuiContexts directory={directory} paths={{ home: directory, state: directory, worktree: directory }}>
            <ConfigProvider config={createTuiResolvedConfig()}>
                <Keymap.Provider>
                    <ThemeProvider mode="dark" source={{ discover: async () => ({}) }}>
                        <ToastProvider><DialogProvider>{ready() ? <Fixture /> : null}</DialogProvider></ToastProvider>
                    </ThemeProvider>
                </Keymap.Provider>
            </ConfigProvider>
        </TestTuiContexts>, { width: 80, height: 24, kittyKeyboard: true })
        setReady(true)
        screen.renderer.start()
        await screen.waitFor(() => screen!.renderer.currentFocusedEditor instanceof InputRenderable)
        screen.mockInput.pressEscape()
        expect(dialog!.stack).toHaveLength(1)
        screen.mockInput.pressKey("j")
        expect(ref?.selected?.value).toBe("1")
        screen.mockInput.pressKey("k")
        expect(ref?.selected?.value).toBe("0")
        for (let index = 0; index < 15; index++) screen.mockInput.pressKey("j")
        expect(ref?.selected?.value).toBe("15")
        await screen.waitForFrame((frame) => frame.includes("Alpha 15"))
        screen.mockInput.pressKey("i")
        await screen.mockInput.typeText("betax")
        screen.mockInput.pressEscape()
        screen.mockInput.pressKey("x")
        expect(ref?.filter).toBe("beta")
        expect(ref?.selected?.value).toBe("beta")
        screen.mockInput.pressKey("u")
        expect(ref?.filter).toBe("betax")
        screen.mockInput.pressKey("r", { ctrl: true })
        expect(ref?.filter).toBe("beta")
        screen.mockInput.pressEnter()
        expect(selected).toEqual(["beta"])
        expect(moved).toContain("15")
        screen.mockInput.pressEscape()
        expect(dialog!.stack).toHaveLength(0)

        showSession()
        await screen.flush()
        prompt!.focus()
        screen.mockInput.pressEscape()
        screen.mockInput.pressKey("s")
        screen.mockInput.pressEnter()
        await screen.waitFor(() => screen!.renderer.currentFocusedEditor?.id === "vim-session-message")
        const reader = () => screen!.renderer.root.findDescendantById("vim-session-message") as TextareaRenderable | undefined
        expect(dialog!.stack).toHaveLength(1)
        await screen.flush()
        const modal = screen.renderer.root.findDescendantById("vim-message-reader")!
        expect(modal.x).toBeGreaterThan(0)
        expect(modal.y).toBeGreaterThan(0)
        expect(modal.y + modal.height).toBeLessThan(24)
        screen.mockInput.pressKey("w")
        screen.mockInput.pressKey("v")
        screen.mockInput.pressKey("l")
        expect(reader()!.getSelectedText()).toBe("tw")
        screen.mockInput.pressEscape()
        expect(dialog!.stack).toHaveLength(1)
        expect(reader()!.hasSelection()).toBe(false)
        screen.mockInput.pressEscape()
        await screen.waitFor(() => dialog!.stack.length === 0)
        screen.mockInput.pressEnter()
        expect(reader()!.cursorOffset).toBe(5)
        screen.mockInput.pressKey("c", { ctrl: true })
        expect(dialog!.stack).toHaveLength(0)
        screen.mockInput.pressEnter()
        expect(reader()!.plainText).toBe(messageText)
        screen.mockInput.pressKey("s")
        await screen.waitFor(() => dialog!.stack.length === 0 && screen!.renderer.currentFocusedEditor === prompt)
        await new Promise((resolve) => setTimeout(resolve, 10))
        expect(screen.renderer.currentFocusedEditor).toBe(prompt!)
        expect(prompt!.plainText).toBe("Draft")
    } finally {
        screen?.renderer.destroy()
        await rm(directory, { recursive: true, force: true })
    }
}, 30000)
