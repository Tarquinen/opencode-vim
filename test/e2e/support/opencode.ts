import { mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import path from "node:path"

export async function installOpenCode() {
  if (
    (process.platform !== "linux" && process.platform !== "darwin") ||
    (process.arch !== "x64" && process.arch !== "arm64")
  ) {
    throw new Error(`OpenCode E2E tests do not support ${process.platform}/${process.arch}`)
  }
  const release = await fetch("https://opencode.ai/update/api/latest/cli/npm", { signal: AbortSignal.timeout(30_000) })
  if (!release.ok) throw new Error(`Could not resolve the latest OpenCode release: ${release.status}`)
  const { version } = (await release.json()) as { version: string }
  if (!/^2\.\d+\.\d+$/.test(version)) throw new Error(`Expected a stable OpenCode V2 release, received ${version}`)
  console.log(`OpenCode E2E version: ${version} (latest stable)`)
  const architecture = process.arch === "x64" ? "x64-baseline" : "arm64"
  const target = `${process.platform}-${architecture}`
  const cache = path.resolve(import.meta.dir, "../../../node_modules/.cache/opencode")
  const directory = path.join(cache, `${version}-${target}`)
  const binary = path.join(directory, "opencode")
  if (await Bun.file(binary).exists()) return { binary, version }

  console.log(`Downloading OpenCode ${version} for E2E tests`)
  await mkdir(cache, { recursive: true })
  const temporary = await mkdtemp(path.join(cache, "download-"))
  try {
    const extension = process.platform === "darwin" ? "zip" : "tar.gz"
    const archive = path.join(temporary, `opencode.${extension}`)
    const response = await fetch(`https://opencode.ai/files/bin/${version}/opencode-${target}.${extension}`, {
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error(`Could not download OpenCode: ${response.status} ${response.statusText}`)
    await Bun.write(archive, response)
    if (extension === "zip") execFileSync("unzip", ["-q", archive, "-d", temporary])
    else execFileSync("tar", ["-xzf", archive, "-C", temporary])
    await rm(archive)
    try {
      await rename(temporary, directory)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
  return { binary, version }
}
