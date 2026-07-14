import { VaultFs, exists, mkdirp } from './vaultFs'

/**
 * On mobile the "vault" is the user-picked SAF folder; the native plugin holds
 * the tree URI, so every path we pass is POSIX-relative to that root. The root
 * itself is therefore the empty string "".
 */
export const VAULT_ROOT = ''

export async function hasVault(): Promise<boolean> {
  return (await VaultFs.getFolder()).uri != null
}

/** Prompt the user to pick a vault folder (persists the grant natively). */
export async function chooseVault(): Promise<string> {
  const { uri } = await VaultFs.chooseFolder()
  await ensureVault()
  return uri
}

/** The display string for the current vault (the SAF tree URI, or ''). */
export async function vaultDisplayPath(): Promise<string> {
  return (await VaultFs.getFolder()).uri ?? ''
}

/** Ensure projects/ exists (library.json is created lazily on first write). */
export async function ensureVault(): Promise<void> {
  if (!(await hasVault())) return
  await mkdirp('projects')
}

export function vaultProjectsDir(): string {
  return 'projects'
}

export function vaultLibraryFile(): string {
  return 'library.json'
}

export async function libraryExists(): Promise<boolean> {
  return exists(vaultLibraryFile())
}
