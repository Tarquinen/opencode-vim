import { describe, expect, test } from "bun:test"
import type { KeyEvent } from "@opentui/core"
import type { PromptContext } from "../../src/modules/vim/actions"
import { createVimConfig } from "../../src/modules/vim/config"
import type { VimLog } from "../../src/modules/vim/log"
import { createVimState, type VimMode } from "../../src/modules/vim/state"
import { createVimeeAdapter } from "../../src/modules/vim/vimee"

describe("vim command keymaps", () => {
    test("dispatches commands in insert mode", () => {
        const fixture = createFixture("insert", "command:test.run")

        expect(fixture.handle()).toBe(true)
        expect(fixture.commands).toEqual(["test.run"])
    })

    test("rejects an empty command name", () => {
        const logs: Array<[string, unknown]> = []
        createFixture("normal", "command:   ", "", (event, data) => logs.push([event, data]))

        expect(logs.some(([event]) => event === "vimee.keymap.invalid")).toBe(true)
    })
})

describe("vim enter keymaps", () => {
    test("submits unmapped Enter in normal mode without moving the cursor", () => {
        const fixture = createFixture("normal", undefined, "中")
        fixture.input.cursorOffset = 2

        expect(fixture.handle("<CR>")).toBe(true)
        expect(fixture.submissions).toHaveLength(1)
        expect(fixture.input.cursorOffset).toBe(2)
    })

    test("passes unmapped Enter through in insert mode", () => {
        const fixture = createFixture("insert", undefined)

        expect(fixture.handle("<CR>")).toBe(false)
        expect(fixture.submissions).toHaveLength(0)
    })

    test("does not submit a matched mapping with no immediate actions", () => {
        const fixture = createFixture("normal", "d", "text", () => {}, "<CR>")

        expect(fixture.handle("<CR>")).toBe(true)
        expect(fixture.submissions).toHaveLength(0)
    })

    test("runs an Enter command mapping", () => {
        const fixture = createFixture("normal", "command:test.run", "", () => {}, "<CR>")

        expect(fixture.handle("<CR>")).toBe(true)
        expect(fixture.commands).toEqual(["test.run"])
        expect(fixture.submissions).toHaveLength(0)
    })

    test("applies mode and submit mappings", () => {
        const normal = createFixture("normal", "insert", "", () => {}, "<CR>")
        const insert = createFixture("insert", "submit", "", () => {}, "<CR>")

        expect(normal.handle("<CR>")).toBe(true)
        expect(normal.handle("a")).toBe(false)
        expect(insert.handle("<CR>")).toBe(true)
        expect(insert.submissions).toHaveLength(1)
    })

    test("allows Enter to finish a multi-key mapping", () => {
        const fixture = createFixture("normal", "command:test.run", "", () => {}, "g<CR>")

        expect(fixture.handle("g")).toBe(true)
        expect(fixture.handle("<CR>")).toBe(true)
        expect(fixture.commands).toEqual(["test.run"])
        expect(fixture.submissions).toHaveLength(0)
    })

    test("rejects mappings that defer Enter", () => {
        const logs: Array<[string, unknown]> = []
        const fixture = createFixture("normal", "command:test.run", "", (event, data) => logs.push([event, data]), "<CR>x")

        expect(fixture.handle("<CR>")).toBe(true)
        expect(fixture.submissions).toHaveLength(1)
        expect(logs.some(([event]) => event === "vimee.keymap.invalid")).toBe(true)
    })
})

describe("vim prompt history", () => {
    test("keeps normal movement for a nonempty prompt", () => {
        const fixture = createFixture("normal", undefined, "text")

        expect(fixture.handle("k")).toBe(true)
        expect(fixture.handle("j")).toBe(true)
        expect(fixture.commands).toEqual([])
    })

    test("prefers configured keymaps", () => {
        const fixture = createFixture("normal", "command:test.run", "", () => {}, "k")

        expect(fixture.handle()).toBe(true)
        expect(fixture.commands).toEqual(["test.run"])
    })

    test("completes a pending keymap before history navigation", () => {
        const fixture = createFixture("normal", "command:test.run", "", () => {}, "gk")

        expect(fixture.handle("g")).toBe(true)
        expect(fixture.handle("k")).toBe(true)
        expect(fixture.commands).toEqual(["test.run"])
    })
})

function createFixture(mode: VimMode, action: string | undefined, text = "text", log: VimLog = () => {}, mappedKey = "Q") {
    const input = {
        plainText: text,
        cursorOffset: 0,
        visualCursor: { visualRow: 0, visualCol: 0, offset: 0 },
        moveCursorLeft: () => false,
    }
    const commands: string[] = []
    const submissions: true[] = []
    const prompt = {
        current: { input: text, mode: "normal", parts: [] },
        set() {},
        submit() {
            submissions.push(true)
        },
        blur() {},
    }
    const fixture = {
        input,
        commands,
        submissions,
        handle: (key = mappedKey) => adapter.handle({ name: key } as KeyEvent, key, ctx),
    }
    const ctx = {
        api: {
            renderer: { currentFocusedRenderable: input },
            keymap: {
                dispatchCommand(command: string) {
                    commands.push(command)
                    return { ok: true as const }
                },
            },
        },
        prompt: () => prompt,
        requestRender() {},
    } as unknown as PromptContext
    const config = createVimConfig({
        defaultMode: mode,
        keymaps: action ? { [mode]: { [mappedKey]: action } } : undefined,
    })
    const adapter = createVimeeAdapter(createVimState(mode), config, log)
    return fixture
}
