import { expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import path from "node:path"

test("runtime-loaded plugin shares the host's reactive state", async () => {
    const root = path.resolve(import.meta.dir, "..")
    const directory = await mkdtemp("/tmp/opencode/vim-runtime-")
    try {
        // An installed plugin can have its own Solid copy. Direct source imports
        // in the ordinary tests share the test renderer's copy and miss this case.
        for (const file of ["package.json", "tui.tsx", "view.tsx", "src"]) {
            await cp(path.join(root, file), path.join(directory, file), { recursive: true })
        }
        const modules = path.join(directory, "node_modules")
        await mkdir(modules)
        await cp(path.join(root, "node_modules/solid-js"), path.join(modules, "solid-js"), { recursive: true })
        await symlink(path.join(root, "node_modules/@vimee"), path.join(modules, "@vimee"))

        // A fresh process installs OpenCode's runtime loader before importing the
        // plugin; it must not reuse modules preloaded by the ordinary test suite.
        const child = Bun.spawn([
            process.execPath, "test", "--conditions=browser", "--preload", "@opentui/solid/preload", "test/plugin.test.tsx",
        ], {
            cwd: root,
            env: { ...process.env, OPENCODE_VIM_TEST_ENTRYPOINT: path.join(directory, "tui.tsx") },
            stdout: "pipe",
            stderr: "pipe",
        })
        const [code, stdout, stderr] = await Promise.all([
            child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
        ])
        expect(code, stdout + stderr).toBe(0)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
}, 30000)
