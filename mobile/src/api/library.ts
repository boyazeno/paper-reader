import { Preferences } from '@capacitor/preferences'
import type { Bookmark, RecentEntry } from '@shared/types'
import { isAbsolute, join, relative } from './path'
import { exists, readText, writeTextAtomic } from './vaultFs'
import { vaultLibraryFile, VAULT_ROOT } from './vault'

const RECENTS_LIMIT = 15
const RECENTS_KEY = 'recents'

// ---- recents (app-local, not part of the portable vault) ----
export async function getRecents(): Promise<RecentEntry[]> {
  const { value } = await Preferences.get({ key: RECENTS_KEY })
  if (!value) return []
  try {
    return JSON.parse(value) as RecentEntry[]
  } catch {
    return []
  }
}

export async function addRecent(entry: RecentEntry): Promise<RecentEntry[]> {
  const list = await getRecents()
  const next = [entry, ...list.filter((e) => e.path !== entry.path)].slice(0, RECENTS_LIMIT)
  await Preferences.set({ key: RECENTS_KEY, value: JSON.stringify(next) })
  return next
}

// ---- bookmark library (stored in the vault, vault-relative projectPath) ----
// Ported from src/main/library.ts. On mobile the vault root is "" so a path
// "inside the vault" is any non-absolute path; we store it as-is (already
// relative) and rehydrate identically. Matches the desktop on-disk shape.

function toDisk(bm: Bookmark): Bookmark {
  if (bm.projectPath && isAbsolute(bm.projectPath)) {
    return { ...bm, projectPath: relative(VAULT_ROOT, bm.projectPath) }
  }
  return bm
}

function toRuntime(bm: Bookmark): Bookmark {
  if (bm.projectPath && !isAbsolute(bm.projectPath)) {
    return { ...bm, projectPath: join(VAULT_ROOT, bm.projectPath) }
  }
  return bm
}

async function readLibrary(): Promise<Bookmark[]> {
  if (!(await exists(vaultLibraryFile()))) return []
  try {
    return JSON.parse(await readText(vaultLibraryFile())) as Bookmark[]
  } catch {
    return []
  }
}

export async function getLibrary(): Promise<Bookmark[]> {
  return (await readLibrary()).map(toRuntime)
}

async function saveLibrary(list: Bookmark[]): Promise<void> {
  await writeTextAtomic(
    vaultLibraryFile(),
    JSON.stringify(list.map(toDisk), null, 2)
  )
}

export async function upsertBookmark(bm: Bookmark): Promise<Bookmark[]> {
  const list = (await getLibrary()).filter((b) => b.id !== bm.id)
  const next = [bm, ...list].sort((a, b) => b.addedAt - a.addedAt)
  await saveLibrary(next)
  return next
}

export async function removeBookmark(id: string): Promise<Bookmark[]> {
  const next = (await getLibrary()).filter((b) => b.id !== id)
  await saveLibrary(next)
  return next
}
