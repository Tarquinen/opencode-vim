import { expect, test } from "bun:test"
import { createVimConfig } from "../../src/modules/vim/config"
import { availableViews, diffContent, diffSnapshot } from "../../src/readers/diff/data"
import type { TranscriptItem, TranscriptSource } from "../../src/transcript-items"

const files = [
  { file: "src/first.ts", status: "modified", additions: 2, deletions: 2,
    patch: '--- src/first.ts\n+++ src/first.ts\n@@ -10,2 +10,2 @@\n const keep = 1;\n-\told  \n+\t你好 👩‍💻  \n@@ -90,1 +90,1 @@\n-old end\n+new end\n\\ No newline at end of file\n' },
  { file: "new.ts", status: "added", additions: 1, deletions: 0,
    patch: "--- /dev/null\n+++ new.ts\n@@ -0,0 +1,1 @@\n+new file\n" },
  { file: "removed.ts", status: "deleted", additions: 0, deletions: 1,
    patch: "--- removed.ts\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-old file\n" },
]
type ToolResult = Extract<Extract<TranscriptSource, { type: "tool" }>["state"], { status: "completed" }>
function item(values: NonNullable<ToolResult["metadata"]>["files"] = files, fileIndex?: number): TranscriptItem {
  const source: Extract<TranscriptSource, { type: "tool" }> = {
    type: "tool", name: "patch", id: "patch", time: { created: 1 }, state: {
      status: "completed", input: { patchText: "not the formatted result" },
      content: [{ type: "text", text: "Updated files" }], metadata: { files: values },
    },
  }
  return { id: "selected", author: "patch", text: "Rendered summary", source, fileIndex }
}

test("change snapshots use the selected saved file and preserve excerpt ranges and whitespace", () => {
  const snapshot = diffSnapshot(item(files, 0))!
  expect(snapshot.path).toBe("src/first.ts")
  expect(snapshot.hunks).toHaveLength(2)
  const after = diffContent(snapshot.hunks, "after")
  expect(after.text).toBe("const keep = 1;\n\t你好 👩‍💻  \n\nnew end")
  expect([after.start, after.end]).toEqual([10, 90])
  expect([...after.numbers]).toEqual([[0, 10], [1, 11], [3, 90]])
  expect([...after.hideLineNumbers]).toEqual([2])
  expect(diffContent(snapshot.hunks, "before").text).toBe("const keep = 1;\n\told  \n\nold end")
  const diff = diffContent(snapshot.hunks, "diff")
  expect(diff.text).toBe("const keep = 1;\n\told  \n\t你好 👩‍💻  \n\nold end\nnew end")
  expect([...diff.numbers]).toEqual([[0, 10], [1, 11], [2, 11], [4, 90], [5, 90]])
  expect([...diff.hideLineNumbers]).toEqual([3])
  expect([...diff.signs]).toEqual([[1, "-"], [2, "+"], [4, "-"], [5, "+"]])
  expect(diffSnapshot(item(files, 1))?.path).toBe("new.ts")
  expect(diffSnapshot(item(files, 2))?.path).toBe("removed.ts")
  expect(diffSnapshot(item())).toBeUndefined()
})

test("empty hunk sides do not add phantom content or numbered separators", () => {
  const snapshot = diffSnapshot(item([{ ...files[0],
    patch: "--- src/first.ts\n+++ src/first.ts\n@@ -10,1 +10,0 @@\n-removed\n@@ -80,0 +79,1 @@\n+added\n",
  }]))!
  const before = diffContent(snapshot.hunks, "before")
  const after = diffContent(snapshot.hunks, "after")
  expect(before.text).toBe("removed")
  expect([...before.numbers]).toEqual([[0, 10]])
  expect(after.text).toBe("added")
  expect([...after.numbers]).toEqual([[0, 79]])
  expect(after.hideLineNumbers.size).toBe(0)
  const empty = diffContent([snapshot.hunks[0]], "after")
  expect(empty.text).toBe("")
  expect(empty.empty).toBe(true)
  expect([...empty.hideLineNumbers]).toEqual([0])
})

test("change views retain diff as an option and omit missing file sides", () => {
  expect(createVimConfig({}).diffView).toBe("after")
  expect(createVimConfig({ vim: { diffView: "before" } }).diffView).toBe("before")
  expect(createVimConfig({ diffView: "diff" }).diffView).toBe("diff")
  expect(createVimConfig({ diffView: "invalid" }).diffView).toBe("after")
  expect(availableViews(diffSnapshot(item(files, 0))!)).toEqual(["after", "before", "diff"])
  expect(availableViews(diffSnapshot(item(files, 1))!)).toEqual(["after", "diff"])
  expect(availableViews(diffSnapshot(item(files, 2))!)).toEqual(["before", "diff"])
})

test("edit results and older saved file records use the same parser", () => {
  const { patch, additions, deletions } = files[0]
  const message = item([{ relativePath: "renamed.ts", type: "update", patch, additions, deletions }])
  ;(message.source as Extract<TranscriptSource, { type: "tool" }>).name = "edit"
  expect(diffSnapshot(message)?.path).toBe("renamed.ts")
})

test("incomplete or unrecognized changes fall back instead of inventing file contents", () => {
  for (const value of [undefined, [], [{}], [{ ...files[0], patch: "Binary files differ" }], [{ ...files[0], patch: "@@ -1,2 +1,1 @@\n-only one\n+new\n" }]]) {
    expect(diffSnapshot(item(value))).toBeUndefined()
  }
  const message = item([files[0]])
  ;(message.source as Extract<TranscriptSource, { type: "tool" }>).state = { status: "running", input: {}, metadata: { files } }
  expect(diffSnapshot(message)).toBeUndefined()
})
