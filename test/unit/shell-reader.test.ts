import { expect, test } from "bun:test"
import type { Context } from "@opencode/plugin/tui/context"
import { loadShell, OUTPUT_LIMIT, shellSnapshot, type ShellSource } from "../../src/readers/shell/data"

type Tool = Extract<ShellSource, { type: "tool" }>
function tool(state: Tool["state"]): Tool {
  return { type: "tool", id: "call-1", name: "shell", time: { created: 1 }, state }
}

test("shell snapshots distinguish a backgrounded tool result from an exited command", () => {
  const source = tool({
    status: "completed",
    input: { command: "npm test", workdir: "/workspace" },
    content: [{ type: "text", text: "Command moved to the background" }],
    metadata: { status: "running", shellID: "sh_1" },
  })
  expect(shellSnapshot(source)).toMatchObject({
    status: "Backgrounded",
    shellID: "sh_1",
    command: "npm test",
    workdir: "/workspace",
  })
  source.state = { ...source.state, metadata: { exit: 7 } } as Tool["state"]
  expect(shellSnapshot(source).status).toBe("Exited · code 7")
})

test("shell snapshots retain failures, timeouts and sanitized saved output", () => {
  expect(
    shellSnapshot(
      tool({ status: "error", input: { command: "missing" }, error: { type: "tool", message: "Not found" } }),
    ),
  ).toMatchObject({ status: "Failed", output: "Not found" })
  expect(
    shellSnapshot(
      tool({
        status: "completed",
        input: { command: "slow" },
        content: [{ type: "text", text: "\u001b[31mred\u001b[0m\r\nnext" }],
        metadata: { timeout: true, truncated: true },
      }),
    ),
  ).toMatchObject({ status: "Timed out", output: "red\nnext", notice: "Saved output is truncated" })
  expect(shellSnapshot(tool({ status: "streaming", input: '{"command":' })).status).toBe("Receiving command…")
})

test("user-run shell messages have the same status and output model", () => {
  expect(
    shellSnapshot({
      type: "shell",
      id: "msg_shell",
      shellID: "sh_user",
      command: "pwd",
      status: "exited",
      exit: 0,
      output: { output: "/workspace\n", cursor: 11, size: 11, truncated: false },
      time: { created: 1 },
    }),
  ).toMatchObject({ command: "pwd", status: "Exited · code 0", output: "/workspace\n" })
})

test("shell capture reads use the selected execution ID, session location and a bounded page", async () => {
  const calls: unknown[] = []
  const context = {
    data: { session: { get: () => ({ location: { directory: "/remote/project" } }) } },
    client: {
      shell: {
        get: async (input: unknown) => {
          calls.push(input)
          return { data: { command: "real command", cwd: "/remote/project", status: "exited", exit: 2 } }
        },
        output: async (input: unknown) => {
          calls.push(input)
          return { data: { output: "captured", cursor: OUTPUT_LIMIT, size: OUTPUT_LIMIT + 1 } }
        },
      },
    },
  } as unknown as Context
  const source = tool({
    status: "completed",
    input: { command: "original" },
    content: [{ type: "text", text: "saved preview" }],
    metadata: { status: "running", shellID: "sh_selected" },
  })
  expect(await loadShell(context, "session", source, new AbortController().signal)).toMatchObject({
    command: "real command",
    status: "Exited · code 2",
    output: "captured",
    notice: "Output truncated · showing first 1 MiB",
  })
  expect(calls).toEqual([
    { id: "sh_selected", location: { directory: "/remote/project" } },
    { id: "sh_selected", location: { directory: "/remote/project" }, cursor: 0, limit: OUTPUT_LIMIT },
  ])
})

test("removed captures keep saved output and cancelled readers settle without errors", async () => {
  const context = {
    data: { session: { get: () => undefined } },
    client: {
      shell: {
        get: async () => {
          throw new Error("gone")
        },
        output: async () => {
          throw new Error("gone")
        },
      },
    },
  } as unknown as Context
  const source = tool({
    status: "completed",
    input: { command: "old command" },
    content: [{ type: "text", text: "saved output" }],
    metadata: { shellID: "sh_gone" },
  })
  expect(await loadShell(context, "session", source, new AbortController().signal)).toMatchObject({
    output: "saved output",
    notice: "Capture unavailable · showing saved result",
  })
  expect(await loadShell(context, "session", source, AbortSignal.abort())).toEqual(shellSnapshot(source))
})

test("completion notices use the execution ID and keep saved output when captures expire", async () => {
  const source: Extract<ShellSource, { type: "synthetic" }> = {
    type: "synthetic",
    id: "msg_completed",
    time: { created: 1 },
    description: "printf 'done'\nprintf 'next'",
    metadata: {
      source: "shell",
      shellID: "sh_execution",
      jobID: "job_notification",
      state: "completed",
      exit: 3,
      truncated: true,
    },
    text: '<shell id="job_notification" state="completed" command="printf \'done\'\nprintf \'next\'">\n\u001b[32msaved output\u001b[0m\n\n</shell>',
  }
  const calls: string[] = []
  const context = {
    data: { session: { get: () => undefined } },
    client: {
      shell: {
        get: async ({ id }: { id: string }) => {
          calls.push(id)
          throw new Error("expired")
        },
        output: async ({ id }: { id: string }) => {
          calls.push(id)
          throw new Error("expired")
        },
      },
    },
  } as unknown as Context
  expect(await loadShell(context, "session", source, new AbortController().signal)).toMatchObject({
    command: source.description,
    status: "Exited · code 3",
    shellID: "sh_execution",
    output: "saved output\n",
    notice: "Capture unavailable · showing saved result · Saved output is truncated",
  })
  expect(calls).toEqual(["sh_execution", "sh_execution"])
  source.metadata = { source: "shell", state: "error" }
  source.text = "Failed to start command"
  expect(shellSnapshot(source)).toMatchObject({ status: "Failed", output: source.text, shellID: undefined })
  source.metadata = { source: "shell", state: "cancelled" }
  expect(shellSnapshot(source).status).toBe("Cancelled")
})
