import assert from "node:assert/strict"
import type { Fixture } from "../fixture"
import { readerContains, selected } from "../screens"

export function permissionTools(grouped: boolean) {
    return async ({ terminal, request, sessionID }: Fixture) => {
        const { keys, type, screen } = terminal
        await request(`/api/session/${sessionID}`, { permissions: [{ action: "*", resource: "*", effect: "ask" }] }, "PATCH")
        await keys("Escape")
        await type("s")
        await screen("session-before-permission", (text) => text.includes("SESSION"))
        const permission = (await request(`/api/session/${sessionID}/permission`, {
            action: "read", resources: ["blocked.ts"], source: { type: "tool", messageID: "msg_permission_2", id: "blocked" },
        })).data
        assert.equal(permission.effect, "ask")
        assert.equal((await request(`/api/session/${sessionID}/permission`)).data[0].source.id, "blocked")
        await type("gg")
        await screen("first-message", (text) => selected(text, "Check blocked and ordinary tools"))
        await type("j")
        if (grouped) {
            await screen("collapsed-group", (text) => selected(text, "read") && text.includes("blocked.ts"))
            await keys("Enter")
            await screen("expanded", (text) => text.includes("ordinary.ts"))
            await type("j")
        }
        // OpenCode moves blocked reads after ordinary reads, even with grouping
        // disabled. Source order is deliberately the reverse of display order.
        const paths = ["ordinary.ts", "blocked.ts"]
        for (const name of paths) {
            const other = name === "ordinary.ts" ? "blocked.ts" : "ordinary.ts"
            await screen(`${name}-selected`, (text) => selected(text, name) && !selected(text, other))
            await keys("Enter")
            await screen(`${name}-reader`, (text) => text.includes("v select") && readerContains(text, "ordinary-output") === (name === "ordinary.ts") && !readerContains(text, other))
            await type("ggVGy")
            await screen(`${name}-copied`, (text) => text.includes("Copied"))
            assert.equal(terminal.clipboard(), name === "ordinary.ts" ? "ordinary-output\n" : "Read blocked.ts\n")
            await keys("Escape")
            await type("j")
        }
        await request(`/api/session/${sessionID}/permission/${permission.id}/reply`, { decision: "reject" })
        assert.deepEqual((await request(`/api/session/${sessionID}/permission`)).data, [])
    }
}
