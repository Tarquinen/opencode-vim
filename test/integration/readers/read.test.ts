import { expect, spyOn, test } from "bun:test"
import * as OpenTUI from "@opentui/core"
import { toolItem, useReaderFixture } from "../../helpers/reader"

const mount = useReaderFixture()
function read(result: string, path = "src/example.ts") {
  return toolItem("read", "Original read summary", {
    status: "completed",
    input: { path },
    content: [{ type: "text", text: result }],
  })
}

test.each([
  [80, 16],
  [120, 38],
])("saved code has scrolling line numbers and copies without the gutter at %ix%i", async (width, height) => {
  let finish!: (value: { highlights: [number, number, string][] }) => void
  const highlighting = spyOn(OpenTUI.getTreeSitterClient(), "highlightOnce").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  try {
    const lines = ['const greeting = "你好 👩‍💻";', `const wrapped = "${"long text ".repeat(15)}";`]
    for (let number = 43; number <= 100; number++) lines.push(`const value${number} = ${number};`)
    const text = lines.join("\n")
    const result = [
      "Read file src/example.ts, lines 41-100",
      ...lines.map((line, index) => `${index + 41}: ${line}`),
      "[Output truncated. Continue reading with offset: 101]",
    ].join("\n")
    const f = await mount(read(result), {}, { width, height })
    const input = f.reader()
    expect(input.plainText).toBe(text)
    expect(f.renderer.currentFocusedEditor).toBe(input)
    expect(f.captureCharFrame()).toContain("src/example.ts")
    expect(f.captureCharFrame()).toContain("Lines 41–100")
    expect(f.captureCharFrame()).toContain("Partial file")
    expect(f.captureCharFrame()).toMatch(/41\s+const greeting/)
    expect(highlighting).toHaveBeenCalledWith(text, "typescript")
    await f.keys("wviw")
    const offset = input.cursorOffset
    finish({ highlights: [[17, lines[0].length - 1, "string"]] })
    await f.renderOnce()
    expect(input.getSelectedText()).toBe("greeting")
    expect(input.cursorOffset).toBe(offset)
    expect(input.getLineHighlights(0)[0]).toMatchObject({ start: 17, end: Bun.stringWidth(lines[0]) - 1 })
    f.mockInput.pressEscape()
    await f.keys("ggVyxG")
    expect(f.copied.at(-1)).toBe(lines[0] + "\n")
    expect(input.plainText).toBe(text)
    expect(input.scrollY).toBeGreaterThan(0)
    expect(f.captureCharFrame()).toMatch(/100\s+const value100/)
    const cursor = f.renderer.getCursorState()
    expect(cursor.visible).toBe(true)
    expect(f.captureCharFrame().split("\n")[cursor.y - 1]).toContain("value100")
    const remembered = input.cursorOffset
    await f.reopen()
    expect(f.reader().cursorOffset).toBe(remembered)
    f.resize(44, 20)
    await f.keys("gg")
    expect(f.captureCharFrame()).toMatch(/41\s+const greeting/)
    expect(f.reader().plainText).toBe(text)
    f.unmount()
    finish({ highlights: [[0, 5, "function"]] })
    await f.renderOnce()
    expect(f.reader()).toBeUndefined()
  } finally {
    highlighting.mockRestore()
  }
})

test.each(["Read directory src, 0 entries", "Image read successfully", "Custom read result"])(
  "non-file results keep the default reader: %s",
  async (result) => {
    const f = await mount(read(result, "src"))
    expect(f.reader().plainText).toBe("Original read summary")
    expect(f.renderer.root.findDescendantById("vim-file-lines")).toBeUndefined()
  },
)

test.each(["Read file empty.unknown, 0 lines", "Read file empty.unknown, lines 1-1\n1: "])(
  "empty and blank files stay empty when copied: %s",
  async (result) => {
    const f = await mount(read(result, "empty.unknown"))
    await f.keys("yy")
    expect(f.reader().plainText).toBe("")
    expect(f.copied.at(-1)).toBe("\n")
    expect(f.captureCharFrame()).toContain(result.endsWith("0 lines") ? "Empty file" : "Lines 1–1")
  },
)
