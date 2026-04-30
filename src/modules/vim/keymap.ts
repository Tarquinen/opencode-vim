import type { VimConfig } from "./config"
import type { VimAction, VimMode } from "./state"

export type KeymapResult =
    | { kind: "none" }
    | { kind: "pending"; sequence: string }
    | { kind: "action"; sequence: string; action: VimAction }

export function resolveKeymap(config: VimConfig, mode: VimMode, sequence: string): KeymapResult {
    const maps = config.keymaps[mode]
    const action = maps[sequence]
    const hasLonger = Object.keys(maps).some((key) => key !== sequence && key.startsWith(sequence))

    if (action && !hasLonger) return { kind: "action", sequence, action }
    if (hasLonger) return { kind: "pending", sequence }
    if (action) return { kind: "action", sequence, action }
    return { kind: "none" }
}
