import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { cp, mkdir } from "node:fs/promises"
import { createServer } from "node:net"
import path from "node:path"
import type { Context } from "@opencode/plugin/tui/context"
import type { VimOptions } from "../../src/modules/vim/config"
import { createTerminal, type Terminal } from "./terminal"
import { createStreamingModel } from "./model"

export type Fixture = FixtureAPI & { terminal: Terminal; sessionTitle: string; sessionID: string; stream?: ReturnType<typeof createStreamingModel> }
export type Message = ReturnType<Context["data"]["session"]["message"]["list"]>[number]
export type FixtureAPI = { request: (endpoint: string, body?: unknown) => Promise<any>; workspace: string }
export type FixtureSetup = { messages?: Message[] | ((api: FixtureAPI) => Promise<Message[]>); cli?: Record<string, unknown>; vim?: VimOptions; stream?: string }

type Options = FixtureSetup & {
    opencode: { binary: string; version: string }
    plugin: string
    directory: string
    artifacts: string
}

export async function runWithFixture(options: Options, run: (fixture: Fixture) => Promise<void>) {
    const { opencode, plugin, directory, artifacts } = options
    const workspace = path.join(directory, "workspace")
    const password = crypto.randomUUID()
    const sessionTitle = "E2E existing session"
    const terminal = createTerminal(path.join(directory, "tmux.sock"), artifacts)
    const stream = options.stream === undefined ? undefined : createStreamingModel(options.stream)
    let server: Bun.Subprocess | undefined
    let url = ""

    function stop() {
        stream?.stop()
        terminal.stop()
        if (server) {
            try {
                process.kill(-server.pid, "SIGKILL")
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
            }
        }
    }

    function interrupt() { stop(); process.exit(130) }
    function terminate() { stop(); process.exit(143) }
    process.once("SIGINT", interrupt)
    process.once("SIGTERM", terminate)

    try {
        await mkdir(artifacts, { recursive: true })
        await mkdir(workspace, { recursive: true })
        for (const home of ["server", "tui"]) {
            await mkdir(path.join(directory, home, "config"), { recursive: true })
        }
        assert.equal(execFileSync(opencode.binary, ["--version"], { env: environment("server"), encoding: "utf8" }).trim(), `opencode v${opencode.version}`)
        await Bun.write(path.join(directory, "tui/config/cli.json"), JSON.stringify({
            plugins: [{ package: plugin, options: { vim: options.vim ?? {} } }],
            tabs: { mode: "on" },
            attention: { notifications: false, sound: false },
            ...options.cli,
        }))

        const listener = createServer()
        await new Promise<void>((resolve, reject) => {
            listener.once("error", reject)
            listener.listen(0, "127.0.0.1", resolve)
        })
        const address = listener.address()
        assert(address && typeof address !== "string")
        const port = address.port
        await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()))
        url = `http://127.0.0.1:${port}`
        server = Bun.spawn([opencode.binary, "serve", "--hostname", "127.0.0.1", "--port", String(port)], {
            cwd: workspace,
            env: environment("server"),
            detached: true,
            stdout: Bun.file(path.join(artifacts, "server.stdout.log")),
            stderr: Bun.file(path.join(artifacts, "server.stderr.log")),
        })
        const deadline = Date.now() + 60_000
        while (true) {
            if (server.exitCode !== null) throw new Error(`OpenCode server exited: ${server.exitCode}`)
            try {
                await request("/api/session")
                break
            } catch (error) {
                if (Date.now() >= deadline) throw error
                await Bun.sleep(100)
            }
        }
        let session = (await request("/api/session", { title: sessionTitle, location: { directory: workspace } })).data
        if (options.messages) {
            const messages = typeof options.messages === "function"
                ? await options.messages({ request, workspace }) : options.messages
            session = (await request("/api/experimental/session/import", {
                info: { ...session, id: `ses_${crypto.randomUUID().replaceAll("-", "")}` },
                messages,
                location: { directory: workspace },
            })).data
            const imported = (await request(`/api/experimental/session/${session.id}/export`)).data
            assert.equal(imported.messages.length, messages.length)
        }
        const command = ["env", "-i"]
        for (const [key, value] of Object.entries(environment("tui"))) command.push(`${key}=${value}`)
        command.push(opencode.binary, "--server", url, "--session", session.id, workspace)
        terminal.start(command, workspace)
        const initialMode = options.vim?.defaultMode === "normal" ? "NORMAL" : "INSERT"
        await terminal.screen("startup", (text) => text.includes(sessionTitle) && text.includes(initialMode), 60_000)

        await run({ terminal, sessionTitle, sessionID: session.id, request, workspace, stream })
        assert.equal((await request(`/api/session/${session.id}`)).data.id, session.id)
    } finally {
        process.off("SIGINT", interrupt)
        process.off("SIGTERM", terminate)
        stop()
        if (server) await server.exited
        for (const home of ["server", "tui"]) {
            const log = path.join(directory, home, "data/opencode/log")
            await cp(log, path.join(artifacts, `${home}-logs`), { recursive: true }).catch((error) => {
                if (error.code !== "ENOENT") throw error
            })
        }
    }

    function environment(home: string): Record<string, string> {
        const directory = path.join(options.directory, home)
        return {
            PATH: process.env.PATH!,
            HOME: directory,
            SHELL: "/bin/sh",
            LANG: "en_US.UTF-8",
            TERM: "tmux-256color",
            COLORTERM: "truecolor",
            OPENCODE_TEST_HOME: directory,
            OPENCODE_CONFIG_DIR: path.join(directory, "config"),
            OPENCODE_CONFIG_CONTENT: JSON.stringify(stream?.config ?? {}),
            OPENCODE_DISABLE_PROJECT_CONFIG: "true",
            OPENCODE_DISABLE_FILEWATCHER: "true",
            OPENCODE_DISABLE_MODELS_FETCH: "true",
            OPENCODE_PASSWORD: password,
            XDG_CONFIG_HOME: path.join(directory, "xdg-config"),
            XDG_DATA_HOME: path.join(directory, "data"),
            XDG_CACHE_HOME: path.join(directory, "cache"),
            XDG_STATE_HOME: path.join(directory, "state"),
        }
    }

    async function request(endpoint: string, body?: unknown) {
        const response = await fetch(url + endpoint, {
            method: body === undefined ? "GET" : "POST",
            headers: { authorization: `Basic ${btoa(`opencode:${password}`)}`, "content-type": "application/json" },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(3_000),
        })
        if (!response.ok) throw new Error(`${endpoint}: ${response.status} ${await response.text()}`)
        return response.json()
    }
}
