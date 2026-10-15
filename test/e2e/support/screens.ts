import type { Fixture } from "./fixture"

export function selected(text: string, value: string) {
  for (const line of text.split("\n")) {
    if (line.includes("▎") && line.includes(value)) return true
  }
  return false
}

export function reader(text: string) {
  const lines = text.split("\n")
  const footer = lines.findIndex((line) => line.includes("v select"))
  if (footer === -1) return
  const left = lines[footer].indexOf("v select")
  const close = "esc"
  for (let index = footer - 1; index >= 0; index--) {
    const right = lines[index].lastIndexOf(close)
    if (right < left) continue
    let content = ""
    for (let row = index + 1; row < footer; row++) content += lines[row].slice(left, right + close.length) + "\n"
    return { content, left, right: right + close.length, top: index, bottom: footer + 1 }
  }
}

export function readerContains(text: string, value: string) {
  return reader(text)?.content.includes(value) ?? false
}

// OpenCode saves the toggle before Vim sees it, so wait for the Vim footer to follow.
export async function toggleVim({ terminal, probe }: Fixture, label: string, enabled: boolean) {
  await probe("dispatch", { command: "opencode-vim.toggle" })
  await terminal.screen(label, (text) => /\b(INSERT|NORMAL|VISUAL|TERMINAL)\b/.test(text) === enabled)
}
