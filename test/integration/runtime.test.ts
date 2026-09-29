import { expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import path from "node:path"

test.each(["source", "npm"])("%s plugin shares the host's runtime", async (kind) => {
    const root = path.resolve(import.meta.dir, "../..")
    await mkdir("/tmp/opencode", { recursive: true })
    const directory = await mkdtemp("/tmp/opencode/vim-runtime-")
    try {
        let plugin = directory
        let entrypoint = path.join(plugin, "tui.tsx")
        if (kind === "npm") {
            // Exercise the actual published files, including prepack, from a real
            // node_modules path. A source copy outside it uses a different loader.
            await run(["npm", "pack", "--pack-destination", directory], root)
            const { name, version } = await Bun.file(path.join(root, "package.json")).json()
            plugin = path.join(directory, "node_modules", name)
            await mkdir(plugin, { recursive: true })
            await run(["tar", "-xzf", path.join(directory, `${name}-${version}.tgz`), "--strip-components=1", "-C", plugin], root)
            const manifest = await Bun.file(path.join(plugin, "package.json")).json()
            entrypoint = path.resolve(plugin, manifest.exports["./tui"])
        } else {
            for (const file of ["package.json", "tui.tsx", "view.tsx", "src"]) {
                await cp(path.join(root, file), path.join(plugin, file), { recursive: true })
            }
        }
        // A plugin can have its own Solid copy. It must still share the host's
        // signals, rendering, classes and cleanup through the runtime loader.
        const modules = path.join(plugin, "node_modules")
        await mkdir(modules)
        await cp(path.join(root, "node_modules/solid-js"), path.join(modules, "solid-js"), { recursive: true })
        await symlink(path.join(root, "node_modules/@vimee"), path.join(modules, "@vimee"))
        await symlink(path.join(root, "node_modules/diff"), path.join(modules, "diff"))

        // A fresh process installs OpenCode's runtime loader before importing the
        // plugin; it must not reuse modules preloaded by the ordinary test suite.
        await run([
            process.execPath, "test", "--conditions=browser", "--preload", "@opentui/solid/preload", "test/helpers/runtime-smoke.test.ts",
        ], root, { OPENCODE_VIM_TEST_ENTRYPOINT: entrypoint })
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
}, 30000)

async function run(command: string[], cwd: string, env: Record<string, string> = {}) {
    const child = Bun.spawn(command, {
        cwd,
        env: { ...process.env, ...env },
        stdout: "pipe",
        stderr: "pipe",
    })
    const [code, stdout, stderr] = await Promise.all([
        child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
    ])
    expect(code, stdout + stderr).toBe(0)
}
