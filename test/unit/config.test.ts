import { expect, test } from "bun:test"
import { createVimConfig } from "../../src/vim/config"

test("modeIndicator defaults to full and ignores invalid values", () => {
  expect(createVimConfig({}).modeIndicator).toBe("full")
  expect(createVimConfig({ vim: { modeIndicator: "none" } }).modeIndicator).toBe("none")
  expect(createVimConfig({ modeIndicator: "full" }).modeIndicator).toBe("full")
  expect(createVimConfig({ modeIndicator: "invalid" }).modeIndicator).toBe("full")
})
