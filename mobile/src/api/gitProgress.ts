import { Preferences } from '@capacitor/preferences'

/**
 * Sync progress, persisted to app storage so it survives a hard crash (an OOM
 * kill on a huge repo isn't catchable in JS). If a later launch sees status
 * still 'running', the previous sync died mid-way and we can show where.
 */
export interface GitProgress {
  status: 'running' | 'ok' | 'error'
  line: string
  ts: number
}

const KEY = 'git-progress'

export async function setProgress(status: GitProgress['status'], line: string): Promise<void> {
  try {
    await Preferences.set({ key: KEY, value: JSON.stringify({ status, line, ts: Date.now() }) })
  } catch {
    /* best-effort */
  }
}

export async function getProgress(): Promise<GitProgress | null> {
  const { value } = await Preferences.get({ key: KEY })
  if (!value) return null
  try {
    return JSON.parse(value) as GitProgress
  } catch {
    return null
  }
}
