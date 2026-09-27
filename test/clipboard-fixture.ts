import { mock } from "bun:test"
import type { ClipboardReadResult, HostClipboardService, HostClipboardWriteResult } from "@opentui/core"

export function createClipboardFixture() {
  const clipboard = {
    text: "",
    host: {
      maxWriteBytes: 1024 * 1024,
      read: mock(async (): Promise<ClipboardReadResult> => ({
        status: "read",
        representation: { mimeType: "text/plain", bytes: new TextEncoder().encode(clipboard.text) },
      })),
      writeText: mock(async (text: string): Promise<HostClipboardWriteResult> => {
        clipboard.text = text
        return { status: "written" }
      }),
      clear: async () => ({ status: "cleared" as const }),
      dispose: async () => {},
    } satisfies HostClipboardService,
  }
  return clipboard
}
