# Test boundaries

- **Unit:** parsing, configuration, mappings, editing, and Vim state.
- **Integration:** our editor, clipboard and reader components with real OpenTUI
  renderables. Fixtures control component inputs and external clipboard responses,
  and record outgoing calls. They never mount the plugin in a fake host or build
  imitation OpenCode transcript trees, modes, dialogs, history, or commands.
- **E2E:** the source or packed plugin running in real OpenCode, including host keyboard
  handling, focus, dialogs, tabs, transcript layout, grouping and virtualization.

## Layout

- `unit/`: focused logic tests.
- `integration/`: component tests, with reader cases grouped in `readers/`.
- `helpers/`: shared component fixtures and Neovim reference support.
- `e2e/run.ts`: E2E entrypoint and scenario registration.
- `e2e/scenarios/`: real-host test cases.
- `e2e/data/`: prepared conversations and tool results.
- `e2e/support/`: host setup, terminal driver, services, assertions and probe plugin.
- `benchmark.ts`: standalone editor performance checks.

## Plugin coverage map

Host-dependent assertions live in real OpenCode scenarios; component assertions
stay local.

Configuration variants cover their distinct host behavior rather than replaying
every reader or editing assertion. The default session key, dialog startup mode,
agent bindings and diff view run the full flows; alternate configurations check
key routing, mode inheritance, initial views and focus restoration. Invalid
configuration fallback stays in unit tests.

| Behavior                                                                                                                               | Local coverage                                                 | Real OpenCode coverage                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prompt focus, mode/status/theme, mappings, native key passthrough, cleanup                                                             |                                                                | `prompt-input`, `runtime-*`, `tab-switching`, `agent-switching*`                                                                                                                                                                                                                                                   |
| Clipboard Unicode/CRLF/counts, undo/redo, registers, async ordering, fallback, adapter cancellation                                    | `integration/clipboard.test.ts`                                | `prompt-clipboard`, `session-copy`, `clipboard-cancel-*` (late response and queued keys across focus/route/toggle/unload)                                                                                                                                                                                          |
| Dialog query changes and command selection                                                                                             |                                                                | `dialog-focus`, `dialog-focus-normal`, `dialog-mappings`, `dialog-multikey-mappings`, `dialog-scope`, `prompt-dialog` (mode inheritance, filtered results after edit/undo/redo, insert/normal mappings, undo isolation, mapping-prefix priority, native navigation, pending motions and unrelated extension input) |
| Question form navigation, custom answers, insert mappings, submission/cancellation and prompt restoration                              |                                                                | `question-forms`, `question-forms-kj`, `question-forms-zz`                                                                                                                                                                                                                                                         |
| Subagent/shell/terminal panel Vim navigation, native shortcuts, disabled-plugin passthrough and prompt restoration                     |                                                                | `composer-navigation`                                                                                                                                                                                                                                                                                              |
| Real PTY passthrough, focus isolation, route/removal/disable/unload and nested Neovim                                                  |                                                                | `terminal-focus`, `terminal-application`                                                                                                                                                                                                                                                                           |
| Ctrl+/ terminal creation/focus/hide, Alt+h/l pane focus, modern/legacy encodings, prompt modes/cursor styles and child input isolation |                                                                | `terminal-toggle`, `terminal-application`                                                                                                                                                                                                                                                                          |
| Shared pane command mappings, default overrides, disabled/legacy chords, dynamic footer and released child keys                        | `unit/pane-keymaps.test.ts`                                    | `terminal-mappings`, `terminal-bindings-disabled`, `terminal-binding-override`                                                                                                                                                                                                                                     |
| Native prompt history, exit on movement, Unicode edits and mapped-command cursor preservation                                          |                                                                | `prompt-history`, `prompt-command-cursor`                                                                                                                                                                                                                                                                          |
| Native undo/redo, Vim change grouping, mixed native/Vim history, reset/cleanup, rich-item submission                                   | `integration/history.test.ts`, Neovim parity                   | `native-history` (original pasted contents and image/file payloads after insertion undo/redo), `dialog-focus`, `dialog-mappings`                                                                                                                                                                                   |
| Session entry/exit, toggle key scope, mappings, control chords, narrow status layout                                                   | `unit/session-keymaps.test.ts`                                 | `session-key-*`, `session-empty`, `session-keymaps`, `session-agent-binding`                                                                                                                                                                                                                                       |
| Session and reader lifecycle, route changes, replacement dialogs and disable                                                           | `integration/readers/text.test.ts`                             | `session-lifecycle`, `runtime-*`, `message-reader` (including delayed host refocus)                                                                                                                                                                                                                                |
| Message reader motions, exact copy, read-only mappings/paste, streaming snapshot, paging and remembered positions                      | `integration/readers/text.test.ts`                             | `message-reader`, `reader-layout`, `session-copy`                                                                                                                                                                                                                                                                  |
| Shell sections, panel mappings, whitespace, Unicode and delayed syntax/diff highlights                                                 | `integration/readers/shell.test.ts`                            | `shell-reader*`, `background-shell*`, `session-keymaps`                                                                                                                                                                                                                                                            |
| File reader ranges, gutters, partial/empty/non-file results, highlighting and disposal                                                 | `integration/readers/read.test.ts`, `unit/read-reader.test.ts` | `read-reader*` (including native modal resize)                                                                                                                                                                                                                                                                     |
| Change views, per-view cursors, signs/colors, exact copy, mouse tabs, added/deleted/unknown patches                                    | `integration/readers/diff.test.ts`, `unit/diff-reader.test.ts` | `diff-reader*`, `file-changes*` (including native modal resize)                                                                                                                                                                                                                                                    |
| Selection marker and yank colors, Unicode, viewport clipping, unchanged geometry                                                       |                                                                | `session-copy` (flash expiry and cancellation), `transcript-layout-*`, `transcript-partial-*`                                                                                                                                                                                                                      |
| Transcript source matching, anonymous/grouped/permission-blocked tool rows and patch files                                             |                                                                | `background-shell*`, `permission-tools*`, `file-changes*`, `patch-running`, `transcript-grouped-*`, `transcript-low-detail-*`, `transcript-ungrouped-*`, `transcript-running-*`, `transcript-parts-*`                                                                                                              |
| Exact whole-message/part clipboard payloads, including offscreen text, Markdown and Unicode                                            |                                                                | `session-copy`, `transcript-layout-*`, `transcript-partial-*`, `transcript-parts-*` (captured OSC52 writes)                                                                                                                                                                                                        |
| Messages arriving while browsing, streaming reader snapshot/selection and refreshed transcript                                         | `integration/readers/text.test.ts`                             | `transcript-live-*` (real server with a controlled local model stream)                                                                                                                                                                                                                                             |
| Visible and offscreen navigation, separate parts, latest/reasoning selection, natural bottom, virtualization and history compensation  |                                                                | `transcript-layout-*`, `transcript-partial-*`, `transcript-parts-*`, `transcript-history-*` (animations on/off)                                                                                                                                                                                                    |
| Source and published-package shared runtime                                                                                            |                                                                | `runtime-source`, `runtime-npm` (published `./tui` export, private Solid copies, reactive theme/status, manager and active-reader config unload/reload)                                                                                                                                                            |

Most transcripts are imported saved messages. Live-response and prompt-history
scenarios use a controlled local OpenAI-compatible stream; OpenCode owns message
creation, history, events and rendering. Permission scenarios create real pending
requests through the server API. Clipboard assertions decode actual OSC52 output.

Selected scenarios load `e2e/support/probe/tui.tsx`, a small driver inside the real host. It calls
OpenCode's public dialog/command/router APIs and inspects real focused editors and
theme values. Config changes exercise native plugin disposal without replacing
an active reader first. No host state or behavior is implemented by the driver.

Clipboard cancellation scenarios use a source copy with only the external
`createHostClipboard` factory replaced by `e2e/support/clipboard-boundary.ts`. Its HTTP read
waits for an explicit release, even after disposal. The actual Vim clipboard,
input queue, focus callbacks and cleanup still execute inside real OpenCode.
Other scenarios use the packed published export (or the unmodified source in
`runtime-source`).

Run `bun run typecheck`, `bun run test`, and `bun run test:e2e`. To work on one
host regression, pass scenario names, for example:
`bun run test:e2e message-reader session-lifecycle`.

## Native history contract

OpenTUI restores editor content; the plugin groups native entries into Vim changes
and records their cursor positions. `src/vim/history.ts` is a compatibility layer
because the editor has no public undo-group API. It wraps public methods, not
private attachment state.

The tracker assumes each changed edit adds one native history entry; `replaceText`
also adds an entry for unchanged text. Native undo/redo move one entry, while
`setText`, `clear`, and `clearHistory` reset history. Entries predating attachment
retain native granularity because their Vim boundaries are unknown.

When updating OpenTUI, run the real-component history tests, Neovim parity tests
(including exact cursor positions), and the real-host `native-history` scenario.
The host's existing rich-item deletion/undo and highlighting bugs remain separate
from grouping; registers are still text-only.

## E2E performance

E2E runs up to four scenarios at a time, limited by available processors, after
building and packing the plugin once. CI uses two workers to limit contention.
Every scenario still gets its own server, workspace, configuration, and tmux
session. Workers take the next scenario as soon as they finish, and a failure
does not prevent the remaining scenarios from running.

Use `E2E_WORKERS=1 bun run test:e2e` for sequential debugging, or set another
positive worker count to benchmark your machine. More workers can overload
small CI runners, so measure before increasing it.

Each run saves `test-results/e2e/run-*/result.json` with total wall time, shared
setup time, execution wall time, and per-scenario timings for preparation,
server/session startup, TUI startup, assertions, and cleanup. Per-scenario times
overlap when running in parallel; their sum is not the run's wall time. CI uploads
these results even on success, and caches npm downloads and host/reference
binaries. OpenCode's latest stable version is still resolved on every run.

Detached tmux is configured with explicit foreground/background colors so it
answers terminal color queries instead of delaying host startup until theme
detection times out. Screen assertions poll every 50 ms, with unchanged timeouts.
Per-fixture update checks are disabled; the runner resolves the host version once.
