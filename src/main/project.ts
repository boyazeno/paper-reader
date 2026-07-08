import { join, basename } from 'path'
import { promises as fs } from 'fs'
import { randomBytes } from 'crypto'
import { vaultProjectsDir } from './vault'

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/\.pdf$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'paper'
  )
}

/** A short, filesystem-safe unique id. */
export function shortId(): string {
  return randomBytes(4).toString('hex')
}

export interface ProjectDir {
  dir: string
  imagesDir: string
}

/** Create `<slug>-<id>.paperproj/` in the vault with an images/ subfolder. */
export async function createProjectDir(title: string): Promise<ProjectDir> {
  const dir = join(await vaultProjectsDir(), `${slugify(title)}-${shortId()}.paperproj`)
  const imagesDir = join(dir, 'images')
  await fs.mkdir(imagesDir, { recursive: true })
  return { dir, imagesDir }
}

/** Derive a human-ish title from a file path or URL. */
export function deriveTitle(source: string): string {
  try {
    const u = new URL(source)
    const last = decodeURIComponent(basename(u.pathname))
    if (last && last !== '/') return last.replace(/\.pdf$/i, '')
    return u.hostname
  } catch {
    return basename(source).replace(/\.pdf$/i, '')
  }
}
