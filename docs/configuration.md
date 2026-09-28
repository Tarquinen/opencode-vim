# Configuration

Replace the plugin entry in `cli.json` with an object containing `options.vim`.
This example uses `Q` for session mode and `kj` to leave insert mode:

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

## Options

All options below belong inside `options.vim`.

| Option | Default | Purpose |
| --- | --- | --- |
| `defaultMode` | `"insert"` | Starting Vim mode; use `"normal"` to start in normal mode |
| `sessionKey` | `"s"` | Single key to enter and leave session mode |
| `keymapTimeout` | `500` | Milliseconds to wait for the rest of a custom mapping |
| `keymaps` | `{}` | Custom mappings, grouped by mode |
| `cursorStyles` | See below | Cursor appearance for each editing mode |
| `debug` | `false` | Enable debug logging |
| `debugPath` | `~/.cache/opencode/opencode-vim.log` | Debug log file |

### Session key

Use one character, such as `"Q"`, or key notation such as `"<C-s>"`. The key changes
both entry and exit, including the footer hints. Invalid or multi-key values fall
back to `"s"`.

A custom normal-mode mapping beginning with the same key takes precedence over
entering session mode.

### Custom keymaps

Mappings apply to `insert`, `normal`, `visual`, and `visual-line` editing modes in
the prompt and search dialogs. Use `keymaps.session` for transcript browsing and
its message/tool modals.

See [Custom Keymaps](./keymap-actions.md) for actions, key notation, and examples.
See [Keybindings and Modes](./vim-behavior.md) for the default behavior.

### Cursor styles

Insert mode defaults to a blinking line cursor. Normal, visual, and visual-line
modes default to a blinking block. Supported styles are `block`, `line`,
`underline`, and `default`. Omitted values keep their defaults.

For example, add this inside `options.vim` to disable cursor blinking:

```json
{
  "cursorStyles": {
    "insert": { "style": "line", "blinking": false },
    "normal": { "style": "block", "blinking": false }
  }
}
```

### Debugging

Set `"debug": true` or launch OpenCode with `VIM_PROMPT_DEBUG=1`. Invalid mappings
are skipped and recorded in the log. A custom `debugPath` should be absolute;
`~` is not expanded in configured paths.

`keymapTimeout` controls partially typed custom mappings. If an insert-mode
mapping times out, its pending characters are inserted as ordinary text. Pending
keys are not shown in the footer.
