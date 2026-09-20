# opencode-vim

Vim-style editing for the OpenCode 2 prompt and dialog search fields.

![Demo](./assets/demo2.gif)

## Installation

Requires OpenCode 2. Install the published plugin:

```sh
opencode plugin add opencode-vim@latest
```

This installs the package and adds it to `~/.config/opencode/cli.json`
(or `$XDG_CONFIG_HOME/opencode/cli.json`). Restart the TUI after installation.

To update:

```sh
opencode plugin update opencode-vim@latest
```

See OpenCode's [plugin installation](https://opencode.ai/v2/docs/plugins#manage)
and [CLI plugin configuration](https://opencode.ai/v2/docs/cli/plugins) docs.

## Supported Keys

Starts in insert mode. Press `Esc` to enter normal mode and `i` to type again.
The current mode appears in the prompt footer. Pending key sequences stay hidden
so they do not shift the layout.

| Key | Behavior |
| --- | --- |
| `Esc`, `Ctrl+[` | Enter normal mode |
| `i`, `a`, `A`, `o`, `O` | Enter insert mode |
| `h`, `j`, `k`, `l`, `w`, `b`, `e`, `$`, `0` | Move through the prompt |
| `x`, `d`, `c`, `y`, `p` | Delete, change, yank, and paste |
| `u`, `Ctrl+r`, `.` | Undo, redo, and repeat the last change |
| `v`, `V` | Visual and visual-line selection |
| `3w`, `diw`, `ci"`, `yiq`, `dip`, `yib` | Counts and text objects |
| `k`, `j` on an empty or recalled prompt | Browse previous and next prompts |
| `Enter` in normal mode | Submit the prompt |
| `/vim` | Toggle Vim mode on or off |

## Dialogs

Searchable dialogs such as `/models`, the `Ctrl+P` command palette, and Settings
start in your configured `defaultMode`.

- In insert mode, type to filter. `Esc` enters normal mode.
- In normal mode, `j`/`k` select items; `h`/`l`, `x`, `dw`, `u`, and other editing
  commands act on the search text. `i` returns to insert mode.
- `Enter` selects the highlighted item. `Esc` in idle normal mode closes or goes
  back. Arrows, Tab, Home/End, and Page Up/Down keep their dialog behavior.

Dialog editing preserves the main prompt's mode and undo history. Custom normal-mode
mappings take precedence over the dialog `j`/`k` defaults.

## Configuration

Replace the plugin's string entry in `cli.json` with an object to customize it.
This example adds `kj` to leave insert mode, `Y` to yank to the end of the line,
and `q` to start a new session:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "opencode-vim@latest",
      "options": {
        "vim": {
          "defaultMode": "insert",
          "keymapTimeout": 500,
          "keymaps": {
            "insert": { "kj": "normal" },
            "normal": {
              "Y": "y$",
              "q": "command:session.new"
            }
          }
        }
      }
    }
  ]
}
```

`defaultMode` defaults to `insert`; use `normal` to start in normal mode.
`keymapTimeout` is the wait for a multi-key mapping, in milliseconds (default: 500).

Keymaps can use `normal`, `insert`, `submit`, a Vim sequence such as `y$`, or
`command:<id>` for an active [OpenCode command](https://opencode.ai/v2/docs/cli/keybinds).
Mappings are grouped by `insert`, `normal`, `visual`, or `visual-line` mode.
Use notation such as `<Esc>`, `<CR>`, and `<C-s>` for special keys.

Cursor styles can be set under `options.vim.cursorStyles`, for example
`"normal": { "style": "block", "blinking": false }`. Available styles are
`block`, `line`, `underline`, and `default`.
