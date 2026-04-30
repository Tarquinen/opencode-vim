import type { KeyEvent } from "@opentui/core"

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
}

export function keyNotation(event: KeyEvent) {
    const name = event.name?.toLowerCase()
    if (!name) return undefined

    if (event.ctrl) return `<C-${ctrlKey(name)}>`
    if (event.meta) return `<M-${name}>`
    if (name.length === 1) return event.shift ? name.toUpperCase() : name
    return NAMED_KEYS[name] ?? `<${name}>`
}

function ctrlKey(name: string) {
    if (name === "escape" || name === "esc") return "["
    if (name.length === 1) return name
    return name
}
