import Anthropic from '@anthropic-ai/sdk'
import type { StreamArgs } from './types'

/** Stream from the Anthropic Messages API via the official SDK. */
export async function streamClaude({
  messages,
  model,
  apiKey,
  baseUrl,
  signal,
  onDelta
}: StreamArgs): Promise<void> {
  if (!apiKey) throw new Error('Missing Claude API key.')
  const client = new Anthropic(baseUrl ? { apiKey, baseURL: baseUrl } : { apiKey })

  // Anthropic takes `system` separately from the user/assistant turns.
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const turns = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  // Cache the system block (which carries any stuffed paper text) so multi-turn
  // Q&A about the same document reads it at ~10% of the input cost. Below the
  // model's minimum cacheable size Anthropic silently skips it — no downside.
  const systemParam = system
    ? [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }]
    : undefined

  const stream = client.messages.stream(
    { model, max_tokens: 4096, system: systemParam, messages: turns },
    { signal }
  )
  stream.on('text', (t) => onDelta(t))
  await stream.finalMessage()
}
