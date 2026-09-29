import { execFileSync, spawnSync } from "node:child_process"
import { appendFile } from "node:fs/promises"
import path from "node:path"
import { stripVTControlCharacters } from "node:util"

export type Terminal = ReturnType<typeof createTerminal>

export function createTerminal(socket: string, artifacts: string) {
    let pid: number | undefined

    function tmux(...args: string[]) {
        return execFileSync("tmux", ["-S", socket, ...args], { encoding: "utf8", timeout: 5_000 })
    }

    function start(command: string[], workspace: string) {
        pid = Number(tmux("-u", "-f", "/dev/null", "new-session", "-d", "-s", "e2e", "-x", "120", "-y", "38", "-c", workspace,
            "-P", "-F", "#{pane_pid}", ...command).trim())
        tmux("set-option", "-t", "e2e", "remain-on-exit", "on")
    }

    function stop() {
        if (pid) {
            try {
                process.kill(-pid, "SIGKILL")
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
            }
        }
        spawnSync("tmux", ["-S", socket, "kill-server"], { timeout: 5_000, stdio: "ignore" })
    }

    async function keys(...keys: string[]) {
        await appendFile(path.join(artifacts, "keys.log"), `${Date.now()} ${keys.join(" ")}\n`)
        // CSI-u makes Escape unambiguous when another key immediately follows.
        // A bare ESC byte plus "s", for example, is decoded as Alt+s.
        if (keys[0] !== "-l") {
            for (let i = 0; i < keys.length; i++) {
                if (keys[i] === "Escape") keys[i] = "\x1b[27u"
            }
        }
        tmux("send-keys", "-t", "e2e", ...keys)
    }

    async function type(text: string) {
        await keys("-l", text)
    }

    function cursor() {
        const [x, y] = tmux("display-message", "-p", "-t", "e2e", "#{cursor_x} #{cursor_y}").trim().split(" ")
        return { x: Number(x), y: Number(y) }
    }

    async function click(x: number, y: number) {
        await keys("-l", `\x1b[<0;${x + 1};${y + 1}M\x1b[<0;${x + 1};${y + 1}m`)
    }

    async function paste(text: string) {
        await keys("-l", `\x1b[200~${text}\x1b[201~`)
    }

    function resize(width: number, height: number) {
        tmux("resize-window", "-t", "e2e", "-x", String(width), "-y", String(height))
    }

    async function screen(label: string, matches: (text: string, ansi: string) => boolean, timeout = 5_000) {
        const deadline = Date.now() + timeout
        while (true) {
            const ansi = tmux("capture-pane", "-p", "-e", "-t", "e2e")
            const text = stripVTControlCharacters(ansi)
            const matched = matches(text, ansi)
            if (matched || Date.now() >= deadline) {
                await Bun.write(path.join(artifacts, `${label}.txt`), text)
                await Bun.write(path.join(artifacts, `${label}.ansi`), ansi)
                if (!matched) throw new Error(`Timed out waiting for ${label}; see ${artifacts}/${label}.txt`)
                return
            }
            if (tmux("display-message", "-p", "-t", "e2e", "#{pane_dead}").trim() === "1") {
                await Bun.write(path.join(artifacts, `${label}.txt`), text)
                await Bun.write(path.join(artifacts, `${label}.ansi`), ansi)
                throw new Error(`OpenCode exited while waiting for ${label}`)
            }
            await Bun.sleep(100)
        }
    }

    return { start, stop, keys, type, screen, cursor, click, paste, resize }
}
