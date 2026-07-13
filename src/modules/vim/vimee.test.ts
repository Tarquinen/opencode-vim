import { describe, expect, test } from "bun:test"
import type { KeyEvent } from "@opentui/core"
import type { PromptContext } from "../../prompt/types"
import { createVimConfig } from "./config"
import type { VimLog } from "./log"
import { createVimState, type VimMode } from "./state"
import { createVimeeAdapter } from "./vimee"

describe("vim command keymaps", () => {
    test("does not restore stale cursor state after a normal command", () => {
        const fixture = createFixture("normal", "command:test.run")
        fixture.dispatch = () => {
            fixture.input.plainText = "updated"
            fixture.input.cursorOffset = 7
        }

        expect(fixture.handle()).toBe(true)
        expect(fixture.commands).toEqual(["test.run"])
        expect(fixture.input.cursorOffset).toBe(7)
    })

    test("uses the host history boundary and restores display width", () => {
        const fixture = createFixture("normal", "command:prompt.history.next", "中")
        let boundary = -1
        fixture.dispatch = () => {
            boundary = fixture.input.cursorOffset
            fixture.input.plainText = "中中"
            fixture.input.cursorOffset = 2
        }

        expect(fixture.handle()).toBe(true)
        expect(boundary).toBe(1)
        expect(fixture.input.cursorOffset).toBe(4)
    })

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

describe("vim prompt history", () => {
    test("starts from an empty prompt and continues through history", () => {
        const fixture = createFixture("normal", undefined, "")
        const entries = ["newest", "older", ""]
        fixture.dispatch = (command) => {
            fixture.input.plainText = entries.shift() ?? ""
            fixture.input.cursorOffset = command === "prompt.history.previous" ? 0 : fixture.input.plainText.length
        }

        expect(fixture.handle("k")).toBe(true)
        expect(fixture.handle("k")).toBe(true)
        expect(fixture.handle("j")).toBe(true)
        expect(fixture.commands).toEqual([
            "prompt.history.previous",
            "prompt.history.previous",
            "prompt.history.next",
        ])
    })

    test("keeps normal movement for a nonempty prompt", () => {
        const fixture = createFixture("normal", undefined, "text")

        expect(fixture.handle("k")).toBe(true)
        expect(fixture.handle("j")).toBe(true)
        expect(fixture.commands).toEqual([])
    })

    test("stops history navigation after another normal key", () => {
        const fixture = createFixture("normal", undefined, "")
        fixture.dispatch = () => {
            fixture.input.plainText = "recalled"
        }

        expect(fixture.handle("k")).toBe(true)
        expect(fixture.handle("h")).toBe(true)
        expect(fixture.handle("k")).toBe(true)
        expect(fixture.commands).toEqual(["prompt.history.previous"])
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
    const prompt = {
        current: { input: text, mode: "normal", parts: [] },
        set() {},
        submit() {},
        blur() {},
    }
    const fixture = {
        input,
        commands,
        dispatch: (_command: string) => {},
        handle: (key = mappedKey) => adapter.handle({ name: key } as KeyEvent, key, ctx),
    }
    const ctx = {
        api: {
            renderer: { currentFocusedRenderable: input },
            keymap: {
                dispatchCommand(command: string) {
                    commands.push(command)
                    fixture.dispatch(command)
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
