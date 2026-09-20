import { expect, test } from "bun:test"
import { createFixture } from "./fixture"

// Neovim is an optional external oracle; the real-textarea regression tests
// remain runnable on machines without it. Never load the user's Vim config.
const nvim = Bun.which("nvim")
const cases = [
    ["one two three", "dw"],
    ["one two three", "2dw"],
    ["abcdef", "dl"],
    ["abcdef", "2dl"],
    ["abcdef", "yl$p"],
    ["abcdef", "lD"],
    ["one two", "cwX<Esc>"],
    ["one two", "ciwX<Esc>w."],
    ["hello", "AX<Esc>u"],
    ["one\ntwo", "jccX<Esc>"],
    ["one", "ccX<Esc>"],
    ["one\ntwo", "ddp"],
    ["abc def", "xylu"],
    ["abc def", "xywu"],
    ["fooAbc", "fA"],
    ["fooAbc", "rA"],
    ["abcdef", "vllx"],
    ["one\ntwo\nthree", "Vjd"],
    ["中中 word", "ew"],
    ["👩‍💻abc", "xl"],
    ["e\u0301abc", "yl$p"],
    ["abc", "iX<Esc>w.u"],
    ["abc", "iX<Esc>u<C-r>"],
    ["one", "dw"],
    ["one two", "2w"],
    ["one\ntwo", "dw"],
    ["one two three", "cwX<Esc>w."],
    ["one two three", "dlw.u"],
    ["one\n\ntwo", "cipX<Esc>Gu"],
    ["one two three four", "cwX<Esc>w2."],
    ["one two three four", "2dw."],
    ["one\n  two", "dw"],
]

for (const [text, keys] of cases) {
    test.skipIf(!nvim)(`Neovim parity: ${JSON.stringify(text)} ${keys}`, async () => {
        const lua = `vim.api.nvim_buf_set_lines(0,0,-1,false,vim.json.decode(${JSON.stringify(JSON.stringify(text.split("\n")))})); vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(${JSON.stringify(keys)},true,false,true),'xt',false); io.write(vim.json.encode({text=table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),'\\n'),col=vim.api.nvim_win_get_cursor(0)[2],row=vim.api.nvim_win_get_cursor(0)[1]}))`
        const result = Bun.spawnSync([nvim!, "--headless", "-u", "NONE", "-i", "NONE", "-n", "-c", `lua ${lua}`, "-c", "qa!"])
        expect(result.exitCode).toBe(0)
        const reference = JSON.parse(result.stdout.toString()) as { text: string; col: number; row: number }
        const fixture = await createFixture(text)
        try {
            for (const key of keys.match(/<[^>]+>|./gu) ?? []) {
                if (key === "<Esc>") fixture.mockInput.pressEscape()
                else if (key === "<C-r>") fixture.mockInput.pressKey("r", { ctrl: true })
                else await fixture.keys(key)
            }
            expect(fixture.input.plainText).toBe(reference.text)
            const lines = reference.text.split("\n")
            let offset = 0
            for (let line = 0; line < reference.row - 1; line++) offset += Bun.stringWidth(lines[line]) + 1
            // Neovim reports a UTF-8 byte column; OpenTUI uses display columns.
            offset += Bun.stringWidth(Buffer.from(lines[reference.row - 1]).subarray(0, reference.col).toString())
            expect(fixture.input.cursorOffset).toBe(offset)
        } finally {
            fixture.dispose()
        }
    })
}
