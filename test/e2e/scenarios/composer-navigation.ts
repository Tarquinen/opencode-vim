import assert from "node:assert/strict"
import type { Fixture } from "../support/fixture"

export async function composerNavigation({ terminal, request, sessionID, workspace, probe }: Fixture) {
  const { keys, type, screen } = terminal
  const parent = (await request(`/api/session/${sessionID}`)).data
  const children: { id: string }[] = []
  for (const title of ["Composer child one", "Composer child two"]) {
    const child = (
      await request("/api/experimental/session/import", {
        info: { ...parent, id: `ses_${crypto.randomUUID().replaceAll("-", "")}`, parentID: sessionID, title },
        messages: [],
        location: { directory: workspace },
      })
    ).data
    children.push(child)
  }
  for (const label of ["one", "two"]) {
    await request("/api/shell", {
      command: `printf composer-shell-${label}; sleep 120`,
      cwd: workspace,
      metadata: { sessionID },
    })
  }

  function row(ansi: string, label: string) {
    return ansi.split("\n").find((line) => line.includes(label))
  }

  await type("composer draft")
  await screen(
    "draft-entered",
    async (text) => text.includes("composer draft") && (await probe()).editor?.text === "composer draft",
  )
  // The panel is a navigation mode even when the prompt was in insert mode.
  await keys("Down")
  await screen(
    "opened-from-insert",
    async (text) => text.includes("No active subagents") && (await probe()).mode === "composer",
  )
  await keys("C-a")
  let secondUnselected: string | undefined
  await screen("inactive-subagents", (text, ansi) => {
    secondUnselected = row(ansi, "Composer child one")
    return text.includes("Composer child two") && !!secondUnselected
  })
  await type("j")
  let secondSelected: string | undefined
  await screen("next-subagent", (_text, ansi) => {
    secondSelected = row(ansi, "Composer child one")
    return !!secondSelected && secondSelected !== secondUnselected
  })
  await type("k")
  await screen("previous-subagent", (_text, ansi) => row(ansi, "Composer child one") === secondUnselected)
  await keys("Down")
  await screen("native-down", (_text, ansi) => row(ansi, "Composer child one") === secondSelected)
  await keys("Escape")
  await screen(
    "prompt-restored",
    async (text) => text.includes("composer draft") && text.includes("INSERT") && (await probe()).mode === "base",
  )

  await keys("Escape")
  await screen("normal-prompt", (text) => text.includes("NORMAL"))
  await probe("dispatch", { command: "session.child.first" })
  await screen("opened-from-normal", (text) => text.includes("No active subagents"))
  await type("l")
  let shellTwoUnselected: string | undefined
  await screen("shell-tab", (text, ansi) => {
    shellTwoUnselected = row(ansi, "printf composer-shell-two")
    return text.includes("printf composer-shell-one") && !!shellTwoUnselected && !text.includes("No active subagents")
  })
  await type("j")
  await screen("next-shell", (_text, ansi) => row(ansi, "printf composer-shell-two") !== shellTwoUnselected)
  await type("k")
  await screen("previous-shell", (_text, ansi) => row(ansi, "printf composer-shell-two") === shellTwoUnselected)
  await type("j")
  await keys("Enter")
  await screen("shell-output", (text) => text.includes("Shell output") && text.includes("printf composer-shell-two"))
  await keys("Escape")
  await screen("shell-return", async (text) => !text.includes("Shell output") && (await probe()).mode === "composer")
  await type("l")
  let newTerminalUnselected: string | undefined
  await screen("terminals-tab", (_text, ansi) => {
    newTerminalUnselected = row(ansi, "+ New terminal")
    return !!newTerminalUnselected
  })
  await type("j")
  let newTerminalSelected: string | undefined
  await screen("next-terminal", (_text, ansi) => {
    newTerminalSelected = row(ansi, "+ New terminal")
    return !!newTerminalSelected && newTerminalSelected !== newTerminalUnselected
  })
  await type("k")
  await screen("previous-terminal", (_text, ansi) => row(ansi, "+ New terminal") === newTerminalSelected)
  await type("l")
  await screen("tabs-wrap", (text) => text.includes("No active subagents"))
  await type("h")
  await screen("previous-tab", (text) => text.includes("+ New terminal"))
  await keys("-l", "\x1b[91;5u")
  await screen(
    "control-bracket-closes",
    async (text) =>
      !text.includes("+ New terminal") &&
      text.includes("composer draft") &&
      text.includes("NORMAL") &&
      (await probe()).mode === "base",
  )

  // Moving up from the first shell keeps the native return-to-prompt behavior.
  await probe("dispatch", { command: "session.child.first" })
  await type("lkk")
  await screen(
    "up-closes",
    async (text) => !text.includes("printf composer-shell-one") && (await probe()).mode === "base",
  )
  await type("A restored")
  await screen("draft-editable", (text) => text.includes("composer draft restored") && text.includes("INSERT"))

  await probe("dispatch", { command: "opencode-vim.toggle" })
  await keys("Down")
  await screen("disabled-panel", (text) => text.includes("No active subagents"))
  await type("l")
  await screen("disabled-vim-key", (text) => text.includes("No active subagents"))
  await keys("Right")
  await screen("disabled-native-key", (text) => text.includes("printf composer-shell-one"))
  await keys("Escape")
  assert.equal((await probe()).mode, "base")

  await probe("dispatch", { command: "opencode-vim.toggle" })
  await keys("Down", "C-a")
  await screen("subagent-selection", (text) => text.includes("Composer child one"))
  await type("j")
  await keys("Enter")
  await screen("selected-subagent", async () => (await probe()).route.sessionID === children[0].id)
}
