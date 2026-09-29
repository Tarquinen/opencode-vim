import assert from "node:assert/strict"
import type { Fixture } from "../support/fixture"

export function clipboardCancellation(action: "focus" | "route" | "toggle" | "unload") {
    return async ({ terminal, clipboard, probe, setVimLoaded }: Fixture) => {
        assert(clipboard)
        const { type, keys, screen } = terminal
        await type("original draft")
        await keys("Escape")
        await screen("original-prompt", async () => (await probe()).editor?.text === "original draft")
        await probe("remember")
        await type("p")
        await clipboard.waitForRead()
        // These keys must be discarded as well as the late clipboard response.
        await type("iQUEUED")
        if (action === "focus") await probe("dispatch", { command: "command.palette.show" })
        if (action === "route") await probe("route", { type: "home" })
        if (action === "toggle") await probe("dispatch", { command: "opencode-vim.toggle" })
        if (action === "unload") await setVimLoaded(false)
        await screen("host-transition", async (text) => {
            const state = await probe()
            if (action === "focus") return text.includes("Commands") && state.editor?.text === ""
            if (action === "route") return state.route.type === "home" && state.editor?.text === ""
            return !text.includes("NORMAL") && !text.includes("INSERT")
        })
        await clipboard.release()
        const state = await probe()
        assert(state.remembered.destroyed || state.remembered.text === "original draft")
        assert.equal(state.editor.text, action === "focus" || action === "route" ? "" : "original draft")
        // A subsequent real input turn also proves that queued keys didn't leak.
        if (action === "focus" || action === "route") await type("i")
        else await keys("C-e")
        await type("fresh")
        await screen("fresh-input", async () => (await probe()).editor?.text ===
            (action === "focus" || action === "route" ? "fresh" : "original draftfresh"))
    }
}
