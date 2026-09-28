import { execFileSync } from "node:child_process"
import { mkdir, symlink } from "node:fs/promises"
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
    await symlink(path.join(root, "node_modules"), path.join(plugin, "node_modules"), "dir")
    return path.join(plugin, "dist")
}
