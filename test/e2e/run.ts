import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { runWithFixture, type Fixture, type FixtureSetup } from "./support/fixture"
import { installOpenCode } from "./support/opencode"
import { copySourcePlugin, packPlugin } from "./support/plugin"
import { agentSwitching } from "./scenarios/agent-switching"
import { dialogFocus, dialogMappings, dialogModeInheritance, dialogScope, promptDialog } from "./scenarios/dialog-focus"
import { tabSwitching } from "./scenarios/tab-switching"
import { messageReader, readerLayout } from "./scenarios/message-reader"
import {
  transcriptGrouped,
  transcriptLowDetail,
  transcriptUngrouped,
  transcriptRunning,
  transcriptHistory,
} from "./scenarios/transcript"
import { readerMessages, transcriptMessages, historyMessages } from "./data/transcript"
import { shellMessages, backgroundShellMessages } from "./data/shell"
import { shellReader } from "./scenarios/shell-reader"
import { backgroundShell } from "./scenarios/background-shell"
import { sessionKeymaps, sessionAgentBinding } from "./scenarios/session-keymaps"
import { readMessages } from "./data/read"
import { readReader } from "./scenarios/read-reader"
import { fileChangeMessages, pendingChangeMessages } from "./data/file-changes"
import { fileChanges, pendingPatch } from "./scenarios/file-changes"
import { diffReader } from "./scenarios/diff-reader"
import { emptySession, sessionControls, sessionKeyConflict, sessionLifecycle } from "./scenarios/session-controls"
import { transcriptLayout, transcriptPartial, transcriptParts, sessionCopy } from "./scenarios/transcript-layout"
import { layoutMessages, partialMessages, partMessages, copyMessages, longReaderMessages } from "./data/navigation"
import { transcriptLive } from "./scenarios/transcript-live"
import { pluginLifecycle } from "./scenarios/plugin-lifecycle"
import { promptClipboard, promptCommandCursor, promptHistory, promptInput } from "./scenarios/prompt-input"
import { permissionMessages } from "./data/permission"
import { permissionTools } from "./scenarios/permission-tools"
import { clipboardCancellation } from "./scenarios/clipboard-cancel"
import { questionForms } from "./scenarios/question-forms"

const scenarios: Array<{
  name: string
  run: (fixture: Fixture) => Promise<void>
  source?: boolean
  setup?: FixtureSetup
}> = [
  {
    name: "prompt-input",
    run: promptInput,
    setup: { vim: { defaultMode: "normal", keymaps: { insert: { kj: "normal" }, normal: { "<Tab>": "x" } } } },
  },
  { name: "prompt-clipboard", run: promptClipboard, setup: { vim: { keymaps: { normal: { Q: "yiw$p" } } } } },
  { name: "prompt-history", run: promptHistory, setup: { stream: "history response" } },
  {
    name: "prompt-command-cursor",
    run: promptCommandCursor,
    setup: {
      stream: "history response",
      vim: { keymaps: { normal: { Q: "command:prompt.history.next" } } },
    },
  },
  { name: "tab-switching", run: tabSwitching },
  { name: "dialog-focus", run: dialogFocus, setup: { probe: true } },
  { name: "dialog-focus-normal", run: dialogModeInheritance, setup: { vim: { defaultMode: "normal" } } },
  { name: "prompt-dialog", run: promptDialog },
  { name: "dialog-mappings", run: dialogMappings, setup: { probe: true, vim: { keymaps: { normal: { j: "x" } } } } },
  {
    name: "dialog-multikey-mappings",
    run: (fixture) => dialogMappings(fixture, "jj"),
    setup: {
      probe: true,
      vim: { keymaps: { normal: { jj: "x" }, insert: { kj: "normal" } } },
    },
  },
  {
    name: "dialog-scope",
    run: dialogScope,
    setup: {
      probe: true,
      cli: { keybinds: { "dialog.select.next": ["down", "tab"], "dialog.select.prev": ["up", "shift+tab"] } },
    },
  },
  { name: "question-forms", run: questionForms() },
  {
    name: "question-forms-kj",
    run: questionForms("kj"),
    setup: { vim: { keymaps: { insert: { kj: "normal", "<C-s>": "submit" } } } },
  },
  {
    name: "question-forms-zz",
    run: questionForms("zz"),
    setup: { vim: { keymaps: { insert: { zz: "<Esc>", "<C-s>": "submit" } } } },
  },
  { name: "agent-switching", run: agentSwitching },
  {
    name: "agent-switching-tab-mapping",
    run: (fixture) => agentSwitching(fixture, true),
    setup: { vim: { keymaps: { normal: { "<Tab>": "x" } } } },
  },
  { name: "message-reader", run: messageReader, setup: { messages: readerMessages } },
  { name: "reader-layout", run: readerLayout, setup: { messages: longReaderMessages } },
  { name: "session-empty", run: emptySession },
  {
    name: "session-lifecycle",
    run: sessionLifecycle,
    setup: { messages: readerMessages, vim: { keymaps: { normal: { Q: "command:opencode-vim.toggle" } } } },
  },
  { name: "session-copy", run: sessionCopy, setup: { messages: copyMessages, probe: true } },
  { name: "shell-reader", run: shellReader, setup: { messages: shellMessages } },
  {
    name: "shell-reader-low-detail",
    run: shellReader,
    setup: { messages: shellMessages, cli: { session: { verbosity: "low" } } },
  },
  { name: "background-shell", run: backgroundShell, setup: { messages: backgroundShellMessages } },
  {
    name: "background-shell-low-detail",
    run: backgroundShell,
    setup: { messages: backgroundShellMessages, cli: { session: { verbosity: "low" } } },
  },
  { name: "read-reader", run: readReader, setup: { messages: readMessages } },
  {
    name: "read-reader-low-detail",
    run: readReader,
    setup: { messages: readMessages, cli: { session: { verbosity: "low" } } },
  },
  {
    name: "file-changes",
    run: fileChanges,
    setup: { messages: fileChangeMessages, cli: { diffs: { view: "unified" } } },
  },
  {
    name: "file-changes-low-detail",
    run: fileChanges,
    setup: { messages: fileChangeMessages, cli: { session: { verbosity: "low" }, diffs: { view: "split" } } },
  },
  {
    name: "file-changes-ungrouped",
    run: fileChanges,
    setup: { messages: fileChangeMessages, cli: { session: { grouping: "none" } } },
  },
  { name: "patch-running", run: pendingPatch, setup: { messages: pendingChangeMessages } },
  {
    name: "permission-tools",
    run: permissionTools(true),
    setup: { messages: permissionMessages, cli: { session: { grouping: "auto" } } },
  },
  {
    name: "permission-tools-ungrouped",
    run: permissionTools(false),
    setup: { messages: permissionMessages, cli: { session: { grouping: "none" } } },
  },
  { name: "diff-reader", run: diffReader(), setup: { messages: fileChangeMessages } },
  {
    name: "diff-reader-before",
    run: diffReader("before", true),
    setup: {
      messages: fileChangeMessages,
      vim: {
        diffView: "before",
        keymaps: { session: { "<Tab>": "passthrough", "<C-w>w": "switch-panel" } },
      },
    },
  },
  {
    name: "diff-reader-low-detail",
    run: diffReader("diff"),
    setup: {
      messages: fileChangeMessages,
      cli: { session: { verbosity: "low" }, diffs: { view: "split" } },
      vim: { diffView: "diff" },
    },
  },
  {
    name: "session-keymaps",
    run: sessionKeymaps,
    setup: {
      messages: shellMessages,
      cli: { keybinds: { "session.new": "tab" } },
      vim: { keymaps: { session: { "<Tab>": "passthrough", "<C-w>w": "switch-panel" } } },
    },
  },
  {
    name: "session-agent-binding",
    run: sessionAgentBinding,
    setup: {
      messages: shellMessages,
      cli: { keybinds: { "agent.cycle": "tab", "dialog.select.next": "tab" } },
      vim: { keymaps: { session: { "<Tab>": "passthrough", "<C-w>w": "switch-panel" } } },
    },
  },
]
for (const action of ["focus", "route", "toggle", "unload"] as const) {
  scenarios.push({
    name: `clipboard-cancel-${action}`,
    run: clipboardCancellation(action),
    setup: { probe: true, delayedClipboard: true },
  })
}
for (const source of [false, true]) {
  scenarios.push({
    name: source ? "runtime-source" : "runtime-npm",
    run: pluginLifecycle,
    source,
    setup: {
      messages: readerMessages,
      probe: true,
      cli: {
        cursor: { style: "underline", blinking: true },
        theme: { name: "opencode", mode: "dark" },
        keybinds: { "plugins.list": ["f6", "ctrl+g"], "theme.switch_mode": "f7" },
      },
    },
  })
}
for (const key of ["s", "q", "<C-s>", "<C-c>"]) {
  scenarios.push({
    name: `session-key-${key.replace("<C-", "ctrl-").replace(">", "")}`,
    run: sessionControls(key),
    setup: { messages: readerMessages, vim: { sessionKey: key } },
  })
}
for (const key of ["s", "q"]) {
  scenarios.push({
    name: `session-key-${key}-mapping`,
    run: sessionKeyConflict(key),
    setup: {
      messages: readerMessages,
      vim: { sessionKey: key, keymaps: { normal: { [key + key]: "x" } } },
    },
  })
}
for (const animations of [true, false]) {
  const suffix = animations ? "animated" : "static"
  for (const [name, run, session, running] of [
    ["grouped", transcriptGrouped, { verbosity: "medium", grouping: "auto", thinking: "hide" }, false],
    ["low-detail", transcriptLowDetail, { verbosity: "low", grouping: "auto", thinking: "hide" }, false],
    ["ungrouped", transcriptUngrouped, { verbosity: "medium", grouping: "none", thinking: "show" }, false],
    ["running", transcriptRunning, { verbosity: "medium", grouping: "auto", thinking: "hide" }, true],
  ] as const) {
    const messages = transcriptMessages(running)
    if (name === "grouped") messages.unshift(...historyMessages())
    scenarios.push({ name: `transcript-${name}-${suffix}`, run, setup: { messages, cli: { animations, session } } })
  }
  scenarios.push({
    name: `transcript-history-${suffix}`,
    run: transcriptHistory,
    setup: { messages: historyMessages(), cli: { animations } },
  })
  scenarios.push({
    name: `transcript-live-${suffix}`,
    run: transcriptLive,
    setup: {
      messages: readerMessages,
      stream: "hello",
      cli: { animations },
    },
  })
  for (const [name, run, messages] of [
    ["layout", transcriptLayout, layoutMessages],
    ["partial", transcriptPartial, partialMessages],
    ["parts", transcriptParts, partMessages],
  ] as const) {
    scenarios.push({
      name: `transcript-${name}-${suffix}`,
      run,
      setup: {
        messages,
        probe: name === "partial",
        cli: { animations, session: { grouping: "none", thinking: "show" } },
      },
    })
  }
}

const requested = Bun.argv.slice(2)
for (const name of requested) {
  if (!scenarios.some((scenario) => scenario.name === name)) throw new Error(`Unknown E2E scenario: ${name}`)
}
if (!Bun.which("tmux")) throw new Error("E2E tests require tmux. Install it, then run bun run test:e2e.")

const root = path.resolve(import.meta.dir, "../..")
const output = path.join(root, "test-results/e2e")
await mkdir(output, { recursive: true })
const artifacts = await mkdtemp(path.join(output, "run-"))
await mkdir("/tmp/opencode", { recursive: true })
const temporary = await mkdtemp("/tmp/opencode/vim-e2e-")
const results: Array<{ name: string; status: "passed" | "failed"; milliseconds: number; error?: string }> = []
let version: string | undefined
let setupFailure: string | undefined

console.log(`E2E artifacts: ${artifacts}`)
try {
  const opencode = await installOpenCode()
  version = opencode.version
  const plugin = await packPlugin(root, temporary, artifacts)
  const sourcePlugin = await copySourcePlugin(root, temporary)
  const clipboardPlugin = await copySourcePlugin(root, temporary, true)

  for (const scenario of scenarios) {
    if (requested.length && !requested.includes(scenario.name)) continue
    const started = Date.now()
    try {
      await runWithFixture(
        {
          ...scenario.setup,
          opencode,
          plugin: scenario.setup?.delayedClipboard ? clipboardPlugin : scenario.source ? sourcePlugin : plugin,
          directory: path.join(temporary, scenario.name),
          artifacts: path.join(artifacts, scenario.name),
        },
        scenario.run,
      )
      results.push({ name: scenario.name, status: "passed", milliseconds: Date.now() - started })
      console.log(`PASS: ${scenario.name}`)
    } catch (error) {
      results.push({ name: scenario.name, status: "failed", milliseconds: Date.now() - started, error: String(error) })
      console.error(`FAIL: ${scenario.name}`, error)
      process.exitCode = 1
    }
  }
} catch (error) {
  setupFailure = String(error)
  console.error("FAIL: setup", error)
  process.exitCode = 1
} finally {
  await Bun.write(
    path.join(artifacts, "result.json"),
    JSON.stringify(
      {
        opencode: version,
        bun: Bun.version,
        tmux: execFileSync("tmux", ["-V"], { encoding: "utf8" }).trim(),
        scenarios: results,
        setupFailure,
      },
      null,
      2,
    ),
  )
  await rm(temporary, { recursive: true, force: true })
}
