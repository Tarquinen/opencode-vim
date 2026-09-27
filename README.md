# opencode-vim

Vim-style prompt editing and session navigation for OpenCode 2.

![Demo](./assets/demo2.gif)

## Installation

Requires OpenCode 2.

```sh
opencode plugin add opencode-vim@latest
```

To update:

```sh
opencode plugin update opencode-vim@latest
```

## Prompt editing

Starts in insert mode. Press `Esc` to enter normal mode and `i` to type again.
Use `/vim` to toggle the plugin on or off.

| Key | Behavior |
| --- | --- |
| `Esc`, `Ctrl+[` | Enter normal mode |
| `i`, `a`, `A`, `o`, `O` | Enter insert mode |
| `h`, `l`, `w`, `b`, `e`, `$`, `0` | Move through the prompt |
| `j`, `k`, Up, Down | Move through wrapped rows; counts use actual lines |
| `gj`, `gk`, `g0`, `g^`, `g$` | Move through wrapped screen rows |
| `x`, `d`, `c`, `y`, `p` | Delete, change, yank, and paste |
| `u`, `Ctrl+r`, `.` | Undo, redo, and repeat the last change |
| `v`, `V` | Visual and visual-line selection |
| `3w`, `diw`, `ci"`, `yiq`, `dip`, `yib` | Counts and text objects |
| `k`, `j` on an empty or recalled prompt | Browse previous and next prompts |
| `Enter` in normal mode | Submit the prompt |
| `s` in normal mode | Enter session mode |

## Session mode

Press `s` in normal mode to browse the session, starting at the latest item.
A colored bar marks the selected text block, reasoning block, tool call, or group.

| Key | Behavior |
| --- | --- |
| `j`, `k` | Next / previous item; counts work too |
| `gg`, `G` | First / last item |
| `Enter` | Expand/collapse a group, or open an item in a read-only modal |
| `yy` | Copy the selected item |
| `Ctrl+d`, `Ctrl+u` | Scroll down / up |
| `Esc` | Go back |
| `s` | Return to the prompt |

Inside the modal, use `v` or `V` to select text and `y` to copy it.
Yanks go to both the clipboard and Vim's register, so `p` pastes into the prompt.
Your prompt text and undo history are preserved.

## Dialogs

Vim editing also works in search dialogs such as `/models` and `Ctrl+P`.
Type to filter in insert mode; use `j`/`k` to choose items in normal mode.
`Enter` confirms, and `Esc` in normal mode goes back.

## Configuration

Replace the plugin entry in `cli.json` to customize it. This example uses `Q`
for session mode and `kj` to leave insert mode:

```json
{
  "plugins": [
    {
      "package": "opencode-vim@latest",
      "options": {
        "vim": {
          "sessionKey": "Q",
          "keymaps": {
            "insert": { "kj": "normal" }
          }
        }
      }
    }
  ]
}
```

- `sessionKey`: one key, such as `"Q"` or `"<C-s>"`. Defaults to `"s"`.
- `defaultMode`: `"insert"` (default) or `"normal"`.
- `keymaps`: mappings grouped by `insert`, `normal`, `visual`, or `visual-line`.
  Actions can be Vim keys (`y$`), `normal`, `insert`, `submit`, or
  `command:<id>` for an [OpenCode command](https://opencode.ai/v2/docs/cli/keybinds).
