import { Preferences } from '@capacitor/preferences'
import type { AppSettings, ProviderId } from '@shared/types'
import { DEFAULT_INSPIRE_PROMPT } from '@shared/prompts'

// App-local (not in the portable vault). Preferences is app-private storage.
const KEY = 'settings'

const DEFAULT_MODELS: Record<ProviderId, string> = {
  openrouter: 'anthropic/claude-3.5-sonnet',
  openai: 'gpt-4o',
  claude: 'claude-opus-4-8',
  ollama: 'llama3.1'
}

export function defaultSettings(): AppSettings {
  return {
    activeProvider: 'claude',
    targetLang: 'Chinese',
    theme: 'system',
    inspirePrompt: DEFAULT_INSPIRE_PROMPT,
    tourCompleted: false,
    vaultPath: '', // chosen via SAF; the native plugin holds the tree URI
    providers: {
      openrouter: { id: 'openrouter', model: DEFAULT_MODELS.openrouter },
      openai: { id: 'openai', model: DEFAULT_MODELS.openai },
      claude: { id: 'claude', model: DEFAULT_MODELS.claude },
      ollama: {
        id: 'ollama',
        model: DEFAULT_MODELS.ollama,
        baseUrl: 'http://localhost:11434'
      }
    }
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const { value } = await Preferences.get({ key: KEY })
  if (!value) return defaultSettings()
  try {
    // Shallow-merge over defaults so new fields appear after upgrades.
    return { ...defaultSettings(), ...(JSON.parse(value) as Partial<AppSettings>) }
  } catch {
    return defaultSettings()
  }
}

export async function saveSettings(settings: AppSettings): Promise<AppSettings> {
  await Preferences.set({ key: KEY, value: JSON.stringify(settings) })
  return settings
}
