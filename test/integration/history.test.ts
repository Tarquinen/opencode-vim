import { afterEach, describe, expect, spyOn, test } from "bun:test"
import { InputRenderable } from "@opentui/core"
import { createFixture } from "../helpers/fixture"

let fixture: Awaited<ReturnType<typeof createFixture>> | undefined
afterEach(() => {
  fixture?.dispose()
  fixture = undefined
})

describe("native Vim history", () => {
  test("undo and redo restore through the native editor", async () => {
    fixture = await createFixture("one two")
    const undo = spyOn(fixture.input, "undo")
    const redo = spyOn(fixture.input, "redo")
    await fixture.keys("ciwnew")
    fixture.mockInput.pressEscape()
    await fixture.keys("u")
    expect(fixture.input.plainText).toBe("one two")
    expect(undo).toHaveBeenCalled()
    fixture.mockInput.pressKey("r", { ctrl: true })
    expect(fixture.input.plainText).toBe("new two")
    expect(redo).toHaveBeenCalled()
    undo.mockRestore()
    redo.mockRestore()
  })

  test("a repeated intermediate text does not split an insertion's history", async () => {
    fixture = await createFixture("abc")
    await fixture.keys("AX")
    fixture.mockInput.pressBackspace()
    await fixture.keys("Y")
    fixture.mockInput.pressEscape()
    await fixture.keys("u")
    expect(fixture.input.plainText).toBe("abc")
    expect(fixture.input.editBuffer.canUndo()).toBe(false)
    fixture.mockInput.pressKey("r", { ctrl: true })
    expect(fixture.input.plainText).toBe("abcY")
    expect(fixture.input.editBuffer.canRedo()).toBe(false)
  })

  test("an insertion with no net text change still has a complete undo group", async () => {
    fixture = await createFixture("abc")
    await fixture.keys("AX")
    fixture.mockInput.pressBackspace()
    fixture.mockInput.pressEscape()
    await fixture.keys("u")
    expect(fixture.input.plainText).toBe("abc")
    expect(fixture.input.editBuffer.canUndo()).toBe(false)
  })

  test("counts undo and redo whole Vim changes", async () => {
    fixture = await createFixture("abcdef")
    await fixture.keys("xx2u")
    expect(fixture.input.plainText).toBe("abcdef")
    await fixture.keys("2")
    fixture.mockInput.pressKey("r", { ctrl: true })
    expect(fixture.input.plainText).toBe("cdef")
  })

  test("native undo and Vim undo share the same history", async () => {
    fixture = await createFixture("abc")
    await fixture.keys("AXY")
    fixture.mockInput.pressKey("-", { ctrl: true })
    fixture.mockInput.pressEscape()
    await fixture.keys("u")
    expect(fixture.input.plainText).toBe("abc")
    fixture.mockInput.pressKey("r", { ctrl: true })
    expect(fixture.input.plainText).toBe("abcXY")
  })

  test("a new change replaces the native redo branch", async () => {
    fixture = await createFixture("abc")
    await fixture.keys("xuAX")
    fixture.mockInput.pressEscape()
    fixture.mockInput.pressKey("r", { ctrl: true })
    expect(fixture.input.plainText).toBe("abcX")
    await fixture.keys("u")
    expect(fixture.input.plainText).toBe("abc")
  })

  test("redo does not replace the dot-repeat command", async () => {
    fixture = await createFixture("abcdef")
    await fixture.keys("xu")
    fixture.mockInput.pressKey("r", { ctrl: true })
    await fixture.keys(".")
    fixture.mockInput.pressEnter()
    expect(fixture.input.plainText).toBe("cdef")
    expect(fixture.submissions).toBe(1)
  })

  test("host replacement starts a new history and repeat boundary", async () => {
    fixture = await createFixture("old")
    await fixture.keys("AX")
    fixture.mockInput.pressEscape()
    fixture.input.setText("new draft")
    await fixture.keys("u.")
    expect(fixture.input.plainText).toBe("new draft")
    await fixture.keys("AZ")
    fixture.mockInput.pressEscape()
    await fixture.keys("u")
    expect(fixture.input.plainText).toBe("new draft")
  })

  test("same-text native replacement still creates a history entry", async () => {
    fixture = await createFixture("abc")
    fixture.input.editBuffer.replaceText("abc")
    await fixture.keys("xu")
    expect(fixture.input.plainText).toBe("abc")
    expect(fixture.input.editBuffer.canUndo()).toBe(true)
    await fixture.keys("u")
    expect(fixture.input.plainText).toBe("abc")
    expect(fixture.input.editBuffer.canUndo()).toBe(false)
    fixture.mockInput.pressKey("r", { ctrl: true })
    expect(fixture.input.plainText).toBe("abc")
    expect(fixture.input.editBuffer.canRedo()).toBe(true)
    fixture.mockInput.pressKey("r", { ctrl: true })
    expect(fixture.input.plainText).toBe("bc")
    expect(fixture.input.editBuffer.canRedo()).toBe(false)
  })

  test("clearing native history resets grouping and repeat without changing text", async () => {
    fixture = await createFixture("abc")
    await fixture.keys("AX")
    fixture.mockInput.pressEscape()
    fixture.input.editBuffer.clearHistory()
    await fixture.keys("u.")
    fixture.mockInput.pressKey("r", { ctrl: true })
    expect(fixture.input.plainText).toBe("abcX")
    expect(fixture.input.editBuffer.canUndo()).toBe(false)
    expect(fixture.input.editBuffer.canRedo()).toBe(false)
  })

  test("single-line inputs retain history and emit native input changes", async () => {
    fixture = await createFixture("one two", {}, 80, {}, InputRenderable)
    fixture.input.cursorOffset = 0
    const values: string[] = []
    fixture.input.on("input", (text: string) => values.push(text))
    await fixture.keys("ciwnew")
    fixture.mockInput.pressEscape()
    await fixture.keys("u")
    expect(fixture.input.plainText).toBe("one two")
    expect(values.at(-1)).toBe("one two")
    fixture.mockInput.pressKey("r", { ctrl: true })
    expect(fixture.input.plainText).toBe("new two")
    expect(values.at(-1)).toBe("new two")
  })

  test("cleanup restores native methods without clearing native history", async () => {
    fixture = await createFixture("abc")
    const wrapped = fixture.input.editBuffer.insertText
    await fixture.keys("AX")
    fixture.mockInput.pressEscape()
    fixture.adapter.cleanup()
    expect(fixture.input.editBuffer.insertText).not.toBe(wrapped)
    fixture.input.undo()
    expect(fixture.input.plainText).toBe("abc")
  })

  test("history from before attachment stays separate from new Vim changes", async () => {
    fixture = await createFixture("abc")
    await fixture.keys("AX")
    fixture.mockInput.pressEscape()
    fixture.adapter.cleanup()
    await fixture.keys("xuu")
    expect(fixture.input.plainText).toBe("abc")
    fixture.mockInput.pressKey("r", { ctrl: true })
    expect(fixture.input.plainText).toBe("abcX")
    fixture.mockInput.pressKey("r", { ctrl: true })
    expect(fixture.input.plainText).toBe("abc")
  })
})
