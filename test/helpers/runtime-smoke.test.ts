import { expect, test } from "bun:test"
import { RGBA } from "@opentui/core"
import { usePluginFixture } from "./plugin"

const mount = usePluginFixture()

test("loaded plugin shares OpenTUI classes, Solid signals, rendering and cleanup", async () => {
    const f = await mount()
    expect(f.captureCharFrame()).toContain("NORMAL")
    await f.keys("xi")
    expect(f.input.plainText).toBe("ello")
    expect(f.input.cursorStyle.style).toBe("line")
    expect(f.captureCharFrame()).toContain("INSERT")
    f.setSuccess(RGBA.fromHex("#ff00ff"))
    await f.renderOnce()
    const status = f.captureSpans().lines.flatMap((line) => line.spans).find((span) => span.text.includes("INSERT"))
    expect(status?.fg).toEqual(RGBA.fromHex("#ff00ff"))
    f.mockInput.pressEscape()
    await f.keys("yiw")
    expect(f.clipboard.text).toBe("ello")
    f.input.blur()
    f.input.focus()
    expect(f.input.cursorStyle.style).toBe("block")
    const listeners = f.renderer.keyInput.listenerCount("keypress")
    f.unmount()
    await f.renderOnce()
    expect(f.renderer.keyInput.listenerCount("keypress")).toBe(listeners - 2)
    expect(f.captureCharFrame()).not.toContain("NORMAL")
    await f.keys("x")
    expect(f.input.plainText).toContain("x")
})
