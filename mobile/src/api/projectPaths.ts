import { join, basename } from './path'
import { mkdirp } from './vaultFs'
import { vaultProjectsDir } from './vault'

// Ported from src/main/project.ts — identical slug/id scheme so folder names
// match the desktop vault exactly.

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

/** A short, filesystem-safe unique id (8 hex chars), same as randomBytes(4). */
export function shortId(): string {
  const b = new Uint8Array(4)
  crypto.getRandomValues(b)
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

export interface ProjectDir {
  dir: string
  imagesDir: string
}

/** Create `projects/<slug>-<id>.paperproj/` with an images/ subfolder. */
export async function createProjectDir(title: string): Promise<ProjectDir> {
  const dir = join(vaultProjectsDir(), `${slugify(title)}-${shortId()}.paperproj`)
  const imagesDir = join(dir, 'images')
  await mkdirp(imagesDir)
  return { dir, imagesDir }
}

/** Derive a human-ish title from a file name or URL. */
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
