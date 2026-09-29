// .tsx lets OpenCode's runtime loader supply its shared OpenTUI imports.
import {
  createClipboard,
  createHostClipboard,
  createRendererClipboardAdapter,
  type RendererClipboardBoundary,
} from "@opentui/core"

export type VimClipboard = ReturnType<typeof createVimClipboard>

export function createVimClipboard(renderer: RendererClipboardBoundary) {
  const terminal = createRendererClipboardAdapter(renderer)
  const clipboard = createClipboard({ host: createHostClipboard(), terminal })
  let fallback = ""
  let revision = 0
  let writes = Promise.resolve()
  let disposed = false

  return {
    write(text: string): Promise<boolean> {
      text = text.replaceAll("\0", "")
      fallback = text
      revision++
      // Keep rapid cuts in order, and let an immediate p wait for the last write.
      const result = writes.then(async () => {
        if (disposed) return false
        try {
          const result = await clipboard.writeText(text, { destination: "all-available", selection: "clipboard" })
          return result.host.status === "written" || result.terminal.status === "attempted"
        } catch {
          return false
        }
      })
      writes = result.then(() => {})
      return result
    },
    async read(): Promise<string> {
      await writes
      // OSC52 supports copying, but OpenTUI cannot read the client's clipboard.
      if (disposed || terminal.remote) return fallback
      const before = revision
      try {
        const result = await clipboard.read({ preferredTypes: ["text/plain"], selection: "clipboard" })
        if (before !== revision) return fallback
        if (result.status === "empty") fallback = ""
        else if (result.status === "read" && result.representation.mimeType === "text/plain") {
          fallback = new TextDecoder().decode(result.representation.bytes).replace(/\r\n?/g, "\n").replaceAll("\0", "")
        }
      } catch {}
      return fallback
    },
    dispose() {
      disposed = true
      return clipboard.dispose()
    },
  }
}
