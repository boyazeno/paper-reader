import type { AppSettings, LlmMessage, ProviderId } from '@shared/types'

// Browser-side LLM streaming (no Node main process). Claude uses a raw SSE call
// to /v1/messages (the SDK's shape) so we don't ship the Node SDK; the others
// use the OpenAI-compatible /chat/completions SSE, parsed exactly as the
// desktop src/main/llm/openaiCompatible.ts does. Relies on the WebView's
// (Chromium) fetch + ReadableStream for streaming.

export interface StreamArgs {
  messages: LlmMessage[]
  model: string
  apiKey: string | null
  baseUrl?: string
  signal: AbortSignal
  onDelta: (delta: string) => void
}

/** Resolve the base URL per provider (ported from src/main/llm/index.ts). */
function baseUrlFor(provider: ProviderId, cfgBaseUrl?: string): string {
  const trim = (u: string): string => u.replace(/\/+$/, '')
  switch (provider) {
    case 'openai':
      return trim(cfgBaseUrl || 'https://api.openai.com/v1')
    case 'openrouter':
      return trim(cfgBaseUrl || 'https://openrouter.ai/api/v1')
    case 'ollama':
      return `${trim(cfgBaseUrl || 'http://localhost:11434')}/v1`
    case 'claude':
      return trim(cfgBaseUrl || 'https://api.anthropic.com')
  }
}

async function streamClaude({
  messages,
  model,
  apiKey,
  baseUrl,
  signal,
  onDelta
}: StreamArgs): Promise<void> {
  if (!apiKey) throw new Error('Missing Claude API key.')
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const turns = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: system
        ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
        : undefined,
      messages: turns,
      stream: true
    })
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }
  await parseSse(res.body, (payload) => {
    const json = JSON.parse(payload)
    if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
      onDelta(json.delta.text as string)
    }
  })
}

async function streamOpenAICompatible({
  messages,
  model,
  baseUrl,
  apiKey,
  signal,
  onDelta
}: StreamArgs): Promise<void> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({ model, messages, stream: true })
  })
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }
  await parseSse(res.body, (payload) => {
    if (payload === '[DONE]') return
    try {
      const json = JSON.parse(payload)
      const delta = json.choices?.[0]?.delta?.content
      if (delta) onDelta(delta)
    } catch {
      /* keep-alive / partial frame */
    }
  })
}

/** Shared SSE `data:` line reader (frames separated by newlines). */
async function parseSse(
  body: ReadableStream<Uint8Array>,
  onData: (payload: string) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      onData(payload)
    }
  }
}

/** Dispatch a streaming run for the active provider. */
export async function streamLlm(
  provider: ProviderId,
  settings: AppSettings,
  apiKey: string | null,
  args: Omit<StreamArgs, 'model' | 'apiKey' | 'baseUrl'>
): Promise<void> {
  const cfg = settings.providers[provider]
  const baseUrl = baseUrlFor(provider, cfg.baseUrl)
  const full: StreamArgs = { ...args, model: cfg.model, apiKey, baseUrl }
  if (provider === 'claude') return streamClaude(full)
  return streamOpenAICompatible(full)
}
