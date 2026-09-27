# Custom Keymaps

Each entry maps a key sequence to an action in one Vim mode. Put `keymaps` inside
`options.vim` in your plugin's `cli.json` entry; see [Configuration](./configuration.md).

```json
{
  "keymaps": {
    "insert": {
      "kj": "normal",
      "<C-s>": "submit"
    },
    "normal": {
      "Y": "y$",
      "H": "0",
      "L": "$",
      "q": "command:session.new"
    }
  }
}
```

## Modes and actions

Mappings apply while editing the prompt or a search dialog, in `insert`, `normal`,
`visual`, or `visual-line` mode. They do not replace session-browsing or reader
bindings; use `sessionKey` to change the session toggle.

| Action | Behavior |
| --- | --- |
| `normal` | Enter normal mode |
| `insert` | Enter insert mode |
| `submit` | Submit the prompt or confirm the search dialog |
| `command:<id>` | Dispatch an active OpenCode command |
| Vim key sequence, such as `y$` | Run those Vim keys |

Insert-mode mappings support only `normal`, `submit`, `command:<id>`, or Escape
(`"<Esc>"` / `"<C-[>"`). Other editing modes support all action types above.

Mapping sequences are literal: mapping `j` to `j` uses an actual line, while
mapping it to `gj` uses a wrapped row.

## Key notation

Use printable ASCII characters; uppercase letters represent shifted keys. Use
`<Space>` instead of a literal space.

Special keys are `<Esc>`, `<CR>`, `<Tab>`, `<BS>`, `<Del>`, `<Space>`, and `<C-a>`
through `<C-z>`. Ctrl letters must be lowercase: `<C-s>`, not `<C-S>`.

Examples: `gg`, `kj`, `Y`, `<C-s>`, or `g<CR>`. In JSON, escape a backslash, as in
`"\\s"` for a backslash followed by `s`.

An unmapped `<CR>` submits in normal mode and passes through to OpenCode in insert
mode. It can be mapped directly or end a sequence, but cannot start a multi-key
mapping.

`keymapTimeout` sets the wait between keys in a custom mapping; the default is
500 ms. Unmatched or timed-out insert prefixes become ordinary text.

## OpenCode commands

Use a command ID, not a slash command: `command:session.new`, not `command:/new`.
Commands run only when available in the current UI context.

| Command ID | Behavior |
| --- | --- |
| `command.palette.show` | Open the command palette |
| `session.new` | Start a new session |
| `session.list` | Open the session list |
| `model.list` | Open model selection |
| `prompt.history.previous` | Load the previous prompt |
| `prompt.history.next` | Load the next prompt |
| `opencode-vim.toggle` | Toggle Vim mode |

See [OpenCode's command reference](https://opencode.ai/v2/docs/cli/keybinds) for
the full list. Installed plugins can register additional commands.

## Troubleshooting

- Check the mode and whether the action is supported in it.
- Use the exact key notation above; literal spaces and names such as `<C-S>` or
  `<Up>` are not supported in custom mapping sequences.
- Command mappings need an active command in the current context.
- Enable `debug` in [Configuration](./configuration.md) to inspect rejected mappings.
