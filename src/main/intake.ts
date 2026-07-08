import { dialog } from 'electron'
import { join } from 'path'
import { promises as fs } from 'fs'
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

/** Copy a local PDF into a fresh project folder. */
export async function importFromPath(srcPath: string): Promise<IntakeResult> {
  await assertPdf(srcPath)
  const title = deriveTitle(srcPath)
  const { dir } = await createProjectDir(title)
  const pdfPath = join(dir, 'paper.pdf')
  await fs.copyFile(srcPath, pdfPath)
  return { pdfPath, title, source: srcPath }
}

/** Download a remote PDF into a fresh project folder. */
export async function importFromUrl(rawUrl: string): Promise<IntakeResult> {
  const url = normalizePdfUrl(rawUrl.trim())
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!isPdf(buf)) {
    throw new Error('The URL did not return a PDF.')
  }
  const title = deriveTitle(url)
  const { dir } = await createProjectDir(title)
  const pdfPath = join(dir, 'paper.pdf')
  await fs.writeFile(pdfPath, buf)
  return { pdfPath, title, source: url }
}

/**
 * Save a PDF rendered in the renderer (e.g. a web page printed to PDF via the
 * embedded browser) into a fresh project folder. The bytes come from Electron's
 * `webview.printToPDF`, so the text layer stays selectable/extractable.
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
  const pdfPath = join(dir, 'paper.pdf')
  await fs.writeFile(pdfPath, buf)
  return { pdfPath, title, source }
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
