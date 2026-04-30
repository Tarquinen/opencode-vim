# Vim Behavior Reference

This document defines the Vim behavior that `vim-prompt` currently supports and the behavior we should preserve as we expand the implementation.

## Sources

Use Vim's own help as the primary source of truth:

- Vim `:help motion.txt`: https://vimhelp.org/motion.txt.html
- Vim `:help quickref`: https://vimhelp.org/quickref.txt.html
- Vim `:help intro`: https://vimhelp.org/intro.txt.html
- Neovim user docs mirror for motion behavior: https://neovim.io/doc/user/motion/

The key rule from Vim `motion.txt` for our current cursor work is that left/right motions stop at the first column and at the end of the line unless `'whichwrap'` changes that behavior. `vim-prompt` should follow the default no-wrap behavior.

## Scope

`vim-prompt` is not a full Vim implementation. It is a prompt-focused Vim subset that currently supports:

- Insert mode and normal mode.
- Vim key handling through `@vimee/core`.
- Operator-pending delete/change flows, motions, text objects, counts, registers, marks, macros, undo/redo, and other behavior provided by `@vimee/core`.
- Prompt-local cursor movement and editing through a host-to-vimee mapping layer.
- A prompt-right mode indicator and pending key display.
- Configurable cursor style per mode.

The OpenCode prompt integration still owns host behavior that is outside Vim's text model, such as submitting the prompt with normal-mode `<CR>`, rendering the prompt chrome, snippets composition, and applying terminal cursor style.

## Configuration Defaults

Default config values:

```ts
defaultMode: "insert"
keymapTimeout: 500
pendingDisplayDelay: 120
cursorStyles: {
  insert: { style: "line", blinking: true },
  normal: { style: "block", blinking: true }
}
```

Vim behavior comes from `@vimee/core`; `vim-prompt` does not maintain a separate keymap engine. Users can still configure prompt integration options:

```jsonc
[
  "./plugin/vim-prompt",
  {
    "vim": {
      "keymapTimeout": 500,
      "pendingDisplayDelay": 120,
      "cursorStyles": {
        "insert": { "style": "line", "blinking": true },
        "normal": { "style": "block", "blinking": true }
      },
      "keymaps": {
        "insert": {
          "kj": "normal"
        },
        "normal": {
          "Y": "y$",
          "<CR>": "submit"
        }
      }
    }
  }
]
```

## Modes

### Insert Mode

Insert mode is the default mode. Printable keys are handled by `@vimee/core` and applied back to OpenCode's native prompt input.

Supported defaults:

- `<Esc>` enters normal mode.
- `<C-[>` enters normal mode.

### Normal Mode

Normal mode intercepts keys and prevents normal text insertion. Unhandled normal-mode keys should be consumed so they do not type into the prompt.

Entering normal mode is handled by `@vimee/core`, including its normal-mode cursor placement.

## Pending Key Display

The status area can show a pending key sequence, for example `d NORMAL` after pressing the first `d` in `dd`.

`keymapTimeout` controls how long vimee custom keymaps may remain partially matched before `vim-prompt` cancels the pending key sequence.

`pendingDisplayDelay` controls only the UI: how long to wait before showing a pending sequence in the prompt status. It prevents quick mappings such as `kj` from flashing in the status area.

Rules:

- Key resolution uses the real pending state immediately.
- Display of pending state is delayed by `pendingDisplayDelay` to avoid flicker for fast mappings such as `kj`.
- If the sequence resolves before the display delay, it should never flash in the status area.
- If the sequence remains pending past the delay, it should be shown until it resolves or times out.

## Vimee Adapter

`vim-prompt` delegates Vim command interpretation to `@vimee/core`:

- Each OpenTUI key event is converted to a vimee keystroke.
- The current prompt text and cursor offset are mirrored into a vimee `TextBuffer` and `VimContext`.
- Vimee actions are applied back to the host prompt.
- `content-change` updates `TuiPromptRef` input.
- `cursor-move` updates the focused OpenTUI edit-buffer cursor offset.
- `mode-change` updates the prompt mode indicator and cursor style.
- `quit` blurs the prompt.
- `submit` is a host action that submits the OpenCode prompt.

Configured keymaps use vimee remaps whenever possible:

- `normal` remaps to `<Esc>`.
- `insert` remaps to `i`.
- Any other non-host action string is passed directly to vimee as a remap sequence.

### `submit`

Expected prompt behavior:

- `<CR>` in normal mode submits the prompt.

Current behavior:

- Calls `TuiPromptRef.submit()`.

## Cursor Style

Cursor style is configurable per mode.

Supported OpenTUI styles:

- `block`
- `line`
- `underline`
- `default`

Default behavior:

- Insert mode uses `line`, matching the common vertical-bar insert cursor.
- Normal mode uses `block`, matching Vim's normal-mode cursor shape.

Implementation note:

- OpenCode's public `TuiPromptRef` does not expose cursor style.
- `vim-prompt` applies cursor style through the same guarded focused-renderable path used for cursor movement.

## Internal Cursor Access

OpenCode's public `TuiPromptRef` currently exposes input text, focus, reset, set, and submit methods, but no cursor position or cursor movement API.

For cursor movement, `vim-prompt` uses a guarded OpenTUI internal path plus a prompt mapping layer:

- Reads `api.renderer.currentFocusedRenderable`.
- Feature-detects edit-buffer methods before using them.
- Reads prompt text from `plainText` and cursor position from `cursorOffset` when available.
- Builds virtual vimee text in `src/modules/vim/map.ts`, inserting synthetic line breaks at detected TUI soft-wrap boundaries.
- Translates vimee cursor positions and content changes back to host text without writing synthetic line breaks into the submitted prompt.
- Writes `cursorOffset` for translated vimee cursor movements.
- Sets `cursorStyle` for mode-specific cursor shapes.

Direct renderable access is intentionally isolated in `src/modules/vim/actions.ts`; coordinate translation is isolated in `src/modules/vim/map.ts`. If OpenCode exposes first-class prompt cursor APIs later, replace these helpers rather than spreading direct renderable access across modules.

## Known Gaps

- Interactive OpenCode TUI testing is still required for the vimee adapter.
- Cursor synchronization still depends on guarded OpenTUI internals because `TuiPromptRef` has no public cursor API.
- Normal-mode `<CR>` is host-specific and is handled outside `@vimee/core` to submit the prompt.
