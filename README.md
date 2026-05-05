# opencode-vim

Adds Vim-style insert and normal mode editing to the OpenCode prompt.

![Demo](./assets/demo2.gif)

## Installation

Install from the CLI:

```bash
opencode plugin opencode-vim@latest --global
```

## Supported Keys

| Key | Behavior |
| --- | --- |
| `<Esc>`, `<C-[>` | Enter normal mode |
| `i`, `a`, `A`, `o`, `O` | Return to insert mode |
| `h`, `j`, `k`, `l`, `w`, `b`, `e`, `$`, `0` | Move through the prompt |
| `x`, `d`, `c`, `y`, `p`, `u`, `<C-r>` | Edit, yank, paste, undo, redo |
| `v`, `V` | Visual and visual-line selection |
| Counts and text objects | Examples: `3w`, `diw`, `ci"` |
| Registers, marks, macros | Vim-style prompt-local state |
| `<CR>` in normal mode | Submit the prompt |
| `/vim` | Toggle Vim mode on or off |

See [docs/configuration.md](./docs/configuration.md) for configuration options and keymap examples.
