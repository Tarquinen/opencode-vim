import type { Fixture } from "../support/fixture"
import { readerContains, selected } from "../support/screens"

export async function subagentReader({ terminal }: Fixture) {
  const { type, keys, screen } = terminal
  await type("subagent draft")
  await keys("Escape")
  await type("s")
  await screen("completion-selected", (text) => selected(text, "General finished"))
  await keys("Enter")
  await screen(
    "completion-response",
    (text) => text.includes("Subagent response") && readerContains(text, "Background response: read, grep, shell."),
  )
  await keys("Escape")
  await screen("completion-closed", (text) => !text.includes("v select") && selected(text, "General finished"))
  await type("2k")
  let grouped = false
  await screen("background-selected", (text) => {
    grouped = selected(text, "1 tool")
    return grouped || selected(text, "General Subagent — Check background tool access")
  })
  if (grouped) {
    await keys("Enter")
    await screen("background-expanded", (text) => text.includes("General Subagent — Check background tool access"))
    await type("j")
    await screen("background-tool-selected", (text) =>
      selected(text, "General Subagent — Check background tool access"),
    )
  }
  await keys("Enter")
  await screen(
    "background-response",
    (text) =>
      readerContains(text, "Background response: read, grep, shell.") &&
      !readerContains(text, "working in the background"),
  )
  await keys("Escape")
  await screen(
    "background-closed",
    (text) => !text.includes("v select") && selected(text, "Check background tool access"),
  )
  await type("ggj")
  await screen("foreground-selected", (text) =>
    selected(text, grouped ? "1 tool" : "General Subagent — Check question tool access"),
  )
  if (grouped) {
    await keys("Enter")
    await screen("foreground-expanded", (text) => text.includes("General Subagent — Check question tool access"))
    await type("j")
    await screen("foreground-tool-selected", (text) => selected(text, "General Subagent — Check question tool access"))
  }
  await keys("Enter")
  await screen(
    "foreground-response",
    (text) =>
      readerContains(text, "No. There is no question tool in my available tool list.") &&
      readerContains(text, "Available tools: read, grep, shell.") &&
      !readerContains(text, "<subagent"),
  )
  await type("Vjy")
  await screen("response-copied", (text) => text.includes("Copied"))
  await keys("Escape", "Enter")
  await screen("foreground-reopened", (text) => readerContains(text, "Available tools: read, grep, shell."))
  await type("sA restored")
  await screen(
    "prompt-restored",
    (text) => text.includes("subagent draft restored") && text.includes("INSERT") && !text.includes("SESSION"),
  )
}
