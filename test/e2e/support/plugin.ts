import { execFileSync } from "node:child_process"
import { cp, mkdir, symlink } from "node:fs/promises"
import path from "node:path"
import { createRequire } from "node:module"

export async function packPlugin(root: string, directory: string, artifacts: string) {
    const manifest = await Bun.file(path.join(root, "package.json")).json()
    const packed = execFileSync("npm", ["pack", "--quiet", "--pack-destination", directory], {
        cwd: root,
        encoding: "utf8",
        timeout: 120_000,
    })
    await Bun.write(path.join(artifacts, "pack.log"), packed)
    const plugin = path.join(directory, "node_modules", manifest.name)
    await mkdir(plugin, { recursive: true })
    execFileSync("tar", ["-xzf", path.join(directory, `${manifest.name}-${manifest.version}.tgz`), "--strip-components=1", "-C", plugin])
    await dependencies(root, plugin)
    // Resolve the published export, rather than bypassing it via dist/tui.js.
    const exported = createRequire(path.join(plugin, "package.json")).resolve(`${manifest.name}/tui`)
    // Local CLI plugins are directories with a conventional tui entrypoint.
    const entry = path.join(directory, "packed-entry")
    await mkdir(entry)
    await Bun.write(path.join(entry, "tui.ts"), `export { default } from ${JSON.stringify(exported)}\n`)
    return entry
}

export async function copySourcePlugin(root: string, directory: string, delayedClipboard = false) {
    const plugin = path.join(directory, delayedClipboard ? "clipboard-plugin" : "source-plugin")
    await mkdir(plugin)
    for (const file of ["tui.tsx", "view.tsx", "src"]) {
        await cp(path.join(root, file), path.join(plugin, file), { recursive: true })
    }
    const manifest = await Bun.file(path.join(root, "package.json")).json()
    manifest.exports = { "./tui": "./tui.tsx" }
    await Bun.write(path.join(plugin, "package.json"), JSON.stringify(manifest))
    await dependencies(root, plugin)
    if (delayedClipboard) {
        // Substitute only the external desktop clipboard boundary. OpenCode,
        // the plugin's clipboard logic, and all lifecycle handlers stay real.
        const file = path.join(plugin, "src/clipboard.tsx")
        const source = await Bun.file(file).text()
        const boundary = path.join(import.meta.dir, "clipboard-boundary.ts")
        await Bun.write(file, `import { desktopClipboard } from ${JSON.stringify(boundary)}\n` + source.replace("host: createHostClipboard()", "host: desktopClipboard()"))
    }
    return plugin
}

async function dependencies(root: string, plugin: string) {
    const modules = path.join(plugin, "node_modules")
    await mkdir(modules)
    // A private Solid copy must not split the plugin from OpenCode's reactive runtime.
    await cp(path.join(root, "node_modules/solid-js"), path.join(modules, "solid-js"), { recursive: true })
    for (const name of ["@vimee", "diff"]) {
        await symlink(path.join(root, "node_modules", name), path.join(modules, name))
    }
}
