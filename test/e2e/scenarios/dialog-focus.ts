import assert from "node:assert/strict"
import type { Fixture } from "../support/fixture"

export async function dialogMappings({ terminal, probe }: Fixture, mapping = "j") {
  const { keys, type, screen } = terminal
  await type("prompt stays here")
  await keys("Escape", "C-p")
  await screen("mapped-dialog", (text) => text.includes("Commands") && text.includes("NORMAL"))
  await type("ijOpen settings")
  if (mapping === "jj") {
    await type("kj")
    await screen(
      "insert-mapping-normal",
      async (text) => text.includes("NORMAL") && (await probe()).editor.text === "jOpen settings",
    )
  } else {
    await keys("Escape")
  }
  // A multi-key prefix must reach Vim instead of navigating the host's list.
  await type("0" + mapping)
  // Inspect the input so a matching command-list label cannot satisfy the check.
  await screen(
    "mapped-query-edit",
    async (text) => (await probe()).editor.text === "Open settings" && text.includes("NORMAL"),
  )
  await type("u")
  await screen("query-undo-events", async () => (await probe()).editor.text === "jOpen settings")
  await keys("C-r")
  await screen("query-redo-events", async () => (await probe()).editor.text === "Open settings")
  await keys("Escape")
  await screen(
    "mapped-dialog-dismissed",
    (text) => !text.includes("Commands") && text.includes("prompt stays here") && text.includes("NORMAL"),
  )
}

export async function dialogScope({ terminal, probe }: Fixture) {
  const { keys, type, screen } = terminal
  await type("prompt draft")
  await keys("Escape")
  // tmux queues keys; wait for Escape before opening a dialog over HTTP.
  await screen("prompt-normal", (text) => text.includes("prompt draft") && text.includes("NORMAL"))
  // Use OpenCode's actual select dialog with multiple known choices. Submit
  // after a pending Vim motion so accidental host navigation is observable.
  for (const motion of ["fj", "fk", "dj", "dk"]) {
    await probe("select")
    await screen(`${motion}-opened`, (text) => text.includes("E2E choices") && text.includes("NORMAL"))
    // Start away from the boundary so either next or previous is detectable.
    await keys("Down")
    await type(motion)
    await keys("Enter")
    await screen(`${motion}-submitted`, async () => (await probe()).result === "2")
  }
  for (const [key, expected] of [
    ["Down", "2"],
    ["End", "40"],
    ["Home", "1"],
    ["Up", "1"],
    ["Tab", "2"],
    ["BTab", "1"],
  ]) {
    await probe("select")
    await screen(`${key}-opened`, (text) => text.includes("E2E choices"))
    if (key === "Home" || key === "Up" || key === "BTab") await keys("Down")
    await keys(key, "Enter")
    await screen(`${key}-submitted`, async () => (await probe()).result === expected)
  }
  await probe("select")
  await screen("page-opened", (text) => text.includes("E2E choices") && text.includes("Choice 01"))
  await keys("NPage")
  await screen("page-down", (text) => !text.includes("Choice 01") && text.includes("E2E choices"))
  await keys("PPage", "Enter")
  await screen("page-up", async () => (await probe()).result === "1")

  await probe("select")
  await screen("arrows-opened", (text) => text.includes("E2E choices"))
  await type("iChoice")
  await keys("Escape")
  const cursor = (await probe()).editor.cursor
  await keys("Left")
  await screen("left-native", async () => (await probe()).editor.cursor === cursor - 1)
  await keys("Right")
  await screen("right-native", async () => (await probe()).editor.cursor === cursor)
  await keys("Escape")
  await screen("escape-native", (text) => !text.includes("E2E choices") && text.includes("prompt draft"))

  // A real extension dialog without select/prompt commands must stay native.
  await probe("native")
  await screen(
    "native-opened",
    async (text) => text.includes("Native extension input") && (await probe()).editor?.id === "e2e-native",
  )
  await keys("End")
  await type("xj")
  await screen("native-literal-input", async () => (await probe()).editor?.text === "nativexj")
  await keys("Escape")
  await screen("native-closed", (text) => !text.includes("Native extension input"))
  assert.equal((await probe()).editor.text, "prompt draft")
}

export async function dialogModeInheritance({ terminal }: Fixture) {
  const { keys, type, screen } = terminal
  await keys("Escape")
  await type("i")
  for (const mode of ["INSERT", "NORMAL"]) {
    const label = `dialog-${mode.toLowerCase()}`
    await type("original draft")
    await screen(`${label}-draft`, (text) => text.includes("original draft"))
    if (mode === "NORMAL") await keys("Escape")
    await screen(`${label}-prompt-mode`, (text) => text.includes(mode))
    await keys("C-p")
    await screen(`${label}-opened`, (text) => text.includes("Commands") && text.includes(mode))
    if (mode === "NORMAL") {
      await type("i")
      await screen(`${label}-insert`, (text) => text.includes("Commands") && text.includes("INSERT"))
    }
    await type("Open settings")
    await screen(`${label}-filtered`, (text) => text.includes("Open settings") && !text.includes("New session"))
    await keys("Escape")
    await screen(`${label}-normal`, (text) => text.includes("Commands") && text.includes("NORMAL"))
    await keys("Escape")
    await screen(
      `${label}-closed`,
      (text) => !text.includes("Commands") && text.includes("original draft") && text.includes(mode),
    )
    if (mode === "NORMAL") {
      await type("A")
      await screen(`${label}-resume-insert`, (text) => text.includes("INSERT"))
    }
    await type(" restored")
    await screen(`${label}-restored`, (text) => text.includes("original draft restored"))
    await keys("C-c")
    await screen(`${label}-cleared`, (text) => !text.includes("original draft restored"))
  }
}

export async function dialogFocus(fixture: Fixture) {
  await dialogModeInheritance(fixture)
  const { terminal, probe } = fixture
  const { keys, type, screen } = terminal
  await keys("C-p")
  await screen("dialog-navigation-opened", (text) => text.includes("Commands") && text.includes("INSERT"))
  await keys("Escape")
  await screen(
    "dialog-navigation-start",
    (text) => text.includes("Commands") && text.includes("Switch session") && text.includes("NORMAL"),
  )
  await type("j".repeat(30))
  await screen("dialog-scrolled-down", (text) => text.includes("Commands") && !text.includes("Switch session"))
  await type("k".repeat(30))
  await screen("dialog-scrolled-up", (text) => text.includes("Commands") && text.includes("Switch session"))
  await type("iOpen settings")
  await screen("dialog-submit-filter", (text) => text.includes("Open settings") && !text.includes("Switch session"))
  await keys("Escape")
  await screen("dialog-submit-normal", (text) => text.includes("Commands") && text.includes("NORMAL"))
  // Clearing the query must update the results, not just the editor's text.
  await type("0d$")
  await screen(
    "dialog-query-cleared",
    async (text) => (await probe()).editor.text === "" && text.includes("Switch session"),
  )
  await type("u")
  await screen(
    "dialog-query-undo",
    async (text) => (await probe()).editor.text === "Open settings" && !text.includes("Switch session"),
  )
  await keys("C-r")
  await screen(
    "dialog-query-redo",
    async (text) => (await probe()).editor.text === "" && text.includes("Switch session"),
  )
  await type("u")
  await screen(
    "dialog-query-restored",
    async (text) => (await probe()).editor.text === "Open settings" && !text.includes("Switch session"),
  )
  await keys("Enter")
  await screen(
    "dialog-submitted",
    (text) => text.includes("Settings") && !text.includes("Commands") && text.includes("INSERT"),
  )
  await keys("Escape")
  await screen("dialog-settings-normal", (text) => text.includes("Settings") && text.includes("NORMAL"))
  await keys("Escape")
  await screen("dialog-submit-closed", (text) => !text.includes("Settings") && text.includes("INSERT"))
  await type("after dialog submit")
  await screen("dialog-submit-focus", (text) => text.includes("after dialog submit") && text.includes("INSERT"))

  await keys("C-c")
  await type("original draft")
  await keys("Escape")
  await type("0x")
  await screen("undo-prompt-edited", (text) => text.includes("riginal draft"))
  await keys("C-p")
  await screen("undo-dialog-opened", (text) => text.includes("Commands") && text.includes("NORMAL"))
  await type("iOpen settings")
  await keys("Escape")
  await type("0x")
  await screen("undo-dialog-edited", (text) => /^\s+pen settings\s*$/m.test(text))
  await keys("Escape")
  await screen("undo-dialog-closed", (text) => !text.includes("Commands") && text.includes("NORMAL"))
  await type("u")
  await screen("undo-prompt-restored", (text) => text.includes("original draft"))
}

export async function promptDialog({ terminal, request, sessionID }: Fixture) {
  const { keys, type, screen } = terminal
  await type("unsent draft")
  for (const mode of ["INSERT", "NORMAL"]) {
    if (mode === "NORMAL") await keys("Escape")
    await keys("C-p")
    await screen(`rename-${mode}-palette`, (text) => text.includes("Commands") && text.includes(mode))
    if (mode === "NORMAL") await type("i")
    await type("Rename session")
    await screen(`rename-${mode}-command`, (text) => text.includes("Rename session") && !text.includes("New session"))
    if (mode === "NORMAL") await keys("Escape")
    await keys("Enter")
    await screen(
      `rename-${mode}-opened`,
      (text) => text.includes("Rename") && !text.includes("Commands") && text.includes(mode),
    )
    if (mode === "INSERT") await keys("Escape")
    await type("0d$iRenamed fixture")
    await keys("Escape", "Enter")
    await screen(
      `rename-${mode}-submitted`,
      (text) =>
        text.includes("Renamed fixture") &&
        text.includes("unsent draft") &&
        text.includes(mode) &&
        !text.includes("submit"),
    )
  }
  const exported = (await request(`/api/experimental/session/${sessionID}/export`)).data
  if (exported.messages.length !== 0) throw new Error("Renaming submitted the main prompt")
}
