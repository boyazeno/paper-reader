import type { StreamArgs } from './types'

/**
 * Offline mock used for headless verification (gated by PR_MOCK_LLM). Streams a
 * deterministic, clearly-marked transformation of the last user message so the
 * streaming pipeline and UI can be exercised without network or API keys.
 */
export async function streamMock({ messages, onDelta, signal }: StreamArgs): Promise<void> {
  const last = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''
  const out = `〔mock〕 ${last}`
  const words = out.split(' ')
  const delay = Number(process.env['PR_MOCK_DELAY'] ?? 6)
  for (const w of words) {
    if (signal.aborted) return
    onDelta(w + ' ')
    await new Promise((r) => setTimeout(r, delay))
  }
}
