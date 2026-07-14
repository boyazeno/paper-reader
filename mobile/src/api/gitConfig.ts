import { Preferences } from '@capacitor/preferences'

/**
 * Non-secret git sync config (the token itself lives in the Keystore). The
 * remote URL is kept in the repo's git config; here we store the HTTPS username
 * (default 'x-access-token', which works for GitHub PATs) and an optional CORS
 * proxy for hosts that don't send permissive CORS to the WebView.
 */
export interface GitConfig {
  username: string
  corsProxy: string
  /** Fetch full history vs. just the latest snapshot (shallow depth:1). Shallow
   * is the default — a phone rarely needs history and it downloads far less. */
  fullHistory: boolean
  /** Remote URL. Kept here (not only in .git) because the native engine's repo
   * is a hidden clone, so JS needs the URL to pass to the plugin. */
  remoteUrl: string
}

const KEY = 'git-config'
const DEFAULT: GitConfig = {
  username: 'x-access-token',
  corsProxy: '',
  fullHistory: false,
  remoteUrl: ''
}

export async function getGitConfig(): Promise<GitConfig> {
  const { value } = await Preferences.get({ key: KEY })
  if (!value) return { ...DEFAULT }
  try {
    return { ...DEFAULT, ...(JSON.parse(value) as Partial<GitConfig>) }
  } catch {
    return { ...DEFAULT }
  }
}

export async function setGitConfig(patch: Partial<GitConfig>): Promise<GitConfig> {
  const next = { ...(await getGitConfig()), ...patch }
  await Preferences.set({ key: KEY, value: JSON.stringify(next) })
  return next
}
