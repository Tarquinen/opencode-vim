import type { KeyEvent } from "@opentui/core"

const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" })

const NAMED_KEYS: Record<string, string> = {
  escape: "<Esc>",
  esc: "<Esc>",
  return: "<CR>",
  enter: "<CR>",
  tab: "<Tab>",
  backspace: "<BS>",
  delete: "<Del>",
  space: "<Space>",
  up: "<Up>",
  down: "<Down>",
  left: "<Left>",
  right: "<Right>",
  home: "<Home>",
  end: "<End>",
  pageup: "<PageUp>",
  pagedown: "<PageDown>",
}

export function keyNotation(event: KeyEvent) {
  const name = event.name?.toLowerCase()
  if (!name) return undefined

  if (event.ctrl) return `<C-${ctrlKey(name)}>`
  if (event.meta) return `<M-${name}>`
  if ([...graphemes.segment(name)].length === 1) return event.shift ? name.toUpperCase() : name
  return NAMED_KEYS[name] ?? `<${name}>`
}

function ctrlKey(name: string) {
  if (name === "escape" || name === "esc") return "["
  return name
}

export function keyForVimee(event: KeyEvent, key: string) {
  if (key === "<C-[>") return "Escape"
  if (event.ctrl) return event.name?.toLowerCase()
  const token = keyToken(key)
  return token.startsWith("<") ? undefined : token
}

export function keyToken(token: string) {
  if (token === "<Esc>" || token === "<C-[>") return "Escape"
  if (token === "<CR>") return "Enter"
  if (token === "<Tab>") return "Tab"
  if (token === "<BS>") return "Backspace"
  if (token === "<Del>") return "Delete"
  if (token === "<Space>") return " "
  if (token === "<Up>") return "ArrowUp"
  if (token === "<Down>") return "ArrowDown"
  if (token === "<Left>") return "ArrowLeft"
  if (token === "<Right>") return "ArrowRight"
  if (token === "<Home>") return "Home"
  if (token === "<End>") return "End"
  if (token.startsWith("<C-") && token.endsWith(">")) return token.slice(3, -1).toLowerCase()
  return token
}

export function tokenCtrl(token: string) {
  return token.startsWith("<C-") && token !== "<C-[>"
}
