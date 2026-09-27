import { expect, test } from "bun:test"
import type { Context } from "@opencode/plugin/tui/context"
import * as pluginModule from "@opencode/plugin/tui"
import { testRender } from "@opentui/solid"
import { ensureRuntimePluginSupport } from "@opentui/solid/runtime-plugin-support/configure"
import { createSignal, For, Show } from "solid-js"
import { createTranscriptSelection } from "../src/transcript"

test.skipIf(!process.env.OPENCODE_SOURCE)("native transcript groups expose individual tools and reasoning", async () => {
    const solid = await import("solid-js")
    const store = await import("solid-js/store")
    Bun.plugin({ name: "transcript-test-shared-solid", setup(build) {
        build.onLoad({ filter: /[/\\]node_modules[/\\]solid-js[/\\]dist[/\\]solid\.js$/ }, () => ({ exports: solid, loader: "object" }))
        build.onLoad({ filter: /[/\\]node_modules[/\\]solid-js[/\\]store[/\\]dist[/\\]store\.js$/ }, () => ({ exports: store, loader: "object" }))
    } })
    ensureRuntimePluginSupport({ additional: { "@opencode/plugin/tui": pluginModule } })
    const root = `${process.env.OPENCODE_SOURCE}/packages/tui`
    const [{ ConfigProvider }, { ThemeProvider, useThemes }, { TestTuiContexts }, { createTuiResolvedConfig },
        { SessionGroupView }, { context: SessionContext }, { createTimelineAnchors },
        { reduceSessionRows, messageBoundaryIDs, sessionRowID, resolvePart }] = await Promise.all([
        import(`${root}/src/config/index.tsx`), import(`${root}/src/context/theme.tsx`),
        import(`${root}/test/fixture/tui-environment.tsx`), import(`${root}/test/fixture/tui-runtime.ts`),
        import(`${root}/src/routes/session/group-view.tsx`), import(`${root}/src/routes/session/render-context.tsx`),
        import(`${root}/src/routes/session/anchors.ts`), import(`${root}/src/routes/session/rows.ts`),
    ])
    const tool = (id: string) => ({ type: "tool", id, name: "read", time: { created: 1, completed: 2 },
        state: { status: "completed", input: { path: id }, content: [{ type: "text", text: `Contents of ${id}` }] } })
    const messages = [
        { id: "user-1", type: "user", text: "Question", time: { created: 0 } },
        { id: "reply-1", type: "assistant", time: { created: 1, completed: 2 }, content: [
            { type: "reasoning", text: "Check measurements", time: { created: 1, completed: 2 } },
            { type: "reasoning", text: "Check the cursor", time: { created: 1, completed: 2 } }, tool("first.ts"),
        ] },
        { id: "reply-2", type: "assistant", time: { created: 3, completed: 4 }, content: [tool("second.ts"), { type: "text", text: "Done" }] },
    ]
    let bridge: ReturnType<typeof createTranscriptSelection>
    let context: Context
    const [verbosity, setVerbosity] = createSignal("medium")
    const [grouping, setGrouping] = createSignal(true)
    const [thinking, setThinking] = createSignal("hide")
    const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})
    const [ready, setReady] = createSignal(false)
    let screen: Awaited<ReturnType<typeof testRender>>
    function Fixture() {
        const themes = useThemes()
        context = { renderer: screen.renderer, get theme() { return themes.currentTokens() },
            data: { session: { message: { list: () => messages } } }, keymap: { dispatch() {} },
        } as unknown as Context
        const rows = () => reduceSessionRows(messages, new Set(), false, verbosity())
        const boundaries = () => messageBoundaryIDs(rows(), messages)
        const message = (id: string) => messages.find((item) => item.id === id)
        const entry = (item: any) => {
            const source = message(item.ref.messageID)
            const part = resolvePart(source, item.ref.partID)
            return <box><text>{part.type === "tool" ? `Read ${part.id}\nContents of ${part.id}` : part.text}</text></box>
        }
        return <SessionContext.Provider value={{ anchors: createTimelineAnchors(), thinkingMode: thinking,
            markdownMode: () => "source", groupExploration: grouping, groupExpanded: (id: string) => expanded()[id] ?? false,
            setGroupExpanded: (id: string, value: boolean) => setExpanded({ ...expanded(), [id]: value }),
        }}>
            <scrollbox height={20} width={76} left={2}>
                <For each={rows()}>{(row, index) => <box id={sessionRowID(row, boundaries()[index()])} marginTop={1} flexShrink={0}>
                    <Show when={row.type === "group"} fallback={row.type === "message" ? <text>Question</text> : row.type === "part" ? entry(row) : null}>
                        <SessionGroupView row={row} message={message} entry={entry} images={() => null} />
                    </Show>
                </box>}</For>
            </scrollbox>
        </SessionContext.Provider>
    }
    screen = await testRender(() => <TestTuiContexts>
        <ConfigProvider config={createTuiResolvedConfig()}><ThemeProvider mode="dark" source={{ discover: async () => ({}) }}>
            <Show when={ready()}><Fixture /></Show>
        </ThemeProvider></ConfigProvider>
    </TestTuiContexts>, { width: 80, height: 24 })
    try {
        setReady(true)
        await screen.flush()
        bridge = createTranscriptSelection(context!, "session-1", () => {})
        bridge.latest()
        const current = () => bridge.sync()!.selected!
        const items = () => bridge.sync()!.ranges
        expect(current().text).toBe("Done")
        expect(items()).toHaveLength(4)
        bridge.move("previous", 1)
        expect(current().text).toBe("Explored: 2 reads")
        expect(bridge.toggle()).toBe(true)
        await screen.flush()
        expect(items()).toHaveLength(6)
        bridge.move("next", 1)
        expect(current().text).toContain("Read first.ts")
        expect(current().text).not.toContain("second.ts")
        bridge.move("next", 1)
        expect(current().text).toContain("Read second.ts")
        expect(bridge.toggle()).toBe(false)
        setExpanded({})
        await screen.flush()
        expect(current().text).toBe("Explored: 2 reads")
        bridge.move("previous", 1)
        expect(current().text).toContain("Thought")
        expect(bridge.toggle()).toBe(true)
        await screen.flush()
        bridge.move("next", 1)
        expect(current().text).toContain("Check measurements")
        bridge.move("next", 1)
        expect(current().text).toContain("Check the cursor")

        setVerbosity("low")
        setExpanded({})
        await screen.flush()
        bridge.latest()
        bridge.move("previous", 1)
        expect(current().text).toBe("2 thoughts, 2 reads")
        bridge.toggle()
        await screen.flush()
        bridge.move("next", 1)
        expect(current().text).toContain("Thought")
        bridge.toggle()
        await screen.flush()
        bridge.move("next", 2)
        expect(current().text).toContain("Check the cursor")
        bridge.move("next", 1)
        expect(current().text).toBe("Explored: 2 reads")
        bridge.toggle()
        await screen.flush()
        bridge.move("next", 2)
        expect(current().text).toContain("Read second.ts")
        bridge.move("next", 1)
        expect(current().text).toBe("Done")

        setVerbosity("medium")
        setGrouping(false)
        setThinking("show")
        await screen.flush()
        bridge.latest()
        bridge.move("previous", 1)
        expect(current().text).toContain("Read second.ts")
        bridge.move("previous", 1)
        expect(current().text).toContain("Read first.ts")
    } finally { screen.renderer.destroy() }
}, 30000)
