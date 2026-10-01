# Custom Keymaps

Each entry maps keys to an action in one scope. Put `keymaps` inside
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
    },
    "session": {
      "<Tab>": "passthrough",
      "<C-w>w": "switch-panel"
    },
    "panes": {
      "<C-/>": "command:opencode-vim.terminal.toggle",
      "<M-h>": "command:pane.focus.left",
      "<M-l>": "command:pane.focus.right"
    }
  }
}
```

## Modes and actions

Mappings apply while editing the prompt or a search dialog, in `insert`, `normal`,
`visual`, or `visual-line` mode. `session` mappings apply to transcript browsing
and its message/tool modals; use `sessionKey` to change the session toggle.
Insert-mode mappings also apply to question answers; `submit` uses the question's
native confirm/submit action.

`panes` mappings share command actions between the prompt, transcript browsing,
and live terminal input. They support one chord at a time, not editing sequences.
See [Pane controls](./configuration.md#pane-controls) for remapping or disabling
the terminal defaults.

The `panes` example shows the defaults. To remap one, set its original key to
`passthrough` and assign the command to your preferred key.

| Action | Behavior |
| --- | --- |
| `normal` | Enter normal mode |
| `insert` | Enter insert mode |
| `submit` | Submit the prompt or confirm the search dialog |
| `command:<id>` | Dispatch an active OpenCode command |
| Vim key sequence, such as `y$` | Run those Vim keys |
| `switch-panel` | Session only: switch between available panels |
| `passthrough` | Session/panes only: stop intercepting a single key |

Insert-mode mappings support only `normal`, `submit`, `command:<id>`, or Escape
(`"<Esc>"` / `"<C-[>"`). Other editing modes support all editing actions above.

Mapping sequences are literal: mapping `j` to `j` uses an actual line, while
mapping it to `gj` uses a wrapped row.

Session mappings override defaults: `<Tab>` switches panels where available.
The example above releases Tab to OpenCode and uses Ctrl+W then w to switch panels.
Native commands still depend on the current UI context.

## Key notation

Use printable ASCII characters; uppercase letters represent shifted keys. Use
`<Space>` instead of a literal space.

Special keys are `<Esc>`, `<CR>`, `<Tab>`, `<BS>`, `<Del>`, `<Space>`, and `<C-a>`
through `<C-z>`. Ctrl letters must be lowercase: `<C-s>`, not `<C-S>`.

The `panes` scope additionally supports Alt notation such as `<M-h>`, Ctrl
punctuation such as `<C-/>`, and named arrow keys such as `<Left>`. These extra
chords are not supported by the editor's sequence parser.

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
| `opencode-vim.terminal.toggle` | Show/focus the terminal, or hide it from live input without terminating it |
| `pane.focus.left` | Focus OpenCode without hiding the right pane |
| `pane.focus.right` | Focus the visible right pane without creating one |

See [OpenCode's command reference](https://opencode.ai/v2/docs/cli/keybinds) for
the full list. Installed plugins can register additional commands.

## Troubleshooting

- Check the mode and whether the action is supported in it.
- Use the exact key notation above; literal spaces and names such as `<C-S>` or
  `<Up>` are not supported in editor mapping sequences. Pane mappings accept
  single named arrow keys, but reject multi-key sequences.
- Command mappings need an active command in the current context.
- Enable `debug` in [Configuration](./configuration.md) to inspect rejected mappings.
