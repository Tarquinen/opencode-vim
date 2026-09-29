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
stay local:

| Behavior | Local coverage | Real OpenCode coverage |
| --- | --- | --- |
| Prompt focus, mode/status/theme, mappings, native key passthrough, cleanup | | `prompt-input`, `runtime-*`, `tab-switching`, `agent-switching*` |
| Clipboard Unicode/CRLF/counts, undo/redo, registers, async ordering, fallback, adapter cancellation | `integration/clipboard.test.ts` | `prompt-clipboard`, `session-copy`, `clipboard-cancel-*` (late response and queued keys across focus/route/toggle/unload) |
| Dialog query changes and command selection | | `dialog-focus`, `dialog-focus-normal`, `dialog-mappings`, `dialog-multikey-mappings`, `dialog-scope`, `prompt-dialog` (mode inheritance, undo isolation, mapping-prefix priority, native navigation, pending motions and unrelated extension input) |
| Native prompt history, exit on movement, Unicode edits and mapped-command cursor preservation | | `prompt-history`, `prompt-command-cursor` |
| Session entry/exit, toggle key scope, mappings, control chords, narrow status layout | `unit/session-keymaps.test.ts` | `session-key-*`, `session-empty`, `session-keymaps`, `session-agent-binding` |
| Session and reader lifecycle, route changes, replacement dialogs and disable | `integration/readers/text.test.ts` | `session-lifecycle`, `runtime-*`, `message-reader` (including delayed host refocus) |
| Message reader motions, exact copy, read-only mappings/paste, streaming snapshot, paging and remembered positions | `integration/readers/text.test.ts` | `message-reader`, `reader-layout`, `session-copy` |
| Shell sections, panel mappings, whitespace, Unicode and delayed syntax/diff highlights | `integration/readers/shell.test.ts` | `shell-reader*`, `background-shell*`, `session-keymaps` |
| File reader ranges, gutters, partial/empty/non-file results, highlighting and disposal | `integration/readers/read.test.ts`, `unit/read-reader.test.ts` | `read-reader*` (including native modal resize) |
| Change views, per-view cursors, signs/colors, exact copy, mouse tabs, added/deleted/unknown patches | `integration/readers/diff.test.ts`, `unit/diff-reader.test.ts` | `diff-reader*`, `file-changes*` (including native modal resize) |
| Selection marker and yank colors, Unicode, viewport clipping, unchanged geometry | | `session-copy` (flash expiry and cancellation), `transcript-layout-*`, `transcript-partial-*` |
| Transcript source matching, anonymous/grouped/permission-blocked tool rows and patch files | | `background-shell*`, `permission-tools*`, `file-changes*`, `patch-running`, `transcript-grouped-*`, `transcript-low-detail-*`, `transcript-ungrouped-*`, `transcript-running-*`, `transcript-parts-*` |
| Exact whole-message/part clipboard payloads, including offscreen text, Markdown and Unicode | | `session-copy`, `transcript-layout-*`, `transcript-partial-*`, `transcript-parts-*` (captured OSC52 writes) |
| Messages arriving while browsing, streaming reader snapshot/selection and refreshed transcript | `integration/readers/text.test.ts` | `transcript-live-*` (real server with a controlled local model stream) |
| Visible and offscreen navigation, separate parts, latest/reasoning selection, natural bottom, virtualization and history compensation | | `transcript-layout-*`, `transcript-partial-*`, `transcript-parts-*`, `transcript-history-*` (animations on/off) |
| Source and published-package shared runtime | | `runtime-source`, `runtime-npm` (published `./tui` export, private Solid copies, reactive theme/status, manager and active-reader config unload/reload) |

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
