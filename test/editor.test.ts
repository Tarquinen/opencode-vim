import { afterEach, describe, expect, test } from "bun:test"
import { createFixture } from "./fixture"

let fixture: Awaited<ReturnType<typeof createFixture>> | undefined
afterEach(() => { fixture?.dispose(); fixture = undefined })

describe("real textarea Vim editing", () => {
    test("normal commands, counts, undo and redo", async () => {
        fixture = await createFixture("one two three")
        await fixture.keys("dw")
        expect(fixture.input.plainText).toBe("two three")
        await fixture.keys("u")
        expect(fixture.input.plainText).toBe("one two three")
        fixture.mockInput.pressKey("r", { ctrl: true })
        expect(fixture.input.plainText).toBe("two three")
        await fixture.keys("2x")
        expect(fixture.input.plainText).toBe("o three")
    })

    test("native insert is one undoable change", async () => {
        fixture = await createFixture("hello")
        await fixture.keys("A world")
        fixture.mockInput.pressEscape()
        expect(fixture.input.plainText).toBe("hello world")
        await fixture.keys("u")
        expect(fixture.input.plainText).toBe("hello")
        fixture.mockInput.pressKey("r", { ctrl: true })
        expect(fixture.input.plainText).toBe("hello world")
    })

    test("change and native insertion share an undo point", async () => {
        fixture = await createFixture("one two")
        await fixture.keys("ciwnew")
        fixture.mockInput.pressEscape()
        await fixture.keys("u")
        expect(fixture.input.plainText).toBe("one two")
    })

    test("Escape preserves a pending insert mapping prefix", async () => {
        fixture = await createFixture("", { defaultMode: "insert", keymaps: { insert: { kj: "normal" } } })
        await fixture.keys("k")
        fixture.mockInput.pressEscape()
        expect(fixture.input.plainText).toBe("k")
        expect(fixture.state.mode()).toBe("normal")
    })

    test("Ctrl-[ exits insert mode", async () => {
        fixture = await createFixture("hello", { defaultMode: "insert" })
        fixture.mockInput.pressKey("[", { ctrl: true })
        expect(fixture.state.mode()).toBe("normal")
    })

    test("Escape at a line start stays on that line", async () => {
        fixture = await createFixture("one\ntwo", { defaultMode: "insert" })
        fixture.input.cursorOffset = 4
        fixture.mockInput.pressEscape()
        expect(fixture.input.cursorOffset).toBe(4)
    })

    test("visual delete and paste", async () => {
        fixture = await createFixture("abcdef")
        await fixture.keys("vll")
        expect(fixture.input.getSelectedText()).toBe("abc")
        await fixture.keys("dP")
        expect(fixture.input.plainText).toBe("abcdef")
    })

    test("typing immediately after a yank does not replace the flash selection", async () => {
        fixture = await createFixture("one two")
        await fixture.keys("yiwiX")
        expect(fixture.input.plainText).toBe("Xone two")
    })

    test("a find target A is not treated as append", async () => {
        fixture = await createFixture("fooAbc")
        await fixture.keys("fA")
        expect(fixture.state.mode()).toBe("normal")
        expect(fixture.input.cursorOffset).toBe(3)
    })

    test("emoji deletion does not corrupt text", async () => {
        fixture = await createFixture("👩‍💻abc")
        await fixture.keys("x")
        expect(fixture.input.plainText).toBe("abc")
    })

    test("soft wraps do not create logical lines", async () => {
        fixture = await createFixture("one two three four", {}, 10)
        await fixture.keys("1j")
        expect(fixture.input.cursorOffset).toBe(0)
        await fixture.keys("$")
        expect(fixture.input.cursorOffset).toBe(17)
        await fixture.keys("0")
        expect(fixture.input.cursorOffset).toBe(0)
        await fixture.keys("dd")
        expect(fixture.input.plainText).toBe("")
    })

    test("screen motions use soft wraps without changing the text", async () => {
        fixture = await createFixture("one two three four", {}, 10)
        await fixture.keys("gj")
        expect(fixture.input.cursorOffset).toBe(8)
        await fixture.keys("g$")
        expect(fixture.input.cursorOffset).toBe(17)
        await fixture.keys("g0")
        expect(fixture.input.cursorOffset).toBe(8)
        await fixture.keys("gk")
        expect(fixture.input.cursorOffset).toBe(0)
        expect(fixture.input.plainText).toBe("one two three four")
    })

    test("plain j/k follow wrapped rows and counted j/k follow actual lines", async () => {
        const text = "one two three four\nfive six seven\nlast"
        fixture = await createFixture(text, {}, 10)
        await fixture.keys("j")
        expect(fixture.input.cursorOffset).toBe(8)
        await fixture.keys("j")
        expect(fixture.input.cursorOffset).toBe(19)
        await fixture.keys("k")
        expect(fixture.input.cursorOffset).toBe(8)
        await fixture.keys("k")
        expect(fixture.input.cursorOffset).toBe(0)
        await fixture.keys("1j")
        expect(fixture.input.cursorOffset).toBe(19)
        await fixture.keys("1k")
        expect(fixture.input.cursorOffset).toBe(0)
        await fixture.keys("2j")
        expect(fixture.input.cursorOffset).toBe(34)
        await fixture.keys("2k")
        expect(fixture.input.cursorOffset).toBe(0)
        expect(fixture.input.plainText).toBe(text)
    })

    test("Up/Down use the same count-sensitive wrapping as j/k", async () => {
        fixture = await createFixture("one two three four\nfive six seven", {}, 10)
        fixture.mockInput.pressArrow("down")
        expect(fixture.input.cursorOffset).toBe(8)
        fixture.mockInput.pressArrow("up")
        expect(fixture.input.cursorOffset).toBe(0)
        await fixture.keys("1")
        fixture.mockInput.pressArrow("down")
        expect(fixture.input.cursorOffset).toBe(19)
        await fixture.keys("1")
        fixture.mockInput.pressArrow("up")
        expect(fixture.input.cursorOffset).toBe(0)
    })

    test("visual j/k select through wrapped rows", async () => {
        fixture = await createFixture("one two three four", {}, 10)
        await fixture.keys("vj")
        expect(fixture.input.cursorOffset).toBe(8)
        expect(fixture.input.getSelectedText()).toBe("one two t")
        await fixture.keys("k")
        expect(fixture.input.cursorOffset).toBe(0)
        expect(fixture.input.getSelectedText()).toBe("o")
    })

    test("linewise selection covers every wrapped row", async () => {
        fixture = await createFixture("one two three four\nnext", {}, 10)
        await fixture.keys("gjV")
        expect(fixture.input.getSelectedText()).toBe("one two three four")
        await fixture.keys("d")
        expect(fixture.input.plainText).toBe("next")
    })

    test("yanking across a wrap does not put synthetic newlines in the register", async () => {
        fixture = await createFixture("one two three four", {}, 10)
        await fixture.keys("v$y$p")
        expect(fixture.input.plainText).toBe("one two three fourone two three four")
    })

    test("screen motions work through mappings", async () => {
        fixture = await createFixture("one two three four", { keymaps: { normal: { j: "gj", k: "gk" } } }, 10)
        await fixture.keys("j")
        expect(fixture.input.cursorOffset).toBe(8)
        await fixture.keys("k")
        expect(fixture.input.cursorOffset).toBe(0)
    })

    test("custom mappings can use literal j/k for actual lines", async () => {
        fixture = await createFixture("one two three four\nfive six seven", { keymaps: { normal: { j: "j", k: "k", Q: "j" } } }, 10)
        await fixture.keys("j")
        expect(fixture.input.cursorOffset).toBe(19)
        await fixture.keys("k")
        expect(fixture.input.cursorOffset).toBe(0)
        await fixture.keys("Q")
        expect(fixture.input.cursorOffset).toBe(19)
    })

    test("screen motions see edits earlier in the same mapping", async () => {
        fixture = await createFixture("one two three four", { keymaps: { normal: { Q: "dwgj" } } }, 10)
        await fixture.keys("Q")
        expect(fixture.input.plainText).toBe("two three four")
        expect(fixture.input.cursorOffset).toBe(10)
    })

    test("screen motions follow the host's wrapping of long whitespace", async () => {
        fixture = await createFixture("one two      three", {}, 10)
        await fixture.keys("gjg^")
        expect(fixture.input.cursorOffset).toBe(13)
    })

    test("dot repeats native insertion", async () => {
        fixture = await createFixture("one two")
        await fixture.keys("iX")
        fixture.mockInput.pressEscape()
        await fixture.keys("w.")
        expect(fixture.input.plainText).toBe("Xone Xtwo")
    })

    test("dot repeats a change with native insertion", async () => {
        fixture = await createFixture("one two")
        await fixture.keys("ciwnew")
        fixture.mockInput.pressEscape()
        await fixture.keys("w.")
        expect(fixture.input.plainText).toBe("new new")
    })

    test("a matched kj mapping is undoable and is not inserted", async () => {
        fixture = await createFixture("abc", { keymaps: { insert: { kj: "normal" } } })
        await fixture.keys("Axyz kj")
        expect(fixture.state.mode()).toBe("normal")
        expect(fixture.input.plainText).toBe("abcxyz ")
        await fixture.keys("u")
        expect(fixture.input.plainText).toBe("abc")
    })

    test("mapping timeout inserts the prefix exactly once", async () => {
        fixture = await createFixture("abc", { defaultMode: "insert", keymapTimeout: 5, keymaps: { insert: { kj: "normal" } } })
        await fixture.keys("k")
        await Bun.sleep(20)
        expect(fixture.input.plainText).toBe("kabc")
        await fixture.keys("x")
        expect(fixture.input.plainText).toBe("kxabc")
    })

    test("pending insert survives blur without leaking to another editor", async () => {
        fixture = await createFixture("abc", { defaultMode: "insert", keymapTimeout: 5, keymaps: { insert: { kj: "normal" } } })
        await fixture.keys("k")
        fixture.input.blur()
        await Bun.sleep(20)
        expect(fixture.input.plainText).toBe("kabc")
    })

    test("suspending clears visual selection and pending operators", async () => {
        fixture = await createFixture("abcdef")
        await fixture.keys("vll")
        fixture.adapter.suspend()
        expect(fixture.input.hasSelection()).toBe(false)
        expect(fixture.state.mode()).toBe("normal")
        await fixture.keys("d")
        fixture.adapter.suspend()
        await fixture.keys("w")
        expect(fixture.input.plainText).toBe("abcdef")
    })

    test("resizing changes screen motions but preserves logical lines and undo", async () => {
        fixture = await createFixture("one two three four five six", {}, 20)
        await fixture.keys("Ax")
        fixture.mockInput.pressEscape()
        fixture.input.width = 10
        fixture.resize(10, 12)
        await fixture.renderOnce()
        fixture.input.cursorOffset = 0
        await fixture.keys("1j")
        expect(fixture.input.cursorOffset).toBe(0)
        await fixture.keys("j")
        expect(fixture.input.cursorOffset).toBe(8)
        await fixture.keys("u")
        expect(fixture.input.plainText).toBe("one two three four five six")
        fixture.mockInput.pressKey("r", { ctrl: true })
        expect(fixture.input.plainText).toBe("one two three four five sixx")
    })

    for (const text of ["👩‍💻", "e\u0301", "𠀀", "\ue000"]) {
        test(`grapheme movement, yank, paste, delete and undo: ${text}`, async () => {
            fixture = await createFixture(`${text}ab`)
            await fixture.keys("l")
            expect(fixture.input.cursorOffset).toBe(Bun.stringWidth(text))
            await fixture.keys("hyl$p")
            expect(fixture.input.plainText).toBe(`${text}ab${text}`)
            await fixture.keys("xu")
            expect(fixture.input.plainText).toBe(`${text}ab${text}`)
        })
    }

    test("changing the last paragraph does not add or reorder lines", async () => {
        fixture = await createFixture("one\n\ntwo")
        await fixture.keys("Gcipnew")
        fixture.mockInput.pressEscape()
        expect(fixture.input.plainText).toBe("one\n\nnew")
        await fixture.keys("u")
        expect(fixture.input.plainText).toBe("one\n\ntwo")
    })

    test("inner empty quotes preserve the closing quote", async () => {
        fixture = await createFixture('""')
        await fixture.keys("ciqX")
        fixture.mockInput.pressEscape()
        expect(fixture.input.plainText).toBe('"X"')
    })

    test("yanking a custom text object does not add an undo step", async () => {
        fixture = await createFixture('x"abc"')
        await fixture.keys("xyiqu")
        expect(fixture.input.plainText).toBe('x"abc"')
    })

    test("repeated mapping prefixes still allow kj to exit", async () => {
        fixture = await createFixture("", { defaultMode: "insert", keymaps: { insert: { kj: "normal" } } })
        await fixture.keys("kkj")
        expect(fixture.input.plainText).toBe("k")
        expect(fixture.state.mode()).toBe("normal")
    })

    test("A can start a multi-key mapping", async () => {
        fixture = await createFixture("abc", { keymaps: { normal: { AA: "x" } } })
        await fixture.keys("AA")
        expect(fixture.input.plainText).toBe("bc")
        expect(fixture.state.mode()).toBe("normal")
    })

    test("native bracketed paste is undoable", async () => {
        fixture = await createFixture("abc", { defaultMode: "insert" })
        await fixture.mockInput.pasteBracketedText("👩‍💻\ntext")
        fixture.mockInput.pressEscape()
        expect(fixture.input.plainText).toBe("👩‍💻\ntextabc")
        await fixture.keys("u")
        expect(fixture.input.plainText).toBe("abc")
    })

    test("tabs use the textarea's display columns", async () => {
        fixture = await createFixture("a\tb")
        await fixture.keys("ll")
        expect(fixture.input.cursorOffset).toBe(3)
        await fixture.keys("hx")
        expect(fixture.input.plainText).toBe("ab")
        await fixture.keys("u")
        expect(fixture.input.plainText).toBe("a\tb")
    })

    test("ordinary edits preserve attachment extmarks", async () => {
        fixture = await createFixture("[Image 1] abc")
        const id = fixture.input.extmarks.create({ start: 0, end: 9, virtual: true, data: "attachment" })
        await fixture.keys("$x")
        expect(fixture.input.plainText).toBe("[Image 1] ab")
        expect(fixture.input.extmarks.get(id)?.data).toBe("attachment")
        await fixture.keys("u")
        expect(fixture.input.plainText).toBe("[Image 1] abc")
        expect(fixture.input.extmarks.get(id)?.data).toBe("attachment")
    })
})
