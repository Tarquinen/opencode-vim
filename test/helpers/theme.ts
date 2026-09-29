import { RGBA } from "@opentui/core"

export function testTheme(success = RGBA.fromHex("#00ff00")) {
    const tokens = {
        background: { base: RGBA.fromHex("#000000"), raised: { high: RGBA.fromHex("#222222") }, action: { primary: { focused: RGBA.fromHex("#006699") } } },
        text: { base: RGBA.fromHex("#ffffff"), muted: RGBA.fromHex("#888888"), action: { primary: { focused: RGBA.fromHex("#ffffff") } }, feedback: {
            success: { base: success }, warning: { base: RGBA.fromHex("#ffff00") }, info: { base: RGBA.fromHex("#00ffff") },
        } },
        syntax: { function: RGBA.fromHex("#00ffff"), string: RGBA.fromHex("#00ff00") },
        diff: { text: { added: success, removed: RGBA.fromHex("#ff0000"), hunkHeader: RGBA.fromHex("#00ffff") },
            background: { added: RGBA.fromHex("#003300"), removed: RGBA.fromHex("#330000") },
            lineNumber: { background: { added: RGBA.fromHex("#004400"), removed: RGBA.fromHex("#440000") } } },
    }
    return { ...tokens, surface: () => tokens }
}
