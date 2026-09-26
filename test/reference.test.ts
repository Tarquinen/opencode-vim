import { expect, test } from "bun:test"
import { createFixture } from "./fixture"

// Neovim is an optional external oracle; the real-textarea regression tests
// remain runnable on machines without it. Never load the user's Vim config.
const nvim = Bun.which("nvim")
const cases: Array<[string, string, number?]> = [
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
    ["one two three four", "j", 10],
    ["one two three four", "jk", 10],
    ["one two three four", "1j", 10],
    ["one two three four", "j1k", 10],
    ["one two three four", "<Down><Up>", 10],
    ["one two three four", "vjy$p", 10],
    ["one two three four", "vjkd", 10],
    ["one two three four", "Vjd", 10],
    ["one two three four", "fj", 10],
    ["one two three four", "rk", 10],
    ["one two three four", "$", 10],
    ["one two three four", "$0", 10],
    ["one two three four", "AX<Esc>", 10],
    ["one two three four", "dd", 10],
    ["one two three four", "ccX<Esc>", 10],
    ["one two three four", "oX<Esc>", 10],
    ["one two three four", "OX<Esc>", 10],
    ["one two three four", "yyp", 10],
    ["one two three four", "v$y$p", 10],
    ["one two three four", "gjD", 10],
    ["one two three four", "gjCnew<Esc>u", 10],
    ["one two three four", "gjVd", 10],
    ["one two three four\nfive six seven", "j", 10],
    ["one two three four\nfive six seven", "1j", 10],
    ["one two three four\nfive six seven", "1j1k", 10],
    ["one two three four\nfive six seven", "<Down>", 10],
    ["one two three four\nfive six seven", "1<Down>", 10],
    ["one two three four\nfive six seven", "1j<Up>", 10],
    ["one two three four\nfive six seven", "1j1<Up>", 10],
    ["one two three four\nfive six seven", "v1jd", 10],
    ["one two three four\nfive six seven", "1jdk", 10],
    ["one two three four\nfive six seven", "cjX<Esc>", 10],
    ["one two three four\nfive six seven\nlast", "2j", 10],
    ["one two three four\nfive six seven\nlast", "2j2k", 10],
    ["one two three four\nfive six seven\nlast", "d2j", 10],
    ["one two three four\nfive six seven", "$j", 10],
    ["one two three four\nfive six seven", "gjdd", 10],
    ["one two three four\nfive six seven", "gjyyjp", 10],
    ["one two three four\nfive six seven", "jyy", 10],
    ["one two three four\nfive six seven", "jyj", 10],
    ["one two three four\nfive six seven", "gjJ", 10],
    ["one two three four\nfive six seven", "Vjd", 10],
    ["one two three four\nfive six seven", "2dd", 10],
    ["one two three four\nfive six seven", "dj", 10],
    ["one two three four", "gj", 10],
    ["one two three four", "gjgk", 10],
    ["one two three four", "g$", 10],
    ["one two three four", "2g$", 10],
    ["one two three four", "$g0", 10],
    ["one two three four", "g$gj", 10],
    ["one two three four", "dg$", 10],
    ["one two three four", "dgj", 10],
    ["one two three four", "gjdgk", 10],
    ["one two three four", "cg$X<Esc>u", 10],
    ["one two three four", "ygj$p", 10],
    ["one two three four", "vgjy$p", 10],
    ["one two three four", "dgj.", 10],
    ["one two three four", "dj", 10],
    ["one two three four", "dk", 10],
    ["one two three four", "dgk", 10],
    ["one two three four", "gjcgj", 10],
    ["one two three four", "gjygk$p", 10],
    ["one two three four\nfive six seven", "2gj", 10],
    ["one two three four\nfive six seven", "$gj", 10],
    ["one two three four\nfive six seven", "d2gj", 10],
    ["one two three four\nfive six seven", "2gjdgk", 10],
    ["one two three four\nfive six seven", "gjdgjp", 10],
    ["one two three four\nfive six seven", "y2gjp", 10],
    ["one two three four\nfive six seven", "g$gjgj", 10],
    ["one two three four\nfive six seven", ">gj", 10],
    ["abcdefghi\nx\nabcdefghi", "6ljj", 10],
    ["abcdefghi\nx\nabcdefghi", "6lgjgj", 10],
    ["one two three four\n\nfive six seven", "2gj", 10],
    ["one two three four\n\nfive six seven", "2gjgj", 10],
    ["  one two three four", "g^", 10],
    ["one two three four", "gjg^", 10],
    ["abcdefghijklmnopqrstuv", "fpx", 10],
    ["abcdefghijklmnopqrstuv", "e", 10],
    ["abcdefghij中xy", "gjl", 10],
    ["👩‍💻abcdefghijklm", "gjgk", 10],
    ["e\u0301abcdefghijklm", "gjg$", 10],
]

for (const [text, keys, width = 80] of cases) {
    test.skipIf(!nvim)(`Neovim parity with LazyVim motions (${width} columns): ${JSON.stringify(text)} ${keys}`, async () => {
        // Match Vim's startofline default (Neovim disables it), and the host's
        // word wrapping and two-column tabs. Add only LazyVim's vertical mappings;
        // neither editor loads user settings.
        const mappings = `
            vim.keymap.set({'n', 'x'}, 'j', "v:count == 0 ? 'gj' : 'j'", {expr=true})
            vim.keymap.set({'n', 'x'}, 'k', "v:count == 0 ? 'gk' : 'k'", {expr=true})
            vim.keymap.set({'n', 'x'}, '<Down>', "v:count == 0 ? 'gj' : 'j'", {expr=true})
            vim.keymap.set({'n', 'x'}, '<Up>', "v:count == 0 ? 'gk' : 'k'", {expr=true})
        `
        const lua = `${mappings}\nvim.api.nvim_open_win(0,true,{relative='editor',row=0,col=0,width=${width},height=10,style='minimal'}); vim.o.startofline=true; vim.wo.wrap=true; vim.wo.linebreak=true; vim.bo.tabstop=2; vim.bo.shiftwidth=2; vim.bo.expandtab=true; vim.api.nvim_buf_set_lines(0,0,-1,false,vim.json.decode(${JSON.stringify(JSON.stringify(text.split("\n")))})); vim.api.nvim_feedkeys(vim.api.nvim_replace_termcodes(${JSON.stringify(keys)},true,false,true),'xt',false); io.write(vim.json.encode({text=table.concat(vim.api.nvim_buf_get_lines(0,0,-1,false),'\\n'),col=vim.api.nvim_win_get_cursor(0)[2],row=vim.api.nvim_win_get_cursor(0)[1]}))`
        const result = Bun.spawnSync([nvim!, "--headless", "-u", "NONE", "-i", "NONE", "-n", "-c", `lua ${lua}`, "-c", "qa!"])
        expect(result.exitCode).toBe(0)
        const reference = JSON.parse(result.stdout.toString()) as { text: string; col: number; row: number }
        const fixture = await createFixture(text, {}, width)
        try {
            for (const key of keys.match(/<[^>]+>|./gu) ?? []) {
                if (key === "<Esc>") fixture.mockInput.pressEscape()
                else if (key === "<C-r>") fixture.mockInput.pressKey("r", { ctrl: true })
                else if (key === "<Down>") fixture.mockInput.pressArrow("down")
                else if (key === "<Up>") fixture.mockInput.pressArrow("up")
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
