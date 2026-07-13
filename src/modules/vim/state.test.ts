import { describe, expect, test } from "bun:test"
import { createVimState } from "./state"

describe("vim state", () => {
    test("isolates listener errors", () => {
        const events: string[] = []
        const state = createVimState("normal", (event) => events.push(event))
        state.subscribe(() => {
            throw new Error("stale renderable")
        })
        state.subscribe(() => events.push("listener.complete"))

        expect(() => state.setMode("insert")).not.toThrow()
        expect(state.mode()).toBe("insert")
        expect(events).toContain("state.listener.error")
        expect(events).toContain("listener.complete")
    })
})
