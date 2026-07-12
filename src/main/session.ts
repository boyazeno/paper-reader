import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import type { SessionData } from '@shared/types'

/** The open-tabs session (which papers + scroll), restored on next launch. */
const sessionFile = (): string => join(app.getPath('userData'), 'session.json')

export async function loadSession(): Promise<SessionData | null> {
  try {
    return JSON.parse(await fs.readFile(sessionFile(), 'utf-8')) as SessionData
  } catch {
    return null
  }
}

export async function saveSession(data: SessionData): Promise<void> {
  const file = sessionFile()
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data), 'utf-8')
  await fs.rename(tmp, file)
}
