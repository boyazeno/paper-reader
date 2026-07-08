import { app } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
import { loadSettings, saveSettings, defaultVaultPath } from './settings'

/**
 * The vault is a single user-chosen (or default) folder holding everything that
 * should be portable: all `.paperproj` projects under `projects/` and the
 * bookmark library `library.json`. Think of it like an Obsidian vault — copy or
 * sync the folder and you carry all papers + bookmarks with you.
 */

export async function getVaultPath(): Promise<string> {
  const s = await loadSettings()
  return s.vaultPath || defaultVaultPath()
}

/** Ensure the vault + projects dir exist; one-time migrate the old library. */
export async function ensureVault(): Promise<string> {
  const vault = await getVaultPath()
  await fs.mkdir(join(vault, 'projects'), { recursive: true })

  const lib = join(vault, 'library.json')
  try {
    await fs.access(lib)
  } catch {
    // Bring forward bookmarks from the previous userData location, if any.
    const old = join(app.getPath('userData'), 'library.json')
    await fs.copyFile(old, lib).catch(() => {})
  }
  return vault
}

export async function vaultProjectsDir(): Promise<string> {
  return join(await ensureVault(), 'projects')
}

export async function vaultLibraryFile(): Promise<string> {
  return join(await ensureVault(), 'library.json')
}

/** Point the app at a different vault folder (and ensure its layout). */
export async function setVaultPath(path: string): Promise<string> {
  const s = await loadSettings()
  await saveSettings({ ...s, vaultPath: path })
  await ensureVault()
  return path
}
