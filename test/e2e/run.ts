import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { runWithFixture, type Fixture, type FixtureSetup } from "./fixture"
import { installOpenCode } from "./opencode"
import { packPlugin } from "./plugin"
import { agentSwitching } from "./scenarios/agent-switching"
import { dialogFocus } from "./scenarios/dialog-focus"
import { tabSwitching } from "./scenarios/tab-switching"
import { messageReader } from "./scenarios/message-reader"
import { transcriptGrouped, transcriptLowDetail, transcriptUngrouped, transcriptRunning, transcriptHistory } from "./scenarios/transcript"
import { readerMessages, transcriptMessages, historyMessages } from "./data/transcript"
import { shellMessages } from "./data/shell"
import { shellReader } from "./scenarios/shell-reader"
import { sessionKeymaps, sessionAgentBinding } from "./scenarios/session-keymaps"
import { readMessages } from "./data/read"
import { readReader } from "./scenarios/read-reader"
import { fileChangeMessages } from "./data/file-changes"
import { fileChanges } from "./scenarios/file-changes"
import { diffReader } from "./scenarios/diff-reader"

const scenarios: Array<{ name: string; run: (fixture: Fixture) => Promise<void>; setup?: FixtureSetup }> = [
    { name: "tab-switching", run: tabSwitching },
    { name: "dialog-focus", run: dialogFocus },
    { name: "agent-switching", run: agentSwitching },
    { name: "message-reader", run: messageReader, setup: { messages: readerMessages } },
    { name: "shell-reader", run: shellReader, setup: { messages: shellMessages } },
    { name: "shell-reader-low-detail", run: shellReader, setup: { messages: shellMessages, cli: { session: { verbosity: "low" } } } },
    { name: "read-reader", run: readReader, setup: { messages: readMessages } },
    { name: "read-reader-low-detail", run: readReader, setup: { messages: readMessages, cli: { session: { verbosity: "low" } } } },
    { name: "file-changes", run: fileChanges, setup: { messages: fileChangeMessages, cli: { diffs: { view: "unified" } } } },
    { name: "file-changes-low-detail", run: fileChanges, setup: { messages: fileChangeMessages, cli: { session: { verbosity: "low" }, diffs: { view: "split" } } } },
    { name: "diff-reader", run: diffReader(), setup: { messages: fileChangeMessages } },
    { name: "diff-reader-before", run: diffReader("before", true), setup: { messages: fileChangeMessages, vim: {
        diffView: "before", keymaps: { session: { "<Tab>": "passthrough", "<C-w>w": "switch-panel" } },
    } } },
    { name: "diff-reader-low-detail", run: diffReader("diff"), setup: { messages: fileChangeMessages,
        cli: { session: { verbosity: "low" }, diffs: { view: "split" } }, vim: { diffView: "diff" } } },
    { name: "session-keymaps", run: sessionKeymaps, setup: {
        messages: shellMessages, cli: { keybinds: { "session.new": "tab" } },
        vim: { keymaps: { session: { "<Tab>": "passthrough", "<C-w>w": "switch-panel" } } },
    } },
    { name: "session-agent-binding", run: sessionAgentBinding, setup: {
        messages: shellMessages, cli: { keybinds: { "agent.cycle": "tab", "dialog.select.next": "tab" } },
        vim: { keymaps: { session: { "<Tab>": "passthrough", "<C-w>w": "switch-panel" } } },
    } },
]
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
    scenarios.push({ name: `transcript-history-${suffix}`, run: transcriptHistory, setup: { messages: historyMessages(), cli: { animations } } })
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

    for (const scenario of scenarios) {
        if (requested.length && !requested.includes(scenario.name)) continue
        const started = Date.now()
        try {
            await runWithFixture({
                ...scenario.setup,
                opencode,
                plugin,
                directory: path.join(temporary, scenario.name),
                artifacts: path.join(artifacts, scenario.name),
            }, scenario.run)
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
    await Bun.write(path.join(artifacts, "result.json"), JSON.stringify({
        opencode: version,
        bun: Bun.version,
        tmux: execFileSync("tmux", ["-V"], { encoding: "utf8" }).trim(),
        scenarios: results,
        setupFailure,
    }, null, 2))
    await rm(temporary, { recursive: true, force: true })
}
