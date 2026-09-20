# opencode-vim

Vim-style editing for the OpenCode 2 prompt and dialog search fields.

This branch supports normal, insert, visual, and visual-line editing, custom
keymaps, prompt history, command dispatch, cursor styles, and `/vim` toggling.
The mode indicator appears before the working directory in the prompt footer.
Pending key sequences stay hidden so they do not shift the footer layout.

Configure the local plugin in OpenCode 2's `cli.json`:

```json
{
  "plugins": [
    "opencode-vim@file:/home/dan/src/opencode-config/plugin/opencode-vim"
  ]
}
```

Options use the V2 object form:

```json
{
  "package": "opencode-vim@file:/home/dan/src/opencode-config/plugin/opencode-vim",
  "options": {
    "vim": {
      "defaultMode": "insert",
      "keymapTimeout": 500,
      "keymaps": {
        "insert": { "kj": "normal" },
        "normal": { "Y": "y$" }
      }
    }
  }
}
```

OpenCode 2 does not yet expose its prompt ref or low-level key interceptor to
plugins. This adapter uses the public renderer in the V2 plugin context to
bridge those capabilities to the existing Vim engine.

## Dialogs

Searchable dialogs such as `/models`, the `Ctrl+P` command palette, and Settings
support Vim editing in their search fields. Each new dialog starts in your
configured `defaultMode`.

- In insert mode, type to filter. `Esc` (or your `kj` mapping) enters normal mode.
- In normal mode, `j`/`k` move the selected list item. `h`/`l`, `x`, `dw`, `u`,
  and other editing commands act on the search text. `i` returns to insert mode.
- `Enter` selects the highlighted item; `Esc` in idle normal mode closes or goes
  back. Arrows, Tab, Home/End, and Page Up/Down keep their dialog behavior.
- Dialog editing has separate mode and undo state from the main prompt.

Normal-mode custom mappings take precedence over the dialog `j`/`k` defaults.

## Development and testing

```sh
npm install
npm test
npm run typecheck
npm run bench
```

Tests use Bun and OpenTUI's native headless renderer: real textarea input,
cursor movement, selection, wrapping, attachment extmarks, and the mounted
plugin footer. They do not contact an OpenCode server or a model. When `nvim`
is installed, additional tests compare text and cursor results against headless
Neovim with user configuration disabled.

With an OpenCode source checkout and its dependencies installed, you can also
test against its real dialog component and keyboard routing:

```sh
OPENCODE_SOURCE=/path/to/opencode npm test -- test/opencode-dialog.test.tsx
```

The benchmark measures wrap mapping and normal-mode navigation on prompts of
1,000, 5,000, and 10,000 characters. Wrapping follows the textarea's visual
lines; those cases are tested separately from Neovim's logical-line behavior.
