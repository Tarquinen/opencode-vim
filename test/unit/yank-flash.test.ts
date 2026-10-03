import { describe, expect, test } from "bun:test"
import { yankFlashMatches } from "../e2e/support/colors"

const normal = "\x1b[38;2;238;238;238m\x1b[48;2;10;10;10m"
const flash = "\x1b[38;2;10;10;10m\x1b[48;2;86;182;194m"
const composer = "\x1b[38;2;86;130;191m\x1b[48;2;30;30;30m┃ Build"
const colors = { foreground: "#0a0a0a", background: "#56b6c2" }
const before = ["Tab", `${normal}▎ Selected`, `${normal}Other message`, composer, `${normal}SESSION`].join("\n")
const after = ["Tab", `${flash}▎ Selected`, `${normal}Other message`, composer, `${normal}Copied`].join("\n")

describe("yank flash screen matching", () => {
  test("matches selected text with otherwise unchanged colors", () => {
    expect(yankFlashMatches(before, after, colors)).toBe(true)
  })

  test("allows the composer's independent foreground animation", () => {
    expect(yankFlashMatches(before, after.replace("86;130;191", "88;141;214"), colors)).toBe(true)
  })

  test("rejects changed composer text or background", () => {
    expect(yankFlashMatches(before, after.replace("Build", "Plan"), colors)).toBe(false)
    expect(yankFlashMatches(before, after.replace("30;30;30", "40;40;40"), colors)).toBe(false)
  })

  test("rejects flash colors outside the selection", () => {
    expect(yankFlashMatches(before, after.replace(composer, `${flash}┃ Build`), colors)).toBe(false)
  })

  test("rejects changed unselected transcript colors", () => {
    expect(yankFlashMatches(before, after.replace(`${normal}Other`, `${flash}Other`), colors)).toBe(false)
  })

  test("rejects changed selected text or incorrect flash colors", () => {
    expect(yankFlashMatches(before, after.replace("Selected", "Changed"), colors)).toBe(false)
    expect(yankFlashMatches(before, after.replace("86;182;194", "80;180;190"), colors)).toBe(false)
  })
})
