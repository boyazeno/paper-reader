import { Preferences } from '@capacitor/preferences'
import type { SessionData } from '@shared/types'

// App-local session (which papers were open + scroll), restored on next launch.
const KEY = 'session'

export async function loadSession(): Promise<SessionData | null> {
  const { value } = await Preferences.get({ key: KEY })
  if (!value) return null
  try {
    return JSON.parse(value) as SessionData
  } catch {
    return null
  }
}

export async function saveSession(data: SessionData): Promise<void> {
  await Preferences.set({ key: KEY, value: JSON.stringify(data) })
}
