import type { LlmMessage } from '@shared/types'

export interface StreamArgs {
  messages: LlmMessage[]
  model: string
  baseUrl?: string
  apiKey?: string | null
  signal: AbortSignal
  onDelta: (text: string) => void
}

export type Streamer = (args: StreamArgs) => Promise<void>
