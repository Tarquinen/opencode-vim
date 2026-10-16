import { expect, test } from "bun:test"
import { subagentSnapshot, type SubagentSource } from "../../src/readers/subagent/data"

type Tool = Extract<SubagentSource, { type: "tool" }>
function tool(state: Tool["state"]): Tool {
  return { type: "tool", id: "call", name: "subagent", time: { created: 10 }, state }
}

function completion(time: number, response: string): Extract<SubagentSource, { type: "synthetic" }> {
  return {
    type: "synthetic",
    id: `msg_${time}`,
    time: { created: time },
    description: "Check tools",
    metadata: { source: "subagent", childID: "ses_child", state: "completed", agent: "general" },
    text: `<subagent sessionID="ses_child" state="completed" description="Check tools">\n${response}\n</subagent>`,
  }
}

test("subagent responses remove only the transport wrapper and preserve Markdown and whitespace", () => {
  const response = "# Findings\n\n  indented  \n<subagent>quoted example</subagent>\n"
  expect(
    subagentSnapshot(
      tool({
        status: "completed",
        input: { description: "Check tools" },
        metadata: { sessionID: "ses_child", status: "completed" },
        content: [
          { type: "text", text: `<subagent sessionID="ses_child" state="completed">\n${response}\n</subagent>` },
        ],
      }),
    ),
  ).toEqual({ description: "Check tools", status: "Completed", response })
  expect(subagentSnapshot(completion(11, response)).response).toBe(response)
})

test("plain results and multiple text parts stay readable", () => {
  expect(
    subagentSnapshot(
      tool({
        status: "completed",
        input: {},
        content: [
          { type: "text", text: "First finding" },
          { type: "text", text: "Second finding" },
        ],
      }),
    ).response,
  ).toBe("First finding\n\nSecond finding")
})

test("unfinished, empty and failed calls explain why there is no response", () => {
  expect(subagentSnapshot(tool({ status: "streaming", input: '{"agent":' }))).toMatchObject({
    status: "Delegating…",
    response: "No response yet.",
  })
  expect(subagentSnapshot(tool({ status: "running", input: {}, metadata: {} }))).toMatchObject({
    status: "Running",
    response: "No response yet.",
  })
  expect(
    subagentSnapshot(tool({ status: "completed", input: {}, content: [{ type: "text", text: "" }] })).response,
  ).toContain("without a text response")
  expect(
    subagentSnapshot(tool({ status: "error", input: {}, error: { type: "tool", message: "Agent unavailable" } })),
  ).toMatchObject({
    status: "Failed",
    response: "Agent unavailable",
  })
  const notice = completion(11, "Saved error")
  notice.metadata!.state = "error"
  notice.text = "Saved error"
  expect(subagentSnapshot(notice)).toMatchObject({ status: "Failed", response: "Saved error" })
  notice.metadata!.state = "cancelled"
  expect(subagentSnapshot(notice).status).toBe("Cancelled")
})

test("background calls use their saved completion rather than an earlier or later response", () => {
  const source = tool({
    status: "completed",
    input: { description: "Check tools", background: true },
    metadata: { sessionID: "ses_child", status: "running" },
    content: [{ type: "text", text: "The subagent is working in the background" }],
  })
  const other = completion(11, "Unrelated response")
  other.metadata!.childID = "ses_other"
  const messages = [
    completion(2, "Earlier response"),
    other,
    completion(12, "Selected response"),
    completion(20, "Later response"),
  ]
  expect(subagentSnapshot(source, messages)).toMatchObject({ status: "Completed", response: "Selected response" })
  expect(subagentSnapshot(source, messages.slice(0, 2))).toMatchObject({ status: "Backgrounded" })
  expect(subagentSnapshot(source, messages.slice(0, 2)).response).toContain("No saved response yet")
  const continuation = tool({
    status: "running",
    input: { sessionID: "ses_child", description: "Check tools" },
    metadata: { sessionID: "ses_child" },
  })
  continuation.time.created = 15
  expect(
    subagentSnapshot(source, [
      {
        type: "assistant",
        id: "msg_continuation",
        agent: "build",
        model: { providerID: "test", id: "fixture" },
        time: { created: 15 },
        content: [continuation],
      },
      completion(20, "Later response"),
    ]),
  ).toMatchObject({ status: "Backgrounded", response: "No saved response for this subagent call." })
})
