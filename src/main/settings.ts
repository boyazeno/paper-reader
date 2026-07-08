import { app } from 'electron'
import { join } from 'path'
import { homedir } from 'os'
import { promises as fs } from 'fs'
import type { AppSettings, ProviderId } from '@shared/types'
import { DEFAULT_INSPIRE_PROMPT } from '@shared/prompts'

const SETTINGS_FILE = () => join(app.getPath('userData'), 'settings.json')

const DEFAULT_MODELS: Record<ProviderId, string> = {
  openrouter: 'anthropic/claude-3.5-sonnet',
  openai: 'gpt-4o',
  claude: 'claude-opus-4-8',
  ollama: 'llama3.1'
}

/** Default vault location: XDG data dir (~/.local/share) on Linux. */
export function defaultVaultPath(): string {
  if (process.platform === 'linux') {
    const base = process.env['XDG_DATA_HOME'] || join(homedir(), '.local', 'share')
    return join(base, 'paper-reader')
  }
  return join(app.getPath('userData'), 'vault')
}

export function defaultSettings(): AppSettings {
  return {
    activeProvider: 'claude',
    targetLang: 'Chinese',
    theme: 'system',
    inspirePrompt: DEFAULT_INSPIRE_PROMPT,
    tourCompleted: false,
    vaultPath: defaultVaultPath(),
    providers: {
      openrouter: { id: 'openrouter', model: DEFAULT_MODELS.openrouter },
      openai: { id: 'openai', model: DEFAULT_MODELS.openai },
      claude: { id: 'claude', model: DEFAULT_MODELS.claude },
      ollama: { id: 'ollama', model: DEFAULT_MODELS.ollama, baseUrl: 'http://localhost:11434' }
    }
  }
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(SETTINGS_FILE(), 'utf-8')
    // Shallow-merge over defaults so new fields appear after upgrades.
    return { ...defaultSettings(), ...JSON.parse(raw) }
  } catch {
    return defaultSettings()
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const file = SETTINGS_FILE()
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(settings, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}
