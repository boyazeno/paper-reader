import { dialog } from 'electron'
import { join, dirname } from 'path'
import { promises as fs } from 'fs'
import { createHash } from 'crypto'
import type { IntakeResult } from '@shared/types'
import { createProjectDir, deriveTitle } from './project'

function isPdf(buf: Buffer): boolean {
  return buf.subarray(0, 5).toString('latin1') === PDF_MAGIC
}

const PDF_MAGIC = '%PDF-'

async function assertPdf(filePath: string): Promise<void> {
  const fh = await fs.open(filePath, 'r')
  try {
    const buf = Buffer.alloc(5)
    await fh.read(buf, 0, 5, 0)
    if (buf.toString('latin1') !== PDF_MAGIC) {
      throw new Error('The file does not look like a PDF.')
    }
  } finally {
    await fh.close()
  }
}

/** Normalize common arXiv/abstract URLs to a direct PDF link. */
export function normalizePdfUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const arxiv = u.pathname.match(/\/abs\/([^/]+)$/)
    if (u.hostname.includes('arxiv.org') && arxiv) {
      u.pathname = `/pdf/${arxiv[1]}`
      return u.toString()
    }
    return raw
  } catch {
    return raw
  }
}

/**
 * After `paper.pdf` is in place, record its size + sha256 (integrity), and —
 * when the PDF is re-fetchable (`pdfUrl` set) — write a per-project `.gitignore`
 * so git never tracks this PDF (it's re-downloaded on demand).
 */
async function finalize(
  dir: string,
  title: string,
  source: string,
  pdfUrl?: string
): Promise<IntakeResult> {
  const pdfPath = join(dir, 'paper.pdf')
  const buf = await fs.readFile(pdfPath)
  const pdfSha256 = createHash('sha256').update(buf).digest('hex')
  const pdfSize = buf.length
  if (pdfUrl) await fs.writeFile(join(dir, '.gitignore'), 'paper.pdf\n')
  return { pdfPath, title, source, pdfUrl, pdfSha256, pdfSize }
}

/** Copy a local PDF into a fresh project folder (not re-fetchable). */
export async function importFromPath(srcPath: string): Promise<IntakeResult> {
  await assertPdf(srcPath)
  const title = deriveTitle(srcPath)
  const { dir } = await createProjectDir(title)
  await fs.copyFile(srcPath, join(dir, 'paper.pdf'))
  return finalize(dir, title, srcPath)
}

/** Download a remote PDF into a fresh project folder (re-fetchable). */
export async function importFromUrl(rawUrl: string): Promise<IntakeResult> {
  const url = normalizePdfUrl(rawUrl.trim())
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!isPdf(buf)) throw new Error('The URL did not return a PDF.')
  const title = deriveTitle(url)
  const { dir } = await createProjectDir(title)
  await fs.writeFile(join(dir, 'paper.pdf'), buf)
  return finalize(dir, title, url, url) // re-fetchable → pdfUrl = url
}

/**
 * Save a PDF rendered in the renderer (e.g. an embedded-browser page printed to
 * PDF) into a fresh project folder. Not re-fetchable → the PDF stays in git.
 */
export async function importFromData(
  data: Uint8Array,
  rawTitle: string,
  source: string
): Promise<IntakeResult> {
  const buf = Buffer.from(data)
  if (!isPdf(buf)) {
    throw new Error('Could not convert this page to a PDF.')
  }
  const title = (rawTitle?.trim() || deriveTitle(source)).slice(0, 200)
  const { dir } = await createProjectDir(title)
  await fs.writeFile(join(dir, 'paper.pdf'), buf)
  return finalize(dir, title, source)
}

/** Open a native file picker, then import the chosen PDF. Returns null if cancelled. */
export async function pickAndImport(): Promise<IntakeResult | null> {
  const r = await dialog.showOpenDialog({
    title: 'Select a PDF',
    properties: ['openFile'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  })
  if (r.canceled || r.filePaths.length === 0) return null
  return importFromPath(r.filePaths[0])
}

/** Mark an existing project re-fetchable: write its per-project `.gitignore` so
 * git stops tracking `paper.pdf` (used to migrate old URL projects). */
export async function markRefetchable(pdfPath: string): Promise<void> {
  await fs.writeFile(join(dirname(pdfPath), '.gitignore'), 'paper.pdf\n')
}

/** Re-download an original PDF to an EXISTING project path (no new project). */
export async function refetch(pdfPath: string, url: string): Promise<void> {
  const res = await fetch(normalizePdfUrl(url), { redirect: 'follow' })
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!isPdf(buf)) throw new Error('The source did not return a PDF.')
  await fs.writeFile(join(dirname(pdfPath), '.gitignore'), 'paper.pdf\n')
  await fs.writeFile(pdfPath, buf)
}
