# Keybindings and Modes

These are the default bindings. See [Configuration](./configuration.md) to change
the startup mode, session key, or editing mappings.

## Prompt editing

Starts in insert mode. Press `Esc` to enter normal mode and `i` to type again.
Use `/vim` to toggle the plugin on or off.

| Key | Behavior |
| --- | --- |
| `Esc`, `Ctrl+[` | Enter normal mode |
| `i`, `a`, `A`, `o`, `O` | Enter insert mode |
| `h`, `l`, `w`, `b`, `e`, `$`, `0` | Move through the prompt |
| `j`, `k` | Move through wrapped rows; counts use actual lines |
| Up, Down | OpenCode's cursor/history navigation |
| `gj`, `gk`, `g0`, `g^`, `g$` | Move through wrapped screen rows |
| `x`, `d`, `c`, `y`, `p` | Delete, change, yank, and paste |
| `u`, `Ctrl+r`, `.` | Undo, redo, and repeat the last change |
| `v`, `V` | Visual and visual-line selection |
| `3w`, `diw`, `ci"`, `yiq`, `dip`, `yib` | Counts and text objects |
| `k`, `j` from an empty prompt | Browse previous and next prompts |
| `Enter` in normal mode | Submit the prompt |
| `s` in normal mode | Enter session mode |

Wrapping is visual only. Line commands such as `0`, `$`, `A`, `dd`, `yy`, and `V`
use actual newline-separated lines. Bare `j`/`k` follow wrapped rows, as in
LazyVim; counts such as `3j` and operator motions such as `dj` use actual lines.
`gj`/`gk` always follow wrapped rows, including with counts.

Text objects include words and quotes, plus `iq`/`aq` for the nearest quote pair,
`ip`/`ap` for paragraphs, and `ib`/`ab` or `iB`/`aB` for parentheses or braces.
Yanks and cuts (`y`, `d`, `c`, `x`) write to the system clipboard. `p` and `P`
read its current text, including text copied from another application. Counts,
linewise puts, undo, and dot repeat still use Vim's editing behavior.

Named registers such as `"ayiw` and `"ap` stay separate from the system clipboard.
When clipboard access is unavailable, puts use the last copied text shared by
the prompt, dialogs, and session reader. Over SSH, copying uses the terminal's
clipboard support; `p` uses this fallback because OpenTUI cannot read the remote
client's clipboard. Use your terminal's paste shortcut for external text there.
Use OpenCode's normal paste shortcut for images and attachment handling.

## Session mode

From a session prompt, press `s` in normal mode to browse from the latest item.
A colored bar marks the selected text block, reasoning block, tool call, or group.
Visible items are highlighted in place; off-screen items scroll into view.

| Key | Behavior |
| --- | --- |
| `j`, `k`, Down, Up | Next / previous item; counts work too |
| `gg`, `G` | First / last item |
| `Enter` | Expand/collapse a group, or open an item in a read-only modal |
| `yy` | Copy selected text; groups copy their summary |
| `Ctrl+d`, `Ctrl+u` | Scroll down / up |
| `Ctrl+f`, `Ctrl+b`, Page Down, Page Up | Scroll by larger steps |
| `Esc`, `Ctrl+[` | Return to the prompt |
| `s` | Return to the prompt |

A collapsed group is one stop. Expand it to navigate its individual tools or
reasoning blocks. Tool items expose their displayed details; text items preserve
their Markdown.

Inside the modal, use Vim motions to move, `v` or `V` to select, and `y` to copy.
`Esc` cancels a selection or pending motion, then closes the modal. From its normal
mode, `s` returns directly to the prompt. The modal keeps a snapshot of the item
while you read it, even if the response is still streaming.

Session yanks go to both the clipboard and the shared fallback, so `p`
pastes into the prompt. Yanks briefly highlight the copied text. Your prompt text,
cursor, and undo history are preserved.

## Dialogs

Search dialogs such as `/models` and `Ctrl+P` inherit the prompt's insert/normal
mode. Type to filter in insert mode; use `j`/`k` to choose items in normal mode.
`Enter` confirms, and `Esc` in normal mode goes back.

The footer follows the active editor's mode. Closing the dialog restores the
prompt's mode or the session footer. Prompt and dialog edits have separate undo
histories.

## Subagents, Shell, and Terminals

The panel opened with Down uses Vim navigation regardless of the prompt's mode.
Use `h`/`l` to switch tabs and `j`/`k` to move between entries. Enter selects an
entry; `Esc` or `Ctrl+[` closes the panel. Arrow keys and existing shortcuts such
as `Ctrl+a` to show inactive subagents still work.

Navigation follows OpenCode's behavior, including wrapping and returning to the
prompt when moving up from the first subagent or shell entry. Closing the panel
preserves your prompt text and Vim mode.

## Live side terminals

From prompt normal mode or transcript browsing, `Ctrl+/` opens or focuses the
side terminal. In live terminal input, it hides the pane and
returns to the prompt without terminating the process. If no terminal exists,
OpenCode creates one. While the terminal has focus, a single footer below the
prompt shows `TERMINAL · Alt+h/l swap · Ctrl+/ hide`, styled like the session footer.

`Alt+h` focuses OpenCode and `Alt+l` focuses the visible right pane, including
while typing in the prompt. These switch focus without hiding or creating a
terminal. They are reserved from the child; shell Backspace and `Ctrl+l`
clear-screen remain native.

`Ctrl+_` is accepted too because legacy terminals encode `Ctrl+/` that way. This
chord is reserved rather than sent to the child, where it commonly means undo.
Disabling Vim restores native behavior.

Remap or disable these defaults through `keymaps.panes`; see
[Pane controls](./configuration.md#pane-controls). Both live input interception
and the footer follow those mappings. Existing editor `command:` mappings can
also call `opencode-vim.terminal.toggle`.

The live terminal sends input directly to its shell or application. Ordinary
Vim keys, Escape, and prompt mappings are not intercepted: Neovim, shell history,
and interactive tools keep their own bindings.

There is no plugin-specific history or copy mode. Use OpenCode's native mouse-wheel
scrollback and selection, or the shell/application's own commands. `Ctrl+\ Ctrl+n`
is not intercepted. Prompt text and Vim mode remain separate from terminal input.

OpenCode's native leader shortcuts still manage the live panes: `Ctrl+x` followed
by Left/Right changes focus, Down opens the terminal picker, and Up hides the
terminal without terminating its process. Leaving transcript browsing for another
pane ends session mode so it cannot swallow terminal input.

## Questions

Questions start in normal mode. `j`/`k` move between every answer, including away
from "Type your own answer". `h`/`l` or Tab switch question fields. Enter selects
an option, and Space toggles a multi-select answer.

Press `i` to open or reopen the custom answer. Enter also opens an empty custom
answer; for an existing multi-select answer it keeps the native toggle behavior.
Type in insert mode; `Esc`, `Ctrl+[`, or your configured insert-mode mapping to `normal`
returns to navigation and preserves the answer. `Esc` in normal mode dismisses
the question. The mode is shown above the question, and the prompt's previous
mode is restored when it closes.

Insert mappings use the same configuration and timeout as the prompt. There is
no default two-letter binding for leaving insert mode.

## Vim compatibility

This is a Vim-style subset powered by `@vimee/core`, with OpenCode-specific
submission, history, dialogs, and session navigation. Insert-mode typing uses
OpenCode's native editor. The adapter maps graphemes and cursor positions without
adding newlines at soft wraps.

For standard Vim terminology, see [Vim's quick reference](https://vimhelp.org/quickref.txt.html)
and [motion documentation](https://vimhelp.org/motion.txt.html).
