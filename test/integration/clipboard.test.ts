import { afterAll, afterEach, expect, spyOn, test } from "bun:test"
import * as OpenTUI from "@opentui/core"
import { createFixture } from "../helpers/fixture"
import { createClipboardFixture } from "../helpers/clipboard-fixture"
import type { VimOptions } from "../../src/vim/config"
import type { VimClipboard } from "../../src/clipboard"

// Exercise our clipboard boundary and editor adapter directly. Only the desktop
// clipboard is controlled; there is no OpenCode plugin context or host UI here.
let clipboard = createClipboardFixture()
const factory = spyOn(OpenTUI, "createHostClipboard").mockImplementation(() => clipboard.host)
afterAll(() => factory.mockRestore())
let fixture: Awaited<ReturnType<typeof createFixture>> | undefined
let vimClipboard: VimClipboard | undefined
afterEach(async () => {
  await vimClipboard?.dispose()
  fixture?.dispose()
  fixture = undefined
  vimClipboard = undefined
})

async function mount(options: VimOptions = {}) {
  clipboard = createClipboardFixture()
  const { createVimClipboard } = await import("../../src/clipboard")
  const f = await createFixture("hello", options, 80, {
    onYank: (text) => {
      void vimClipboard!.write(text)
    },
    readClipboard: () => vimClipboard!.read(),
  })
  fixture = f
  const copied: string[] = []
  Object.defineProperty(f.renderer, "capabilities", {
    value: { remote: false, osc52_support: "supported" },
    configurable: true,
  })
  f.renderer.copyToClipboardOSC52 = (text) => {
    copied.push(text)
    return true
  }
  vimClipboard = createVimClipboard(f.renderer)
  return {
    ...f,
    clipboard,
    copied,
    async keys(keys: string) {
      await f.keys(keys)
      await new Promise<void>((resolve) => setImmediate(resolve))
    },
  }
}

test.each(["p", "P", "2p", "2P"])("%s pastes the current desktop clipboard with Vim counts and undo", async (key) => {
  const f = await mount()
  f.input.setText("")
  f.clipboard.text = "  中 👩‍💻\r\nsecond\r\n"
  await f.keys(key)
  const text = "  中 👩‍💻\nsecond"
  expect(f.input.plainText).toBe(key.startsWith("2") ? text + "\n" + text : text)
  await f.keys("u")
  expect(f.input.plainText).toBe("")
  f.mockInput.pressKey("r", { ctrl: true })
  expect(f.input.plainText).toContain(text)
})

test("p reads external changes instead of reusing an earlier yank", async () => {
  const f = await mount()
  await f.keys("yiw")
  expect(f.clipboard.text).toBe("hello")
  f.clipboard.text = "outside"
  await f.keys("$p")
  expect(f.input.plainText).toBe("hellooutside")
  f.clipboard.text = "new"
  await f.keys("p")
  expect(f.input.plainText).toBe("hellooutsidenew")
  f.clipboard.text = ""
  await f.keys("p")
  expect(f.input.plainText).toBe("hellooutsidenew")
})

test("linewise clipboard text fills an empty prompt with no leading blank line and supports undo/redo", async () => {
  const f = await mount()
  const text = "quoted 中 👩‍💻\nsecond line"
  f.input.setText("")
  f.clipboard.text = text + "\n"
  await f.keys("p")
  expect(f.input.plainText).toBe(text)
  expect(f.input.cursorOffset).toBe(0)
  await f.keys("u")
  expect(f.input.plainText).toBe("")
  f.mockInput.pressKey("r", { ctrl: true })
  expect(f.input.plainText).toBe(text)
})

test.each(["yiw", "dd", "ciw", "x", "vlld"])("%s writes the system clipboard", async (key) => {
  const f = await mount()
  await f.keys(key)
  const expected = key === "dd" ? "hello\n" : key === "x" ? "h" : key === "vlld" ? "hel" : "hello"
  expect(f.clipboard.text).toBe(expected)
  expect(f.copied).toEqual([expected])
})

test("rapid ddp waits for the cut to reach the clipboard", async () => {
  const f = await mount()
  let finish!: () => void
  const writing = new Promise<void>((resolve) => {
    finish = resolve
  })
  f.clipboard.text = "unrelated"
  f.clipboard.host.writeText.mockImplementationOnce(async (text) => {
    await writing
    f.clipboard.text = text
    return { status: "written" }
  })
  await f.keys("dd")
  f.mockInput.pressKey("p")
  const put = f.settled()
  expect(f.input.plainText).toBe("")
  expect(f.clipboard.host.read).not.toHaveBeenCalled()
  finish()
  expect(await put).toBe(true)
  expect(f.input.plainText).toBe("hello")
  await f.keys("u")
  expect(f.input.plainText).toBe("")
})

test("rapid cuts reach the clipboard in order before a put reads it", async () => {
  const f = await mount()
  let finish!: () => void
  const writing = new Promise<void>((resolve) => {
    finish = resolve
  })
  f.clipboard.host.writeText.mockImplementationOnce(async (text) => {
    await writing
    f.clipboard.text = text
    return { status: "written" }
  })
  await f.keys("xx")
  f.mockInput.pressKey("p")
  const put = f.settled()
  expect(f.clipboard.host.writeText).toHaveBeenCalledTimes(1)
  finish()
  expect(await put).toBe(true)
  expect(f.input.plainText).toBe("lelo")
  expect(f.clipboard.text).toBe("e")
  expect(f.copied).toEqual(["h", "e"])
})

test("mapped puts and dot repeat refresh the clipboard", async () => {
  const f = await mount({ keymaps: { normal: { Q: "2p" } } })
  f.input.setText("")
  f.clipboard.text = "a"
  await f.keys("Q")
  expect(f.input.plainText).toBe("aa")
  f.clipboard.text = "b"
  await f.keys(".")
  expect(f.input.plainText).toBe("aabb")
  await f.keys("u")
  expect(f.input.plainText).toBe("aa")
})

test("a mapping can yank and put without pasting stale clipboard text", async () => {
  const f = await mount({ keymaps: { normal: { Q: "yiw$p" } } })
  f.clipboard.text = "external"
  await f.keys("Q")
  expect(f.input.plainText).toBe("hellohello")
  expect(f.clipboard.text).toBe("hello")
})

test("named yanks and puts stay separate from the clipboard", async () => {
  const f = await mount()
  f.clipboard.text = "external"
  await f.keys('"ayiw$"ap')
  expect(f.input.plainText).toBe("hellohello")
  expect(f.clipboard.text).toBe("external")
  expect(f.copied).toEqual([])
  expect(f.clipboard.host.read).not.toHaveBeenCalled()
  await f.keys("p")
  expect(f.input.plainText).toBe("hellohelloexternal")
})

test("failed clipboard reads and writes retain the shared fallback", async () => {
  const f = await mount()
  f.clipboard.host.read.mockRejectedValue(new Error("clipboard unavailable"))
  f.clipboard.host.writeText.mockRejectedValue(new Error("clipboard unavailable"))
  f.renderer.copyToClipboardOSC52 = () => false
  expect(await vimClipboard!.write("dialog")).toBe(false)
  await f.keys("$p")
  expect(f.input.plainText).toBe("hellodialog")
  await f.keys("0yiw")
  expect(await vimClipboard!.read()).toBe("hellodialog")
})

test("remote puts use shared yanks without reading the server's clipboard", async () => {
  const f = await mount()
  Object.defineProperty(f.renderer, "capabilities", { value: { remote: true, osc52_support: "supported" } })
  f.clipboard.text = "server clipboard"
  await f.keys("yiw$p")
  expect(f.input.plainText).toBe("hellohello")
  expect(f.clipboard.host.read).not.toHaveBeenCalled()
  expect(f.clipboard.host.writeText).not.toHaveBeenCalled()
  expect(f.copied).toEqual(["hello"])
})

test("an unavailable clipboard falls back, but an empty clipboard does not paste old text", async () => {
  const f = await mount()
  await f.keys("yiw")
  f.clipboard.host.read.mockResolvedValueOnce({ status: "unsupported" })
  await f.keys("$p")
  expect(f.input.plainText).toBe("hellohello")
  f.clipboard.host.read.mockResolvedValueOnce({ status: "empty" })
  await f.keys("p")
  expect(f.input.plainText).toBe("hellohello")
})

test.each(["edit", "cursor", "suspend", "cleanup"])("an adapter's pending put is cancelled on %s", async (change) => {
  const f = await mount()
  let finish!: () => void
  const reading = new Promise<void>((resolve) => {
    finish = resolve
  })
  const read = f.clipboard.host.read.getMockImplementation()!
  f.clipboard.text = "late"
  f.clipboard.host.read.mockImplementationOnce(async () => {
    await reading
    return read()
  })
  f.mockInput.pressKey("p")
  const put = f.settled()
  if (change === "edit") f.input.setText("edited")
  if (change === "cursor") f.input.cursorOffset = 2
  if (change === "suspend") f.adapter.suspend()
  if (change === "cleanup") f.adapter.cleanup()
  finish()
  expect(await put).toBe(false)
  expect(f.input.plainText).toBe(change === "edit" ? "edited" : "hello")
})

test("a newer yank wins over a read already in flight", async () => {
  const f = await mount()
  let finish!: () => void
  const reading = new Promise<void>((resolve) => {
    finish = resolve
  })
  f.clipboard.host.read.mockImplementationOnce(async () => {
    await reading
    return { status: "read", representation: { mimeType: "text/plain", bytes: new TextEncoder().encode("stale") } }
  })
  const read = vimClipboard!.read()
  await new Promise<void>((resolve) => setImmediate(resolve))
  await vimClipboard!.write("newer")
  finish()
  expect(await read).toBe("newer")
})
