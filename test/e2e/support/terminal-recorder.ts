import assert from "node:assert/strict"
import path from "node:path"
import type { Fixture } from "./fixture"

/** A real PTY child records bytes; no host input or terminal behavior is mocked. */
export async function createTerminalRecorder(fixture: Fixture) {
  const { request, workspace, sessionID, terminal, probe } = fixture
  const script = path.join(workspace, "record.ts")
  const file = path.join(workspace, "received.hex")
  await Bun.write(
    script,
    `
import { appendFileSync, writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(file)}, "");
process.stdin.setRawMode(true);
process.stdout.write("RECORDER READY\\r\\n");
process.stdin.on("data", (data) => {
  appendFileSync(${JSON.stringify(file)}, data.toString("hex") + "\\n");
  process.stdout.write("BYTES " + data.toString("hex") + "\\r\\n");
});
`,
  )
  const pty = (
    await request(`/api/experimental/session/${sessionID}/terminal`, {
      command: process.execPath,
      args: [script],
      cwd: workspace,
      title: "Vim terminal recorder",
      env: {},
    })
  ).data
  await probe("dispatch", { command: "terminal.toggle" })
  await terminal.screen(
    "terminal-ready",
    async (text) =>
      text.includes("RECORDER READY") && (await probe()).terminals.some((item: { focused: boolean }) => item.focused),
  )

  async function bytes() {
    return (await Bun.file(file).text()).replaceAll("\n", "")
  }
  async function input(label: string, send: () => Promise<void>, expected: string) {
    const before = await bytes()
    await send()
    await terminal.screen(label, async () => (await bytes()).slice(before.length) === expected)
    assert.equal((await bytes()).slice(before.length), expected)
  }
  return {
    ptyID: pty.id as string,
    bytes,
    input,
    remove: () => request(`/api/experimental/persistent-pty/${pty.id}`, undefined, "DELETE"),
  }
}
