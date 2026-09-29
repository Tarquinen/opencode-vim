import type { HostClipboardService } from "@opentui/core"

// A controlled external I/O response, used only by clipboard cancellation E2E.
// The production clipboard adapter and OpenCode's event handling are unchanged.
export function desktopClipboard(): HostClipboardService {
  const url = process.env.VIM_E2E_CLIPBOARD!
  return {
    maxWriteBytes: 1_000_000,
    async read() {
      const response = await fetch(url)
      const bytes = new Uint8Array(await response.arrayBuffer())
      // Acknowledge after the returned promise and its consumers settle,
      // so assertions cannot race the adapter's late-paste continuation.
      setImmediate(() => {
        void fetch(url + "/delivered", { method: "POST" })
      })
      return { status: "read", representation: { mimeType: "text/plain", bytes } }
    },
    async writeText() {
      return { status: "written" }
    },
    async clear() {
      return { status: "cleared" }
    },
    async dispose() {},
  }
}
