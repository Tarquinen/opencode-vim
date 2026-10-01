import { mkdir, mkdtemp, rename, rm } from "node:fs/promises"
import path from "node:path"

const version = "0.12.5"
const platforms: Record<string, string> = { linux: "linux", darwin: "macos" }
const architectures: Record<string, string> = { x64: "x86_64", arm64: "arm64" }
const platform = platforms[process.platform]
const architecture = architectures[process.arch]
if (!platform || !architecture) {
  throw new Error(`Neovim reference tests do not support ${process.platform}/${process.arch}`)
}

const asset = `nvim-${platform}-${architecture}`
const cache = path.resolve(import.meta.dir, "../../node_modules/.cache/neovim")
const directory = path.join(cache, `v${version}-${platform}-${architecture}`)
export const nvim = path.join(directory, "bin/nvim")

if (!(await Bun.file(nvim).exists())) {
  console.log(`Downloading Neovim v${version} for reference tests`)
  await mkdir(cache, { recursive: true })
  const temporary = await mkdtemp(path.join(cache, "download-"))
  try {
    const url = `https://github.com/neovim/neovim/releases/download/v${version}/${asset}.tar.gz`
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!response.ok) {
      throw new Error(`Could not download Neovim v${version}: ${response.status} ${response.statusText}`)
    }
    const archive = path.join(temporary, "nvim.tar.gz")
    await Bun.write(archive, response)
    const result = Bun.spawnSync(["tar", "-xzf", archive, "-C", temporary])
    if (result.exitCode !== 0) {
      throw new Error(`Could not extract Neovim v${version}: ${result.stderr.toString()}`)
    }
    try {
      await rename(path.join(temporary, asset), directory)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "EEXIST" && code !== "ENOTEMPTY") throw error
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}
