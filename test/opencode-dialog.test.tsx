import { expect, test } from "bun:test"
import { InputRenderable } from "@opentui/core"
import { testRender, type JSX } from "@opentui/solid"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"
import { createSignal, onMount } from "solid-js"
import { mkdtemp, rm } from "node:fs/promises"
import plugin from "../tui"

// Optional integration with the real OpenCode providers, keymap, and dialog UI.
// The ordinary suite also exercises InputRenderable without a source checkout.
test.skipIf(!process.env.OPENCODE_SOURCE)("OpenCode DialogSelect: Vim filtering, navigation, selection and closing", async () => {
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
        plugin.setup({
            renderer: screen!.renderer,
            options: { defaultMode: "insert" },
            get theme() { return themes.currentTokens() },
            storage: { store: () => [{ enabled: true }, () => {}] },
            keymap: { ...keymap, ...keymapState, layer: Keymap.createLayer },
            ui: {
                router: { current: () => ({ type: "home" }) }, toast: { show() {} },
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
        return <>{app()()}</>
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
    } finally {
        screen?.renderer.destroy()
        await rm(directory, { recursive: true, force: true })
    }
}, 30000)
