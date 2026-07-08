import { dialog } from 'electron'
import { join, dirname, basename } from 'path'
import { promises as fs } from 'fs'
import type { Project } from '@shared/types'
import { slugify } from './project'

/**
 * Persistence for a `.paperproj` folder. On disk we keep paths *relative* to the
 * folder (pdf as "paper.pdf", note images as "images/<name>") so a project can
 * be moved or shared. At runtime we rehydrate them to absolute paths /
 * prfile:// URLs the renderer can load.
 */

const runtimeImg = (abs: string): string =>
  `prfile://local/${encodeURIComponent(abs)}`

/** Recursively rewrite TipTap image `src` between disk and runtime forms. */
function rewriteImages(doc: unknown, fn: (src: string) => string): unknown {
  if (!doc || typeof doc !== 'object') return doc
  const node = doc as any
  const next: any = { ...node }
  if (node.type === 'image' && typeof node.attrs?.src === 'string') {
    next.attrs = { ...node.attrs, src: fn(node.attrs.src) }
  }
  if (Array.isArray(node.content)) next.content = node.content.map((c: any) => rewriteImages(c, fn))
  return next
}

function toDisk(project: Project): Project {
  return {
    ...project,
    pdfPath: 'paper.pdf',
    notes: project.notes.map((n) => ({
      ...n,
      doc: rewriteImages(n.doc, (src) => {
        const abs = decodeURIComponent(src.replace(/^prfile:\/\/local\//, ''))
        return `images/${basename(abs)}`
      })
    }))
  }
}

function toRuntime(project: Project, dir: string): Project {
  return {
    ...project,
    pdfPath: join(dir, 'paper.pdf'),
    notes: project.notes.map((n) => ({
      ...n,
      doc: rewriteImages(n.doc, (src) =>
        src.startsWith('images/') ? runtimeImg(join(dir, src)) : src
      )
    }))
  }
}

/** Atomically write project.json into the project folder (derived from pdfPath). */
export async function saveProject(project: Project): Promise<{ dir: string }> {
  const dir = dirname(project.pdfPath)
  const file = join(dir, 'project.json')
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(toDisk(project), null, 2), 'utf-8')
  await fs.rename(tmp, file)
  return { dir }
}

/**
 * Prompt for a destination folder, copy the PDF + images there, write
 * project.json, and return the project rehydrated for the new location (so its
 * pdfPath and note-image URLs point at the chosen folder).
 */
export async function saveProjectAs(
  project: Project
): Promise<{ project: Project; dir: string } | null> {
  const suggested = `${slugify(project.meta.title)}.paperproj`
  const r = await dialog.showSaveDialog({
    title: 'Save paper project as',
    defaultPath: suggested
  })
  if (r.canceled || !r.filePath) return null
  const dir = r.filePath
  const srcDir = dirname(project.pdfPath)
  await fs.mkdir(join(dir, 'images'), { recursive: true })

  // Copy the PDF and any existing note images into the new folder.
  await fs.copyFile(project.pdfPath, join(dir, 'paper.pdf'))
  const srcImages = join(srcDir, 'images')
  await fs.cp(srcImages, join(dir, 'images'), { recursive: true }).catch(() => {})

  const file = join(dir, 'project.json')
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify(toDisk(project), null, 2), 'utf-8')
  await fs.rename(tmp, file)

  return { project: toRuntime(project, dir), dir }
}

/**
 * Export the note as a Markdown file at a user-chosen location. Referenced note
 * screenshots are copied into a sibling `images/` folder so the export is
 * self-contained (links are relative `images/<name>`).
 */
export async function exportNoteMarkdown(
  defaultName: string,
  markdown: string,
  images: { abs: string; name: string }[]
): Promise<{ path: string } | null> {
  const r = await dialog.showSaveDialog({
    title: 'Export note as Markdown',
    defaultPath: `${slugify(defaultName)}.md`,
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (r.canceled || !r.filePath) return null
  const mdPath = r.filePath.endsWith('.md') ? r.filePath : `${r.filePath}.md`

  await fs.writeFile(mdPath, markdown, 'utf-8')
  if (images.length > 0) {
    const imgDir = join(dirname(mdPath), 'images')
    await fs.mkdir(imgDir, { recursive: true })
    await Promise.all(
      images.map((im) => fs.copyFile(im.abs, join(imgDir, im.name)).catch(() => {}))
    )
  }
  return { path: mdPath }
}

/** Load a `.paperproj` folder by path, rehydrating runtime paths. */
export async function loadProjectDir(dir: string): Promise<Project> {
  const raw = await fs.readFile(join(dir, 'project.json'), 'utf-8')
  return toRuntime(JSON.parse(raw) as Project, dir)
}

/** Prompt for a `.paperproj` folder and load its project.json. */
export async function openProject(): Promise<Project | null> {
  const r = await dialog.showOpenDialog({
    title: 'Open paper project',
    properties: ['openDirectory'],
    filters: []
  })
  if (r.canceled || r.filePaths.length === 0) return null
  return loadProjectDir(r.filePaths[0])
}
