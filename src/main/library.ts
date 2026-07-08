import { app } from 'electron'
import { join, relative, isAbsolute } from 'path'
import { promises as fs } from 'fs'
import type { Bookmark, RecentEntry } from '@shared/types'
import { getVaultPath, vaultLibraryFile } from './vault'

const RECENTS_LIMIT = 15

const recentsFile = (): string => join(app.getPath('userData'), 'recents.json')

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf-8')) as T
  } catch {
    return fallback
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')
  await fs.rename(tmp, file)
}

// ---- recents (app-local, not part of the portable vault) ----

export async function getRecents(): Promise<RecentEntry[]> {
  return readJson<RecentEntry[]>(recentsFile(), [])
}

export async function addRecent(entry: RecentEntry): Promise<RecentEntry[]> {
  const list = await getRecents()
  const next = [entry, ...list.filter((e) => e.path !== entry.path)].slice(0, RECENTS_LIMIT)
  await writeJson(recentsFile(), next)
  return next
}

// ---- bookmark library (stored in the vault, with vault-relative paths) ----

/** Store projectPath relative to the vault when it lives inside it, so the
 * vault stays portable; absolute paths (external projects) are kept as-is. */
function toDisk(bm: Bookmark, vault: string): Bookmark {
  if (bm.projectPath && bm.projectPath.startsWith(vault)) {
    return { ...bm, projectPath: relative(vault, bm.projectPath) }
  }
  return bm
}

/** Resolve a stored relative projectPath back to an absolute path. */
function toRuntime(bm: Bookmark, vault: string): Bookmark {
  if (bm.projectPath && !isAbsolute(bm.projectPath)) {
    return { ...bm, projectPath: join(vault, bm.projectPath) }
  }
  return bm
}

export async function getLibrary(): Promise<Bookmark[]> {
  const vault = await getVaultPath()
  const raw = await readJson<Bookmark[]>(await vaultLibraryFile(), [])
  return raw.map((b) => toRuntime(b, vault))
}

async function saveLibrary(list: Bookmark[], vault: string): Promise<void> {
  await writeJson(
    await vaultLibraryFile(),
    list.map((b) => toDisk(b, vault))
  )
}

/** Insert or replace a bookmark (matched by id), newest first. */
export async function upsertBookmark(bm: Bookmark): Promise<Bookmark[]> {
  const vault = await getVaultPath()
  const list = (await getLibrary()).filter((b) => b.id !== bm.id)
  const next = [bm, ...list].sort((a, b) => b.addedAt - a.addedAt)
  await saveLibrary(next, vault)
  return next
}

export async function removeBookmark(id: string): Promise<Bookmark[]> {
  const vault = await getVaultPath()
  const next = (await getLibrary()).filter((b) => b.id !== id)
  await saveLibrary(next, vault)
  return next
}
