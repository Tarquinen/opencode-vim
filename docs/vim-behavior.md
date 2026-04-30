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
- Operator-pending delete/change flows for a limited motion and text-object subset.
- Prompt-local cursor movement and editing through guarded OpenTUI internals.
- A prompt-right mode indicator.
- Configurable cursor style per mode.

Counts, registers, visual mode, replace mode, marks, undo integration, macros, and the full Vim operator/text-object surface are not implemented yet.

## Configuration Defaults

Default config values:

```ts
defaultMode: "insert"
timeoutlen: 1000
pendingDisplayDelay: 120
cursorStyles: {
  insert: { style: "line", blinking: true },
  normal: { style: "block", blinking: true }
}
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
  "e": "wordEnd",
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
      "timeoutlen": 1000,
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

## Operators And Text Objects

Vim composes operators with motions and text objects. `vim-prompt` should follow that model rather than defining every sequence as a standalone action.

Initial supported operators:

- `d`: delete.
- `c`: change, meaning delete and then enter insert mode.

Initial supported motion operands:

- `w`: to the start of the next word.
- `e`: to the end of the current or next word.
- `b`: back to the start of the previous word.

Initial supported text objects:

- `iw`: inner word under the cursor.

Expected behavior:

- `dw` deletes from the cursor through the `w` motion range.
- `de` deletes from the cursor through the `e` motion range.
- `db` deletes backward from the cursor through the `b` motion range.
- `diw` deletes the inner word under the cursor.
- `ciw` deletes the inner word under the cursor and enters insert mode at the start of the deleted word.

Reusable implementation model:

```ts
type VimOperator = "delete" | "change"
type VimOperand = Motion | TextObject
type TextRange = { start: number; end: number }
```

Operator-pending flow:

```txt
d -> wait for motion or text object
c -> wait for motion or text object
d w -> delete motion range for w
d e -> delete motion range for e
d b -> delete motion range for b
d i w -> delete inner word
c i w -> delete inner word, then enter insert mode
```

Implementation notes:

- Motion ranges are cursor-relative.
- Text-object ranges are object-relative and should cover the word under the cursor, regardless of where inside the word the cursor is.
- `change` reuses delete behavior, then switches to insert mode and places the cursor at the start of the deleted range.
- Current word behavior approximates Vim by treating contiguous non-whitespace as a word.
- Vim's `cw` has special behavior closer to `ce`; this should be handled explicitly when `cw` is added.

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

- Moves one raw cursor step right using the focused OpenTUI edit buffer.
- Switches to insert mode and focuses the prompt.
- Unlike normal-mode `l`, this movement is allowed to land on the insertion cell after the current character.

### `appendEnd`

Expected Vim behavior:

- `A` moves to the end of the current line and enters insert mode after the last character.

Current behavior:

- Moves to OpenTUI's visual line end insertion position.
- Switches to insert mode and focuses the prompt.
- This intentionally differs from normal-mode `$`, which clamps back to the last occupied character.

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

### `wordEnd`

Expected Vim behavior:

- `e` moves to the end of the current word when possible.
- If already at the end of a word, it moves to the end of the next word.

Current behavior:

- Computes the next word end from the focused prompt text and cursor offset.
- Treats contiguous non-whitespace as a word for now.

Known limitation:

- This is an approximation of Vim's `word` behavior. Vim distinguishes keyword words from punctuation runs; `vim-prompt` currently uses non-whitespace groups.

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

For cursor movement, `vim-prompt` uses a guarded OpenTUI internal path:

- Reads `api.renderer.currentFocusedRenderable`.
- Feature-detects edit-buffer methods before using them.
- Calls methods such as `moveCursorLeft`, `moveCursorRight`, `moveCursorUp`, `moveCursorDown`, `gotoVisualLineEnd`, `moveWordForward`, and `deleteChar`.
- Sets `cursorStyle` for mode-specific cursor shapes.

This is intentionally isolated in `src/modules/vim/actions.ts`. If OpenCode exposes first-class prompt cursor APIs later, replace this internal helper rather than spreading direct renderable access across modules.

## Known Gaps

- Counts such as `3w` or `2dd`.
- Full operator/motion coverage, such as `cw`, `d$`, `c0`.
- Additional text objects such as `aw`, `ip`, `ap`.
- Visual mode.
- Replace mode.
- Undo/redo integration.
- Registers/yank/put.
- Search motions.
- Character find motions such as `f`, `F`, `t`, `T`.
- Vim-accurate word vs WORD distinctions.
- True linewise behavior for `dd`, `cc`, `D`, and `C`.
