import type { AppSettings, LlmMessage, ProviderId } from '@shared/types'
import { getSecret } from '../keychain'
import { streamOpenAICompatible } from './openaiCompatible'
import { streamClaude } from './claude'
import { streamMock } from './mock'
import type { StreamArgs } from './types'

function defaultBaseUrl(provider: ProviderId, configured?: string): string {
  const trim = (u: string): string => u.replace(/\/$/, '')
  switch (provider) {
    case 'openai':
      return configured ? trim(configured) : 'https://api.openai.com/v1'
    case 'openrouter':
      return configured ? trim(configured) : 'https://openrouter.ai/api/v1'
    case 'ollama':
      return `${trim(configured || 'http://localhost:11434')}/v1`
  }
  return configured || ''
}

export interface RunArgs {
  provider: ProviderId
  settings: AppSettings
  messages: LlmMessage[]
  signal: AbortSignal
  onDelta: (text: string) => void
}

/** Resolve the right adapter + credentials for a provider and stream a reply. */
export async function runLlm(args: RunArgs): Promise<void> {
  const { provider, settings, messages, signal, onDelta } = args
  const cfg = settings.providers[provider]
  const apiKey = await getSecret(provider)

  const base: StreamArgs = {
    messages,
    model: cfg.model,
    apiKey,
    // Claude reads baseUrl directly; openai-compatible recomputes it below.
    baseUrl: cfg.baseUrl?.trim() || undefined,
    signal,
    onDelta
  }

  if (process.env['PR_MOCK_LLM']) return streamMock(base)

  switch (provider) {
    case 'claude':
      return streamClaude(base)
    case 'openai':
    case 'openrouter':
    case 'ollama':
      return streamOpenAICompatible({
        ...base,
        baseUrl: defaultBaseUrl(provider, cfg.baseUrl)
      })
  }
}
