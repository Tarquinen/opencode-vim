import { expect, test } from "bun:test"
import { KeyEvent } from "@opentui/core"
import { createVimConfig } from "../../src/vim/config"
import { paneEventKey, paneMappingKey } from "../../src/vim/keys"
import { mappedCommand } from "../../src/vim/keymaps"
import { createPaneKeymaps, TERMINAL_TOGGLE } from "../../src/ui/pane-keys"

test("pane defaults use command mappings without changing editing mappings", () => {
  const config = createVimConfig({ keymaps: { normal: { Q: `command:${TERMINAL_TOGGLE}` } } })
  const maps = createPaneKeymaps(config, () => {})
  expect(config.keymaps.normal).toEqual({ Q: `command:${TERMINAL_TOGGLE}` })
  expect(maps.command("<C-/>")).toBe(TERMINAL_TOGGLE)
  expect(maps.command("<M-h>")).toBe("pane.focus.left")
  expect(maps.command("<M-l>")).toBe("pane.focus.right")
  expect(maps.hint).toBe("TERMINAL · Alt+h/l swap · Ctrl+/ hide")
  expect(mappedCommand("command: pane.focus.left ")).toBe("pane.focus.left")
  expect(() => mappedCommand("command: ")).toThrow("Command name is required")
})

test("pane remapping releases old keys and updates the footer", () => {
  const maps = createPaneKeymaps(
    createVimConfig({
      keymaps: {
        panes: {
          "<C-/>": "passthrough",
          "<M-h>": "passthrough",
          "<M-l>": "passthrough",
          "<M-t>": `command:${TERMINAL_TOGGLE}`,
          "<M-a>": "command:pane.focus.left",
          "<M-d>": "command:pane.focus.right",
          "<C-g>": "command:session.child.first",
        },
      },
    }),
    () => {},
  )
  for (const key of ["<C-/>", "<M-h>", "<M-l>"]) expect(maps.command(key)).toBeUndefined()
  expect(maps.command("<M-t>")).toBe(TERMINAL_TOGGLE)
  expect(maps.command("<M-a>")).toBe("pane.focus.left")
  expect(maps.command("<M-d>")).toBe("pane.focus.right")
  expect(maps.command("<C-g>")).toBe("session.child.first")
  expect(maps.hint).toBe("TERMINAL · Alt+a/d swap · Alt+t hide")
})

test("pane defaults can be reassigned or disabled, including the Ctrl+_ alias", () => {
  const maps = createPaneKeymaps(
    createVimConfig({
      keymaps: {
        panes: {
          "<C-_>": "passthrough",
          "<M-h>": "command:session.child.first",
          "<M-l>": "passthrough",
        },
      },
    }),
    () => {},
  )
  expect(maps.command("<C-/>")).toBeUndefined()
  expect(maps.command("<M-h>")).toBe("session.child.first")
  expect(maps.command("<M-l>")).toBeUndefined()
  expect(maps.hint).toBe("TERMINAL")
  const one = createPaneKeymaps(createVimConfig({ keymaps: { panes: { "<M-l>": "passthrough" } } }), () => {})
  expect(one.hint).toBe("TERMINAL · Alt+h prompt · Ctrl+/ hide")
})

test("invalid pane mappings are logged and leave defaults intact", () => {
  const logs: string[] = []
  const maps = createPaneKeymaps(
    createVimConfig({
      keymaps: {
        panes: {
          "<M-h>": "x",
          "<M-l>": "command: ",
          gg: "command:session.new",
          "<C-w>h": "command:pane.focus.left",
          "<M-H>": "command:pane.focus.left",
          "": "command:session.new",
          " ": "passthrough",
          "<bad>": "passthrough",
          "<M-z>": 42,
        },
      },
    }),
    (event) => logs.push(event),
  )
  expect(logs).toHaveLength(8)
  expect(maps.command("<M-h>")).toBe("pane.focus.left")
  expect(maps.command("<M-l>")).toBe("pane.focus.right")
  expect(maps.command("<M-z>")).toBeUndefined()
  expect(maps.hint).toBe("TERMINAL · Alt+h/l swap · Ctrl+/ hide")
})

test("pane notation supports single chords, punctuation and named keys", () => {
  for (const key of ["<M-h>", "<C-/>", "<C-[>", "<Space>", "<Left>", "H", "+", "<"])
    expect(paneMappingKey(key)).toBe(key)
  expect(paneMappingKey("<C-_>")).toBe("<C-/>")
  for (const key of ["gg", "<M-h>l", "<C-H>", "<C-alt-h>", "café", " "]) expect(() => paneMappingKey(key)).toThrow()
})

test("pane events respect modifiers and normalize legacy Ctrl+/", () => {
  expect(paneEventKey(event("h", { meta: true }))).toBe("<M-h>")
  expect(paneEventKey(event("l", { option: true }))).toBe("<M-l>")
  expect(paneEventKey(event("/", { ctrl: true }))).toBe("<C-/>")
  expect(paneEventKey(event("_", { ctrl: true, shift: true }))).toBe("<C-/>")
  expect(paneEventKey(event("h", { shift: true }))).toBe("H")
  expect(paneEventKey(event("space"))).toBe("<Space>")
  for (const options of [
    { meta: true, shift: true },
    { ctrl: true, shift: true },
    { ctrl: true, meta: true },
    { ctrl: true, option: true },
    { super: true },
    { hyper: true },
  ])
    expect(paneEventKey(event("h", options))).toBeUndefined()
  expect(paneEventKey(event("tab", { shift: true }))).toBeUndefined()
})

function event(
  name: string,
  options: { ctrl?: boolean; meta?: boolean; shift?: boolean; option?: boolean; super?: boolean; hyper?: boolean } = {},
) {
  return new KeyEvent({
    name,
    sequence: name,
    raw: name,
    ctrl: false,
    meta: false,
    shift: false,
    option: false,
    number: false,
    eventType: "press",
    source: "raw",
    ...options,
  })
}
