import { execFileSync, spawnSync } from "node:child_process"
import assert from "node:assert/strict"
import { readFileSync, writeFileSync } from "node:fs"
import { appendFile } from "node:fs/promises"
import path from "node:path"
import { stripVTControlCharacters } from "node:util"

export type Terminal = ReturnType<typeof createTerminal>

export function createTerminal(socket: string, artifacts: string) {
  let pid: number | undefined
  const output = path.join(artifacts, "terminal.raw")

  function tmux(...args: string[]) {
    return execFileSync("tmux", ["-S", socket, ...args], { encoding: "utf8", timeout: 5_000 })
  }

  function start(command: string[], workspace: string) {
    const config = path.join(path.dirname(socket), "tmux.conf")
    // Detached tmux has no client colors. Explicit colors let it answer OSC
    // queries, rather than making OpenCode wait for theme detection to time out.
    writeFileSync(config, 'set -g window-style "fg=#ffffff,bg=#000000"\n')
    pid = Number(
      tmux(
        "-u",
        "-f",
        config,
        "new-session",
        "-d",
        "-s",
        "e2e",
        "-x",
        "120",
        "-y",
        "38",
        "-c",
        workspace,
        "-P",
        "-F",
        "#{pane_pid}",
        ...command,
      ).trim(),
    )
    tmux("set-option", "-t", "e2e", "remain-on-exit", "on")
    // Capture raw output, including clipboard escapes that capture-pane drops.
    tmux("pipe-pane", "-t", "e2e", `cat > '${output.replaceAll("'", "'\\''")}'`)
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

  function clipboard() {
    let payload: string | undefined
    // OpenTUI doubles escape bytes inside tmux passthrough sequences.
    const contents = readFileSync(output, "utf8").replaceAll("\x1b\x1b", "\x1b")
    for (const match of contents.matchAll(/\x1b\]52;[^;]*;([A-Za-z0-9+/=]*)(?:\x07|\x1b\\)/g)) {
      payload = match[1]
    }
    if (payload === undefined) return
    return Buffer.from(payload, "base64").toString("utf8")
  }

  function cursorStyle() {
    let style: number | undefined
    for (const match of readFileSync(output, "utf8").matchAll(/\x1b\[(\d+) q/g)) style = Number(match[1])
    assert(style !== undefined, "No terminal cursor style captured")
    return style
  }

  async function screen(
    label: string,
    matches: (text: string, ansi: string) => boolean | Promise<boolean>,
    timeout = 5_000,
  ) {
    const deadline = Date.now() + timeout
    while (true) {
      const ansi = tmux("capture-pane", "-p", "-e", "-t", "e2e")
      const text = stripVTControlCharacters(ansi)
      const matched = await matches(text, ansi)
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
      await Bun.sleep(50)
    }
  }

  return { start, stop, keys, type, screen, cursor, cursorStyle, click, paste, resize, clipboard }
}
