import type { ProviderId } from '@shared/types'

export const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'claude', label: 'Claude' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'ollama', label: 'Ollama (local)' }
]

export const LANGUAGES = [
  'Chinese',
  'English',
  'German',
  'French',
  'Spanish',
  'Japanese',
  'Korean',
  'Italian',
  'Portuguese',
  'Russian'
]
