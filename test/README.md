# Test boundaries

- **Unit:** parsing, configuration, mappings, editing, and Vim state.
- **Integration:** our plugin and components with real OpenTUI renderables.
  Small fixtures supply controlled inputs and record API calls. They do not
  implement OpenCode dialogs, transcript rendering, history loading, or commands.
- **E2E:** the packed plugin running in real OpenCode, including host keyboard
  handling, focus, dialogs, tabs, transcript layout, grouping and virtualization.

## Plugin coverage map

The former `integration/plugin.test.tsx` coverage lives in these focused suites:

| Behavior | Local coverage | Real OpenCode coverage |
| --- | --- | --- |
| Prompt focus, mode/status/theme, mappings, native key passthrough, cleanup | `integration/input.test.ts` | `tab-switching`, `agent-switching` |
| Clipboard Unicode/CRLF/counts, undo/redo, registers, async ordering, fallback, cancellation | `integration/clipboard.test.ts` | `session-copy` |
| Dialog query changes and command selection | `integration/input.test.ts` | `dialog-focus`, `dialog-focus-normal`, `prompt-dialog` (mode inheritance, undo isolation, native focus and submission) |
| Session entry/exit, toggle key scope, mappings and control chords | `integration/session.test.tsx`, `unit/session-keymaps.test.ts` | `session-key-*`, `session-empty`, `session-keymaps`, `session-agent-binding` |
| Session and reader lifecycle, route changes, replacement dialogs and disable | `integration/session.test.tsx`, `integration/readers/text.test.ts` | `session-lifecycle`, `message-reader` (including delayed host refocus) |
| Message reader motions, exact copy, read-only mappings/paste, streaming snapshot, paging and remembered positions | `integration/readers/text.test.ts` | `message-reader`, `reader-layout`, `session-copy` |
| Shell sections, panel mappings, whitespace, Unicode and delayed syntax/diff highlights | `integration/readers/shell.test.ts` | `shell-reader*`, `background-shell*`, `session-keymaps` |
| File reader ranges, gutters, partial/empty/non-file results, highlighting and disposal | `integration/readers/read.test.ts`, `unit/read-reader.test.ts` | `read-reader*` (including native modal resize) |
| Change views, per-view cursors, signs/colors, exact copy, mouse tabs, added/deleted/unknown patches | `integration/readers/diff.test.ts`, `unit/diff-reader.test.ts` | `diff-reader*`, `file-changes*` (including native modal resize) |
| Selection marker and yank colors, Unicode, viewport clipping, unchanged geometry | `integration/selection.test.ts` | `session-copy` (flash expiry and cancellation), `transcript-layout-*`, `transcript-partial-*` |
| Transcript source matching, anonymous/grouped tool rows and patch files | `integration/transcript.test.ts` | `transcript-grouped-*`, `transcript-low-detail-*`, `transcript-ungrouped-*`, `transcript-running-*`, `transcript-parts-*` |
| Visible and offscreen navigation, separate parts, latest/reasoning selection, natural bottom, virtualization and history compensation | | `transcript-layout-*`, `transcript-partial-*`, `transcript-parts-*`, `transcript-history-*` (animations on/off) |
| Source and published-package shared runtime | `integration/runtime.test.ts` launches `helpers/runtime-smoke.test.ts` in fresh processes | All E2E scenarios load the packed plugin |

`helpers/runtime-smoke.test.ts` is intentionally outside normal test discovery:
its parent tests install the source or npm package and set the entrypoint before
launching it. It checks shared OpenTUI classes, Solid reactivity, clipboard and
cleanup without rerunning unrelated behavior tests.

Run `bun run typecheck`, `bun run test`, and `bun run test:e2e`. To work on one
host regression, pass scenario names, for example:
`bun run test:e2e message-reader session-lifecycle`.
