import type { Context } from "@opencode/plugin/tui/context"
import type { VimConfig } from "../modules/vim/config"
import type { TranscriptItem } from "../transcript-items"

export type ReaderProps = {
  context: Context
  config: VimConfig
  message: TranscriptItem
  offset: number
  copy: (text: string) => void
  notice: () => string
  remember: (offset: number) => void
  back: () => void
  close: () => void
}
