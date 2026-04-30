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
- Configurable keymaps using Vim-like key notation.
- Multi-key sequence resolution with timeout behavior.
- Prompt-local cursor movement and editing through guarded OpenTUI internals.
- A prompt-right mode indicator.

Counts, registers, operators with arbitrary motions, visual mode, replace mode, text objects, marks, undo integration, and macros are not implemented yet.

## Configuration Defaults

Default config values:

```ts
defaultMode: "insert"
timeoutlen: 300
pendingDisplayDelay: 120
```

Default insert-mode mappings:

```ts
{
  "<Esc>": "normal",
  "<C-[>": "normal"
}
```

Default normal-mode mappings:

```ts
{
  "i": "insert",
  "a": "append",
  "A": "appendEnd",
  "h": "left",
  "j": "down",
  "k": "up",
  "l": "right",
  "0": "lineStart",
  "$": "lineEnd",
  "w": "wordNext",
  "b": "wordPrev",
  "x": "deleteChar",
  "dd": "clear",
  "D": "clear",
  "C": "clearInsert",
  "cc": "clearInsert",
  "<CR>": "submit"
}
```

Users can override or add mappings through plugin options:

```jsonc
[
  "./plugin/vim-prompt",
  {
    "vim": {
      "timeoutlen": 300,
      "pendingDisplayDelay": 120,
      "keymaps": {
        "insert": {
          "kj": "normal"
        },
        "normal": {
          "<CR>": "submit"
        }
      }
    }
  }
]
```

## Modes

### Insert Mode

Insert mode is the default mode. Printable keys should pass through to OpenCode's native prompt input unless they are part of a configured insert-mode mapping.

Supported defaults:

- `<Esc>` enters normal mode.
- `<C-[>` enters normal mode.

Custom multi-key insert mappings, such as `kj -> normal`, should resolve without inserting the partial key sequence when completed before `timeoutlen`.

If a pending insert-mode sequence times out or stops matching a mapping, the pending text should be flushed back into the prompt as normal input.

### Normal Mode

Normal mode intercepts mapped keys and prevents normal text insertion. Unmapped keys in normal mode should be consumed so they do not type into the prompt.

Entering normal mode should move the cursor left once, bounded to the current visual row, so the cursor lands on the last occupied character rather than the insert-position cell after the text. This mirrors Vim's normal-mode cursor model.

## Pending Key Display

The status area can show a pending key sequence, for example `d NORMAL` after pressing the first `d` in `dd`.

Rules:

- Key resolution uses the real pending state immediately.
- Display of pending state is delayed by `pendingDisplayDelay` to avoid flicker for fast mappings such as `kj`.
- If the sequence resolves before the display delay, it should never flash in the status area.
- If the sequence remains pending past the delay, it should be shown until it resolves or times out.

## Actions

### `normal`

Expected behavior:

- Switch to normal mode.
- Move the cursor left one character when possible.
- Do not cross to the previous visual row while making this adjustment.
- If already at the start of the visual row, stay put.

Implementation note:

- The Escape command uses this action path directly so `<Esc>` and mapped normal-mode transitions behave consistently.

### `insert`

Expected Vim behavior:

- `i` enters insert mode before the current cursor position.

Current behavior:

- Switches to insert mode and focuses the prompt.

Known limitation:

- Because OpenCode's public `TuiPromptRef` does not expose cursor insertion semantics, this currently relies on the existing prompt cursor position.

### `append`

Expected Vim behavior:

- `a` enters insert mode after the current character.

Current behavior:

- Switches to insert mode and focuses the prompt.

Known limitation:

- It does not yet move one character right before entering insert mode. This should be added with the same guarded cursor helper used by normal-mode movement.

### `appendEnd`

Expected Vim behavior:

- `A` moves to the end of the current line and enters insert mode after the last character.

Current behavior:

- Moves to the normal-mode line end helper, switches to insert mode, and focuses the prompt.

Known limitation:

- The normal-mode line-end helper clamps to the last occupied character. For true `A`, we may need a separate insert-mode line-end path that positions at the append cell after the last character.

### `left`

Expected Vim behavior:

- `h` moves one character left.
- It stops at the first column of the current line.
- It does not wrap to the previous line by default.

Current behavior:

- Moves one character left using the focused OpenTUI edit buffer.
- If OpenTUI crosses to a different visual row, restores the previous cursor offset.

### `right`

Expected Vim behavior:

- `l` moves one character right.
- It stops at the last occupied character of the current line.
- It does not move onto the empty insertion cell after the last character.
- It does not wrap to the next line by default.

Current behavior:

- Moves one character right using the focused OpenTUI edit buffer.
- If OpenTUI crosses to a different visual row, restores the previous cursor offset.
- If OpenTUI lands on the visual end-of-line insertion cell, restores the previous cursor offset.

### `up`

Expected Vim behavior:

- `k` moves one line up, preserving the desired column where possible.

Current behavior:

- Calls OpenTUI's focused edit-buffer vertical movement.

### `down`

Expected Vim behavior:

- `j` moves one line down, preserving the desired column where possible.

Current behavior:

- Calls OpenTUI's focused edit-buffer vertical movement.

### `lineStart`

Expected Vim behavior:

- `0` moves to the first character column of the current line.

Current behavior:

- Calls OpenTUI's focused edit-buffer line-start movement.

### `lineEnd`

Expected Vim behavior:

- `$` moves to the last occupied character of the current line.
- It should not land on the empty insertion cell in normal mode.

Current behavior:

- Moves to OpenTUI's visual line end, then clamps back one bounded step to the last occupied character.

### `wordNext`

Expected Vim behavior:

- `w` moves to the start of the next word.

Current behavior:

- Calls OpenTUI's focused edit-buffer word-forward movement.

Known limitation:

- Exact Vim word/WORD semantics are delegated to OpenTUI and may not match Vim perfectly.

### `wordPrev`

Expected Vim behavior:

- `b` moves to the start of the previous word.

Current behavior:

- Calls OpenTUI's focused edit-buffer word-backward movement.

Known limitation:

- Exact Vim word/WORD semantics are delegated to OpenTUI and may not match Vim perfectly.

### `deleteChar`

Expected Vim behavior:

- `x` deletes the character under the cursor.

Current behavior:

- Uses OpenTUI's focused edit-buffer `deleteChar()` when available.
- Falls back to deleting the first input character only if the internal edit-buffer path is unavailable.

### `clear`

Expected Vim behavior for mapped defaults:

- `dd` deletes the current line.
- `D` deletes from cursor to end of line.

Current prompt behavior:

- Clears the entire prompt input.

Rationale:

- The prompt is currently treated as a compact command/input buffer. Full linewise operator semantics are not implemented yet.

### `clearInsert`

Expected Vim behavior for mapped defaults:

- `cc` changes the current line.
- `C` changes from cursor to end of line.

Current prompt behavior:

- Clears the entire prompt input and enters insert mode.

Rationale:

- Full operator/motion/change semantics are not implemented yet.

### `submit`

Expected prompt behavior:

- `<CR>` in normal mode submits the prompt.

Current behavior:

- Calls `TuiPromptRef.submit()`.

## Internal Cursor Access

OpenCode's public `TuiPromptRef` currently exposes input text, focus, reset, set, and submit methods, but no cursor position or cursor movement API.

For cursor movement, `vim-prompt` uses a guarded OpenTUI internal path:

- Reads `api.renderer.currentFocusedRenderable`.
- Feature-detects edit-buffer methods before using them.
- Calls methods such as `moveCursorLeft`, `moveCursorRight`, `moveCursorUp`, `moveCursorDown`, `gotoVisualLineEnd`, `moveWordForward`, and `deleteChar`.

This is intentionally isolated in `src/modules/vim/actions.ts`. If OpenCode exposes first-class prompt cursor APIs later, replace this internal helper rather than spreading direct renderable access across modules.

## Known Gaps

- Counts such as `3w` or `2dd`.
- Operators with arbitrary motions, such as `dw`, `cw`, `d$`, `c0`.
- Text objects such as `iw`, `aw`, `ip`.
- Visual mode.
- Replace mode.
- Undo/redo integration.
- Registers/yank/put.
- Search motions.
- Character find motions such as `f`, `F`, `t`, `T`.
- Vim-accurate word vs WORD distinctions.
- True linewise behavior for `dd`, `cc`, `D`, and `C`.
- `a` and `A` need more precise append-position handling.
