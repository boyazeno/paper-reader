import type { Project } from '@shared/types'
import { join, dirname } from './path'
import { readText, writeTextAtomic } from './vaultFs'
import { loadNoteImage, toDiskImageSrc } from './noteImages'

/**
 * Ported from src/main/projectFile.ts. Keeps the EXACT disk format so a vault
 * round-trips with the desktop app: on disk `pdfPath` is always "paper.pdf" and
 * note image `src` is "images/<name>"; at runtime pdfPath is the vault-relative
 * project path and images are blob: URLs (mobile analogue of prfile://).
 */

/** Recursively rewrite TipTap image `src` (sync — used for disk form). */
function rewriteImages(doc: unknown, fn: (src: string) => string): unknown {
  if (!doc || typeof doc !== 'object') return doc
  const node = doc as Record<string, unknown>
  const next: Record<string, unknown> = { ...node }
  const attrs = node.attrs as Record<string, unknown> | undefined
  if (node.type === 'image' && typeof attrs?.src === 'string') {
    next.attrs = { ...attrs, src: fn(attrs.src as string) }
  }
  if (Array.isArray(node.content)) {
    next.content = (node.content as unknown[]).map((c) => rewriteImages(c, fn))
  }
  return next
}

/** Async variant (runtime form needs to read image bytes → blob URLs). */
async function rewriteImagesAsync(
  doc: unknown,
  fn: (src: string) => Promise<string>
): Promise<unknown> {
  if (!doc || typeof doc !== 'object') return doc
  const node = doc as Record<string, unknown>
  const next: Record<string, unknown> = { ...node }
  const attrs = node.attrs as Record<string, unknown> | undefined
  if (node.type === 'image' && typeof attrs?.src === 'string') {
    next.attrs = { ...attrs, src: await fn(attrs.src as string) }
  }
  if (Array.isArray(node.content)) {
    next.content = await Promise.all(
      (node.content as unknown[]).map((c) => rewriteImagesAsync(c, fn))
    )
  }
  return next
}

function toDisk(project: Project): Project {
  return {
    ...project,
    pdfPath: 'paper.pdf',
    notes: project.notes.map((n) => ({
      ...n,
      doc: rewriteImages(n.doc, toDiskImageSrc)
    }))
  }
}

async function toRuntime(project: Project, dir: string): Promise<Project> {
  const notes = await Promise.all(
    project.notes.map(async (n) => ({
      ...n,
      doc: await rewriteImagesAsync(n.doc, (src) =>
        src.startsWith('images/') ? loadNoteImage(dir, src) : Promise.resolve(src)
      )
    }))
  )
  return { ...project, pdfPath: join(dir, 'paper.pdf'), notes }
}

/** Atomically write project.json into the project's vault folder. */
export async function saveProject(project: Project): Promise<{ dir: string }> {
  const dir = dirname(project.pdfPath)
  await writeTextAtomic(join(dir, 'project.json'), JSON.stringify(toDisk(project), null, 2))
  return { dir }
}

/** Load a `.paperproj` folder by vault-relative path, rehydrating runtime forms. */
export async function loadProjectDir(dir: string): Promise<Project> {
  const raw = await readText(join(dir, 'project.json'))
  return toRuntime(JSON.parse(raw) as Project, dir)
}
