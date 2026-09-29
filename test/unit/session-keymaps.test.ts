import { expect, spyOn, test } from "bun:test"
import { createVimConfig } from "../../src/modules/vim/config"
import { createSessionKeymaps } from "../../src/session-keys"

test("session toggle accepts a single normal key or control chord, not a sequence", () => {
  for (const key of ["q", "<C-s>", "<C-c>"]) expect(createVimConfig({ sessionKey: key }).sessionKey).toBe(key)
  expect(createVimConfig({ sessionKey: "gs" }).sessionKey).toBe("s")
})

test("session bindings replace defaults without changing prompt mappings", () => {
  const config = createVimConfig({ keymaps: {
    normal: { "<Tab>": "x" },
    session: { "<Tab>": "passthrough", "<C-w>w": "switch-panel" },
  } })
  const keys = createSessionKeymaps(config, true)
  expect(config.keymaps.normal).toEqual({ "<Tab>": "x" })
  expect(keys.hint).toBe("<C-w>w")
  expect(keys.resolve("<Tab>")).toBe("passthrough")
  expect(keys.accepts("<C-w>")).toBe(true)
  expect(keys.resolve("<C-w>")).toBe("pending")
  expect(keys.resolve("w")).toBe("switch-panel")
})

test("session sequences expire and cancel without consuming later motions", () => {
  const now = spyOn(Date, "now").mockReturnValue(100)
  try {
    const config = createVimConfig({ keymapTimeout: 50, keymaps: { session: { "<C-w>w": "switch-panel" } } })
    const keys = createSessionKeymaps(config, true)
    expect(keys.resolve("<C-w>")).toBe("pending")
    now.mockReturnValue(150)
    expect(keys.resolve("w")).toBeUndefined()
    expect(keys.resolve("<C-w>")).toBe("pending")
    keys.cancel()
    expect(keys.resolve("w")).toBeUndefined()
    expect(keys.resolve("<C-w>")).toBe("pending")
    expect(keys.resolve("j")).toBeUndefined()
    expect(keys.resolve("w")).toBeUndefined()
  } finally {
    now.mockRestore()
  }
})

test("session bindings ignore invalid entries and omit unavailable panel actions", () => {
  const config = createVimConfig({ keymaps: { session: {
    "<Tab>": "passthrough", "<C-W>": "switch-panel", "": "switch-panel",
    "xy": "passthrough", z: "insert", "<C-w>w": "switch-panel",
  } } })
  const keys = createSessionKeymaps(config, true)
  expect(keys.hint).toBe("<C-w>w")
  expect(keys.accepts("x")).toBe(false)
  expect(keys.accepts("z")).toBe(false)
  const single = createSessionKeymaps(config, false)
  expect(single.hint).toBe("")
  expect(single.accepts("<C-w>")).toBe(false)
  expect(single.resolve("<Tab>")).toBe("passthrough")
  expect(createSessionKeymaps(createVimConfig({}), true).resolve("<Tab>")).toBe("switch-panel")
})
