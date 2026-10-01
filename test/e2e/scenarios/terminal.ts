import assert from "node:assert/strict"
import path from "node:path"
import type { Fixture } from "../support/fixture"
import { createTerminalRecorder } from "../support/terminal-recorder"

export async function terminalMappings(fixture: Fixture) {
  const { terminal, probe, request, sessionID } = fixture
  const { type, keys, screen } = terminal
  const toggle = () => keys("-l", "\x1b[116;3u")
  const left = () => keys("-l", "\x1b[97;3u")
  const right = () => keys("-l", "\x1b[100;3u")
  await type("mapped terminal draft")
  await screen("mapped-draft", async () => (await probe()).editor?.text === "mapped terminal draft")
  await keys("Escape")
  await screen("mapped-normal", (text) => text.includes("NORMAL"))

  async function focused(label: string) {
    await screen(
      label,
      async (text) =>
        text.includes("TERMINAL · Alt+a/d swap · Alt+t hide") &&
        (await probe()).terminals.some((item: { focused: boolean }) => item.focused),
    )
  }
  try {
    // A regular editor command mapping invokes the same named toggle command.
    await type("Q")
    await focused("mapped-editor-command-creates-terminal")
    const initial = (await request(`/api/experimental/session/${sessionID}/terminal`)).data[0]
    await toggle()
    await screen("mapped-toggle-hides", async () => !!(await probe()).editor && (await probe()).terminals.length === 0)
    const hidden = (await request(`/api/experimental/session/${sessionID}/terminal`)).data[0]
    assert.equal(hidden.id, initial.id)
    assert.equal(hidden.pid, initial.pid)
    await request(`/api/experimental/persistent-pty/${initial.id}`, undefined, "DELETE")

    const recorder = await createTerminalRecorder(fixture)
    await focused("mapped-recorder-footer")
    await recorder.input("mapped-old-slash-is-native", () => keys("-l", "\x1b[47;5u"), "1f")
    await recorder.input("mapped-old-underscore-is-native", () => keys("-l", "\x1b[95;5u"), "1f")
    await recorder.input("mapped-old-left-is-native", () => keys("-l", "\x1b[104;3u"), "1b68")
    await recorder.input("mapped-old-right-is-native", () => keys("-l", "\x1b[108;3u"), "1b6c")
    await recorder.input("mapped-unavailable-command-is-native", () => keys("-l", "\x1b[122;3u"), "1b7a")
    const before = await recorder.bytes()
    await left()
    await screen(
      "mapped-left-keeps-pane",
      async () => !!(await probe()).editor && (await probe()).terminals.length === 1 && terminal.cursorStyle() === 1,
    )
    await type("i")
    await screen("mapped-prompt-insert", (text) => text.includes("INSERT") && terminal.cursorStyle() === 5)
    await right()
    await focused("mapped-right-from-insert")
    await keys("-l", "\x1ba")
    await screen(
      "mapped-left-legacy-keeps-insert",
      async (text) => text.includes("INSERT") && !!(await probe()).editor && terminal.cursorStyle() === 5,
    )
    await keys("Escape")
    await screen("mapped-back-normal", (text) => text.includes("NORMAL"))
    await type("Q")
    await focused("mapped-editor-command-focuses-pane")
    await keys("C-g")
    await screen("mapped-native-command-opens-picker", async () => (await probe()).mode === "composer")
    await keys("Escape")
    await screen("mapped-picker-returns-prompt", async () => !!(await probe()).editor)
    await right()
    await focused("mapped-right-after-picker")
    await toggle()
    await screen(
      "mapped-hidden-no-hint",
      async (text) => (await probe()).terminals.length === 0 && !text.includes("Alt+t"),
    )
    await keys("-l", "\x1bt")
    await focused("mapped-toggle-legacy-reopens")
    assert.equal(await recorder.bytes(), before, "Mapped command keys must not reach the child")
    await probe("dispatch", { command: "opencode-vim.toggle" })
    await recorder.input(
      "mapped-disabled-keys-are-native",
      () => keys("-l", "\x1b[97;3u\x1b[100;3u\x1b[116;3u"),
      "1b611b641b74",
    )
  } finally {
    for (const pty of (await request(`/api/experimental/session/${sessionID}/terminal`)).data)
      await request(`/api/experimental/persistent-pty/${pty.id}`, undefined, "DELETE")
  }
}

export async function terminalBindingsDisabled(fixture: Fixture) {
  const { terminal, probe } = fixture
  await terminal.keys("Escape")
  const recorder = await createTerminalRecorder(fixture)
  try {
    await terminal.screen(
      "bindings-disabled-footer",
      (text) => text.includes("TERMINAL") && !text.includes("swap") && !text.includes("hide"),
    )
    await recorder.input(
      "bindings-disabled-keys-are-native",
      () => terminal.keys("-l", "\x1b[47;5u\x1b[95;5u\x1b[104;3u\x1b[108;3u"),
      "1f1f1b681b6c",
    )
    await terminal.keys("C-x", "Left")
    await terminal.screen("bindings-disabled-native-left", async () => !!(await probe()).editor)
    await terminal.type("Q")
    await terminal.screen("bindings-disabled-editor-command", async () =>
      (await probe()).terminals.some((item: { focused: boolean }) => item.focused),
    )
  } finally {
    await recorder.remove()
  }
}

export async function terminalBindingOverride({ terminal, probe, request, sessionID }: Fixture) {
  await terminal.keys("Escape")
  await terminal.screen("binding-override-normal", (text) => text.includes("NORMAL"))
  await terminal.keys("-l", "\x1b[47;5u")
  await terminal.screen("binding-override-composer", async () => (await probe()).mode === "composer")
  assert.equal((await request(`/api/experimental/session/${sessionID}/terminal`)).data.length, 0)
}

export async function terminalToggle(fixture: Fixture) {
  const { terminal, probe, request, sessionID } = fixture
  const { type, keys, screen } = terminal
  const shortcut = () => keys("-l", "\x1b[47;5u")
  await type("terminal toggle draft")
  await screen("toggle-draft", async () => (await probe()).editor?.text === "terminal toggle draft")
  await keys("Escape")
  await screen("toggle-normal-no-hint", (text) => text.includes("NORMAL") && !text.includes("Ctrl+/"))
  await keys("-l", "\x1b[108;3u")
  await screen(
    "pane-right-does-not-open-terminal",
    async () => (await probe()).terminals.length === 0 && (await probe()).editor?.text === "terminal toggle draft",
  )

  async function visible(label: string) {
    await screen(label, async (text) => {
      const lines = text.split("\n")
      const promptRow = lines.findIndex((line) => line.includes("terminal toggle draft"))
      const footerRow = lines.findIndex((line) => line.includes("TERMINAL · Alt+h/l swap · Ctrl+/ hide"))
      return (
        promptRow >= 0 &&
        footerRow > promptRow &&
        lines.filter((line) => line.includes("TERMINAL")).length === 1 &&
        (await probe()).terminals.some((item: { focused: boolean }) => item.focused)
      )
    })
  }
  async function hidden(label: string) {
    await screen(label, async (text) => {
      const state = await probe()
      return (
        text.includes("NORMAL") &&
        !text.includes("Ctrl+/") &&
        state.terminals.length === 0 &&
        state.editor?.text === "terminal toggle draft" &&
        terminal.cursorStyle() === 1
      )
    })
  }
  try {
    await shortcut()
    await visible("toggle-creates-terminal")
    const initial = (await request(`/api/experimental/session/${sessionID}/terminal`)).data
    assert.equal(initial.length, 1)
    await keys("-l", "\x1f")
    await hidden("toggle-legacy-hides-terminal")
    const hiddenTerminal = (await request(`/api/experimental/session/${sessionID}/terminal`)).data
    assert.equal(hiddenTerminal.length, 1)
    assert.equal(hiddenTerminal[0].id, initial[0].id)
    assert.equal(hiddenTerminal[0].pid, initial[0].pid)
    await keys("-l", "\x1b[95;5u")
    await visible("toggle-underscore-reopens-terminal")
    await keys("-l", "\x1b[104;3u")
    await screen("pane-left-keeps-terminal-visible", async (text) => {
      const state = await probe()
      return (
        !!state.editor &&
        state.terminals.length === 1 &&
        !state.terminals[0].focused &&
        !text.includes("Ctrl+/") &&
        terminal.cursorStyle() === 1
      )
    })
    await keys("-l", "\x1bl")
    await visible("pane-right-legacy-focus")
    await keys("C-x", "Left")
    await screen("toggle-prompt-focus", async () => !!(await probe()).editor && terminal.cursorStyle() === 1)
    await shortcut()
    await visible("toggle-focuses-visible-terminal")
    assert.equal((await request(`/api/experimental/session/${sessionID}/terminal`)).data[0].id, initial[0].id)
    await shortcut()
    await hidden("toggle-slash-hides-terminal")
    await request(`/api/experimental/persistent-pty/${initial[0].id}`, undefined, "DELETE")

    const recorder = await createTerminalRecorder(fixture)
    const before = await recorder.bytes()
    await keys("-l", "\x1b[104;3u")
    await screen(
      "pane-left-recorder",
      async () => (await probe()).terminals.length === 1 && (await probe()).editor?.text === "terminal toggle draft",
    )
    await type("i")
    await screen("pane-prompt-insert", (text) => text.includes("INSERT") && terminal.cursorStyle() === 5)
    await keys("-l", "\x1b[108;3u")
    await visible("pane-right-from-insert")
    await keys("-l", "\x1bh")
    await screen(
      "pane-left-legacy-insert",
      async (text) => text.includes("INSERT") && !!(await probe()).editor && terminal.cursorStyle() === 5,
    )
    for (let swap = 0; swap < 2; swap++) {
      await keys("-l", "\x1b[108;3u")
      await visible(`pane-right-insert-repeat-${swap}`)
      await keys("-l", "\x1b[104;3u")
      await screen(
        `pane-left-insert-repeat-${swap}`,
        async (text) => text.includes("INSERT") && !!(await probe()).editor && terminal.cursorStyle() === 5,
      )
    }
    await keys("Escape")
    await screen("pane-prompt-normal", (text) => text.includes("NORMAL") && terminal.cursorStyle() === 1)
    await keys("-l", "\x1b[108;3u")
    await visible("pane-right-recorder")
    assert.equal(await recorder.bytes(), before, "Pane focus keys must not reach the child")
    await recorder.input("pane-controls-preserve-shell-controls", () => keys("C-h", "C-l"), "7f0c")
    const beforeToggle = await recorder.bytes()
    await shortcut()
    await hidden("toggle-recorder-hidden")
    await keys("-l", "\x1f")
    await visible("toggle-recorder-resumed")
    assert.equal(await recorder.bytes(), beforeToggle, "Toggle keys must not reach the child")
    await shortcut()
    await hidden("toggle-before-transcript")
    await type("s")
    await screen("toggle-transcript-mode", async () => (await probe()).mode === "opencode-vim.session")
    await shortcut()
    await visible("toggle-from-transcript")
    assert.equal((await probe()).mode, "base")
    await probe("dispatch", { command: "opencode-vim.toggle" })
    await recorder.input("toggle-disabled-is-native", shortcut, "1f")
    await recorder.input("pane-disabled-is-native", () => keys("-l", "\x1b[104;3u\x1b[108;3u"), "1b681b6c")
  } finally {
    for (const pty of (await request(`/api/experimental/session/${sessionID}/terminal`)).data)
      await request(`/api/experimental/persistent-pty/${pty.id}`, undefined, "DELETE")
  }
}

export async function terminalFocus(fixture: Fixture) {
  const { terminal, probe, request, sessionID, workspace, setVimLoaded } = fixture
  const { type, keys, screen } = terminal
  await keys("Escape")
  const recorder = await createTerminalRecorder(fixture)
  let removed = false
  try {
    await keys("-l", "\x1b[104;3u")
    await type("s")
    await screen("terminal-session-browsing", async () => (await probe()).mode === "opencode-vim.session")
    await keys("-l", "\x1b[108;3u")
    await screen(
      "terminal-session-focus-isolated",
      async (text) => text.includes("TERMINAL · Alt+h/l swap · Ctrl+/ hide") && (await probe()).mode === "base",
    )
    const literal = "hjklwbe0$ggGvVyy/needlekjs"
    await recorder.input("terminal-literal-vim", () => type(literal), Buffer.from(literal).toString("hex"))
    await recorder.input("terminal-controls-after-session", () => keys("C-f", "Escape"), "061b")
    await recorder.input("terminal-backslash-is-native", () => keys("-l", "\x1c"), "1c")
    await recorder.input("terminal-no-history-chord", () => keys("-l", "\x1b[92;5u\x1b[110;5u"), "1c0e")
    await recorder.input(
      "terminal-unicode-paste",
      () => terminal.paste("café 雪"),
      Buffer.from("café 雪").toString("hex"),
    )
    await keys("C-x", "Down")
    await screen("terminal-picker-focus", async () => (await probe()).mode === "composer")
    await type("h")
    await keys("Escape")
    await screen("terminal-picker-returns-prompt", async () => !!(await probe()).editor)
    await keys("C-x", "Right")
    await probe("dispatch", { command: "opencode-vim.toggle" })
    await recorder.input("terminal-disabled-toggle-is-native", () => keys("-l", "\x1b[47;5u"), "1f")
    await probe("dispatch", { command: "opencode-vim.toggle" })

    const other = (
      await request("/api/session", {
        title: "Other terminal session",
        location: { directory: workspace },
      })
    ).data
    await probe("route", { type: "session", sessionID: other.id })
    await screen(
      "terminal-route-focus",
      async () => (await probe()).mode === "base" && (await probe()).terminals.length === 0,
    )
    await probe("route", { type: "session", sessionID })
    await keys("C-x", "Right")
    await recorder.input("terminal-route-restores-input", () => type("z"), "7a")
    await recorder.remove()
    removed = true
    await screen(
      "terminal-removal-restores-prompt",
      async () => (await probe()).mode === "base" && !!(await probe()).editor,
    )

    const next = await createTerminalRecorder(fixture)
    try {
      await setVimLoaded(false)
      await screen("terminal-unload-preserves-focus", async () =>
        (await probe()).terminals.some((item: { focused: boolean }) => item.focused),
      )
      await next.input("terminal-unloaded-literal-input", () => type("hjklkj"), "686a6b6c6b6a")
      await next.input("terminal-unloaded-toggle-is-native", () => keys("-l", "\x1b[47;5u"), "1f")
      await next.input("terminal-unloaded-pane-keys-native", () => keys("-l", "\x1b[104;3u\x1b[108;3u"), "1b681b6c")
    } finally {
      await next.remove()
    }
  } finally {
    if (!removed) await recorder.remove()
  }
}

export async function terminalApplication({ terminal, probe, request, sessionID, workspace }: Fixture) {
  const { nvim } = await import("../../helpers/neovim")
  const file = path.join(workspace, "child.txt")
  await Bun.write(file, "alpha\nbeta\n")
  const pty = (
    await request(`/api/experimental/session/${sessionID}/terminal`, {
      command: nvim,
      args: ["-u", "NONE", "-i", "NONE", "-n", file],
      cwd: workspace,
      title: "Child Neovim",
      env: {},
    })
  ).data
  try {
    await terminal.keys("Escape")
    await terminal.screen("terminal-child-prompt-normal", (text) => text.includes("NORMAL"))
    await terminal.keys("-l", "\x1b[47;5u")
    await terminal.screen("terminal-child-neovim", (text) => text.includes("alpha") && text.includes("beta"))
    await terminal.type("gg0iCHILD-kj")
    await terminal.keys("Escape")
    await terminal.type(":w")
    await terminal.keys("Enter")
    await terminal.screen(
      "terminal-child-owns-vim",
      async () => (await Bun.file(file).text()) === "CHILD-kjalpha\nbeta\n",
    )
    await terminal.type("gg0iRESUMED-")
    await terminal.screen("terminal-child-insert", (text) => text.includes("RESUMED-CHILD"))
    await terminal.keys("-l", "\x1b[104;3u")
    await terminal.screen(
      "terminal-child-left-focus",
      async () => (await probe()).terminals.length === 1 && !!(await probe()).editor,
    )
    await terminal.keys("-l", "\x1bl")
    await terminal.screen("terminal-child-right-focus", async () =>
      (await probe()).terminals.some((item: { focused: boolean }) => item.focused),
    )
    await terminal.type("FOCUS-")
    await terminal.screen("terminal-child-focus-keeps-mode", (text) => text.includes("RESUMED-FOCUS-CHILD"))
    await terminal.keys("-l", "\x1b[47;5u")
    await terminal.screen("terminal-child-hidden", async () => (await probe()).terminals.length === 0)
    await terminal.keys("-l", "\x1f")
    await terminal.screen(
      "terminal-child-resume",
      async (text) =>
        text.includes("TERMINAL · Alt+h/l swap · Ctrl+/ hide") &&
        (await probe()).terminals.some((item: { focused: boolean }) => item.focused),
    )
    await terminal.type("AFTER-")
    await terminal.keys("Escape")
    await terminal.type(":w")
    await terminal.keys("Enter")
    await terminal.screen(
      "terminal-child-mode-preserved",
      async () => (await Bun.file(file).text()) === "RESUMED-FOCUS-AFTER-CHILD-kjalpha\nbeta\n",
    )
  } finally {
    await request(`/api/experimental/persistent-pty/${pty.id}`, undefined, "DELETE")
  }
}
