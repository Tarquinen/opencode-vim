import { expect, test } from "bun:test"
import { toolItem, useReaderFixture } from "../../helpers/reader"

const mount = useReaderFixture()

test("subagent reader focuses and copies the full response instead of the history label", async () => {
  const response = "No. There is no question tool in my available tool list.\n\nAvailable tools: read, grep, shell."
  const message = toolItem("subagent", "General Subagent — Check question tool access", {
    status: "completed",
    input: { agent: "general", description: "Check question tool access", prompt: "Do you have a question tool?" },
    metadata: { sessionID: "ses_child", status: "completed" },
    content: [{ type: "text", text: `<subagent sessionID="ses_child" state="completed">\n${response}\n</subagent>` }],
  })
  const f = await mount(message)
  expect(f.reader().plainText).toBe(response)
  expect(f.renderer.currentFocusedEditor).toBe(f.reader())
  expect(f.captureCharFrame()).toContain("Subagent response")
  expect(f.captureCharFrame()).toContain("Check question tool access")
  expect(f.captureCharFrame()).toContain("Completed")
  await f.keys("ggVGy")
  expect(f.copied.at(-1)).toBe(response + "\n")
  await f.keys("x")
  expect(f.reader().plainText).toBe(response)
})
