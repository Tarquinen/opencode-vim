import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import { runWithFixture } from "./fixture"
import { installOpenCode } from "./opencode"
import { packPlugin } from "./plugin"
import { agentSwitching } from "./scenarios/agent-switching"
import { dialogFocus } from "./scenarios/dialog-focus"
import { tabSwitching } from "./scenarios/tab-switching"

const scenarios = [
    { name: "tab-switching", run: tabSwitching },
    { name: "dialog-focus", run: dialogFocus },
    { name: "agent-switching", run: agentSwitching },
]

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
        const started = Date.now()
        try {
            await runWithFixture({
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
