# Test boundaries

- **Unit:** parsing, configuration, mappings, editing, and Vim state.
- **Integration:** our editor, clipboard and reader components with real OpenTUI
  renderables. Fixtures control component inputs and external clipboard responses,
  and record outgoing calls. They never mount the plugin in a fake host or build
  imitation OpenCode transcript trees, modes, dialogs, history, or commands.
- **E2E:** the source or packed plugin running in real OpenCode, including host keyboard
  handling, focus, dialogs, tabs, transcript layout, grouping and virtualization.

## Plugin coverage map

Host-dependent assertions live in real OpenCode scenarios; component assertions
stay local:

| Behavior | Local coverage | Real OpenCode coverage |
| --- | --- | --- |
| Prompt focus, mode/status/theme, mappings, native key passthrough, cleanup | | `prompt-input`, `runtime-*`, `tab-switching`, `agent-switching*` |
| Clipboard Unicode/CRLF/counts, undo/redo, registers, async ordering, fallback, adapter cancellation | `integration/clipboard.test.ts` | `prompt-clipboard`, `session-copy` (real input queue and shared prompt/dialog clipboard) |
| Dialog query changes and command selection | | `dialog-focus`, `dialog-focus-normal`, `dialog-mappings`, `prompt-dialog` (mode inheritance, undo isolation, native focus and submission) |
| Native prompt history and editing recalled Unicode text | | `prompt-history` |
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
| Source and published-package shared runtime | | `runtime-source`, `runtime-npm` (private Solid copies, reactive theme/status, real plugin unload/reload); all other E2E scenarios load the packed plugin |

Most transcripts are imported saved messages. Live-response and prompt-history
scenarios use a controlled local OpenAI-compatible stream; OpenCode owns message
creation, history, events and rendering. Permission scenarios create real pending
requests through the server API. Clipboard assertions decode actual OSC52 output.

Run `bun run typecheck`, `bun run test`, and `bun run test:e2e`. To work on one
host regression, pass scenario names, for example:
`bun run test:e2e message-reader session-lifecycle`.
