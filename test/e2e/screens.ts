export function selected(text: string, value: string) {
    for (const line of text.split("\n")) {
        if (line.includes("▎") && line.includes(value)) return true
    }
    return false
}

export function reader(text: string) {
    const lines = text.split("\n")
    const footer = lines.findIndex((line) => line.includes("MESSAGE") && line.includes("v select"))
    if (footer === -1) return
    const left = lines[footer].indexOf("MESSAGE")
    for (let index = footer - 1; index >= 0; index--) {
        const right = lines[index].lastIndexOf("esc")
        if (right < left) continue
        let content = ""
        for (let row = index + 1; row < footer; row++) content += lines[row].slice(left, right + 3) + "\n"
        return { content, left, right: right + 3, top: index, bottom: footer + 1 }
    }
}

export function readerContains(text: string, value: string) {
    return reader(text)?.content.includes(value) ?? false
}
