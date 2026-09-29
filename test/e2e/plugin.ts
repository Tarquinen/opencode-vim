import { execFileSync } from "node:child_process"
import { cp, mkdir, symlink } from "node:fs/promises"
import path from "node:path"

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
    return path.join(plugin, "dist")
}

export async function copySourcePlugin(root: string, directory: string) {
    const plugin = path.join(directory, "source-plugin")
    await mkdir(plugin)
    for (const file of ["tui.tsx", "view.tsx", "src"]) {
        await cp(path.join(root, file), path.join(plugin, file), { recursive: true })
    }
    const manifest = await Bun.file(path.join(root, "package.json")).json()
    manifest.exports = { "./tui": "./tui.tsx" }
    await Bun.write(path.join(plugin, "package.json"), JSON.stringify(manifest))
    await dependencies(root, plugin)
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
