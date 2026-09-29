import { expect, test } from "bun:test"
import { RGBA, type LineNumberRenderable, type TextRenderable } from "@opentui/core"
import { toolItem, useReaderFixture } from "../../helpers/reader"

const mount = useReaderFixture()
function change(
  status = "modified",
  patch = '--- src/change.ts\n+++ src/change.ts\n@@ -10,3 +10,4 @@\n const keep = 1;\n-const text = "old";\n+const text = "你好 👩‍💻";\n+const extra = 2;\n console.log(text);\n@@ -90,1 +91,1 @@\n-const tail = "old";\n+const tail = "new";\n',
) {
  return toolItem("edit", "Edit src/change.ts", {
    status: "completed",
    input: { path: "src/change.ts", oldString: "stale input", newString: "unformatted input" },
    content: [{ type: "text", text: "Edited src/change.ts" }],
    metadata: { files: [{ file: "src/change.ts", status, additions: 3, deletions: 2, patch }] },
  })
}

test.each(["after", "before", "diff"] as const)("change views honor diffView=%s", async (diffView) => {
  const f = await mount(change(), { diffView })
  const active = f.renderer.root.findDescendantById(`vim-change-view-${diffView}`) as TextRenderable
  expect(active.bg).toEqual(RGBA.fromHex("#006699"))
  for (const view of ["After", "Before", "Diff"]) expect(f.captureCharFrame()).toContain(view)
  expect(f.captureCharFrame()).toContain("v select · tab switch view · s prompt")
  expect(f.reader().plainText.includes('const text = "old";')).toBe(diffView !== "after")
  expect(f.reader().plainText.includes('const text = "你好 👩‍💻";')).toBe(diffView !== "before")
  expect(f.reader().plainText).not.toContain("@@")
  expect(f.renderer.currentFocusedEditor).toBe(f.reader())
  const next = diffView === "after" ? "before" : "after"
  const tab = f.renderer.root.findDescendantById(`vim-change-view-${next}`)!
  await f.mockMouse.click(tab.x, tab.y)
  await f.renderOnce()
  expect(f.captureCharFrame()).toContain(next === "after" ? "Code after change" : "Code before change")
  expect(f.reader().plainText.includes('const text = "old";')).toBe(next === "before")
  expect(f.renderer.currentFocusedEditor).toBe(f.reader())
})

test("change views scroll through excerpts, copy without signs and preserve per-view positions", async () => {
  const f = await mount(change())
  await f.keys("xjVy")
  expect(f.copied.at(-1)).toBe('const text = "你好 👩‍💻";\n')
  const afterOffset = f.reader().cursorOffset
  f.mockInput.pressTab()
  await f.keys("jVy")
  expect(f.copied.at(-1)).toBe('const text = "old";\n')
  f.mockInput.pressTab()
  await f.keys("jVy")
  expect(f.copied.at(-1)).toBe('const text = "old";\n')
  const gutter = f.renderer.root.findDescendantById("vim-file-lines") as LineNumberRenderable
  expect(gutter.getLineColors().content.get(1)).toEqual(RGBA.fromHex("#330000"))
  expect(gutter.getLineColors().content.get(2)).toEqual(RGBA.fromHex("#003300"))
  expect(f.captureCharFrame()).toMatch(/11\s*-\s*const text/)
  expect(f.captureCharFrame()).toMatch(/11\s*\+\s*const text/)
  await f.keys("GVy")
  expect(f.copied.at(-1)).toBe('const tail = "new";\n')
  expect(f.reader().scrollY).toBeGreaterThan(0)
  expect(f.captureCharFrame()).toMatch(/90\s*-\s*const tail/)
  expect(f.captureCharFrame()).toMatch(/91\s*\+\s*const tail/)
  const diffOffset = f.reader().cursorOffset
  f.mockInput.pressTab()
  await f.renderOnce()
  expect(f.reader().cursorOffset).toBe(afterOffset)
  expect(f.captureCharFrame()).toMatch(/10\s+const keep/)
  await f.keys("ggVGy")
  expect(f.copied.at(-1)).toBe(
    'const keep = 1;\nconst text = "你好 👩‍💻";\nconst extra = 2;\nconsole.log(text);\n\nconst tail = "new";\n',
  )
  await f.keys("v")
  f.mockInput.pressTab()
  await f.renderOnce()
  expect(f.reader().hasSelection()).toBe(false)
  expect(f.captureCharFrame()).not.toContain("VISUAL")
  f.mockInput.pressTab()
  await f.renderOnce()
  expect(f.reader().cursorOffset).toBe(diffOffset)
  f.resize(44, 20)
  await f.renderOnce()
  expect(f.reader().plainText).toContain('const tail = "new";')
  await f.keys("s")
  expect(f.close).toHaveBeenCalledTimes(1)
})

test("change shortcuts can be remapped while Tab passes through", async () => {
  const f = await mount(change(), { keymaps: { session: { "<Tab>": "passthrough", "<C-w>w": "switch-panel" } } })
  expect(f.captureCharFrame()).toContain("v select · <C-w>w switch view · s prompt")
  expect(f.captureCharFrame()).not.toContain("tab switch view")
  const original = f.reader()
  let tabs = 0
  f.renderer.keyInput.on("keypress", (event) => {
    if (event.name === "tab" && !event.defaultPrevented) tabs++
  })
  f.mockInput.pressTab()
  expect(tabs).toBe(1)
  expect(f.reader()).toBe(original)
  f.mockInput.pressKey("w", { ctrl: true })
  await f.keys("w")
  expect(f.captureCharFrame()).toContain("Code before change")
  await f.keys("GVy")
  expect(f.copied.at(-1)).toBe('const tail = "old";\n')
})

test("change views remain clickable when keyboard cycling is disabled", async () => {
  const f = await mount(change(), { keymaps: { session: { "<Tab>": "passthrough" } } })
  expect(f.captureCharFrame()).toContain("v select · s prompt")
  expect(f.captureCharFrame()).not.toContain("switch view")
  await f.keys("v")
  const tab = f.renderer.root.findDescendantById("vim-change-view-diff")!
  await f.mockMouse.click(tab.x, tab.y)
  await f.renderOnce()
  expect(f.captureCharFrame()).toContain("Changes")
  expect(f.reader().plainText).toContain('const text = "old";')
  expect(f.reader().plainText).toContain('const text = "你好 👩‍💻";')
  expect(f.reader().hasSelection()).toBe(false)
  expect(f.renderer.currentFocusedEditor).toBe(f.reader())
})

test.each([
  ["added", "before", "--- /dev/null\n+++ src/change.ts\n@@ -0,0 +1,1 @@\n+added line\n", "After", "added line"],
  ["deleted", "after", "--- src/change.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-deleted line\n", "Before", "deleted line"],
] as const)("%s files fall back from the unavailable %s view", async (status, diffView, patch, label, text) => {
  const f = await mount(change(status, patch), { diffView })
  expect(f.reader().plainText).toBe(text)
  expect(f.captureCharFrame()).toContain(`Code ${label.toLowerCase()} change`)
  expect(
    f.renderer.root.findDescendantById(status === "added" ? "vim-change-view-before" : "vim-change-view-after"),
  ).toBeUndefined()
  f.mockInput.pressTab()
  await f.renderOnce()
  expect(f.captureCharFrame()).toContain("Changes")
  f.mockInput.pressTab()
  await f.renderOnce()
  expect(f.captureCharFrame()).toContain(`Code ${label.toLowerCase()} change`)
})

test("unrecognized saved changes retain the generic view", async () => {
  const f = await mount(change("modified", "no patch available"))
  expect(f.reader().plainText).toBe("Edit src/change.ts")
  expect(f.renderer.root.findDescendantById("vim-change-view-after")).toBeUndefined()
})
