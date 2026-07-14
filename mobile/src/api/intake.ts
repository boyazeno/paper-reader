import type { IntakeResult } from '@shared/types'
import { FilePicker } from '@capawesome/capacitor-file-picker'
import { join, dirname } from './path'
import { writeBytes, readBytes, base64ToBytes, writeTextAtomic } from './vaultFs'
import { createProjectDir, deriveTitle } from './projectPaths'
import { fetchBytes, looksLikePdf, normalizePdfUrl } from './pdfFetch'

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource)
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Write PDF bytes into a fresh project folder. When `pdfUrl` is given (the PDF
 * is re-fetchable), also write a per-project `.gitignore` so git never tracks
 * this `paper.pdf` — it's re-downloaded on demand. Records sha256 + size for
 * integrity + the reader's "download (N MB)" label.
 */
async function newProjectFromBytes(
  bytes: Uint8Array,
  title: string,
  source: string,
  pdfUrl?: string
): Promise<IntakeResult> {
  const { dir } = await createProjectDir(title)
  const pdfPath = join(dir, 'paper.pdf')
  await writeBytes(pdfPath, bytes)
  const pdfSha256 = await sha256Hex(bytes)
  const pdfSize = bytes.length
  if (pdfUrl) {
    // Re-fetchable → keep paper.pdf out of git for this project.
    await writeTextAtomic(join(dir, '.gitignore'), 'paper.pdf\n')
  }
  return { pdfPath, title, source, pdfUrl, pdfSha256, pdfSize }
}

/** Download a remote PDF into a fresh project folder (native HTTP, no CORS). */
export async function importFromUrl(rawUrl: string): Promise<IntakeResult> {
  const url = normalizePdfUrl(rawUrl.trim())
  const bytes = await fetchBytes(url)
  if (!looksLikePdf(bytes)) throw new Error('The URL did not return a PDF.')
  return newProjectFromBytes(bytes, deriveTitle(url), url, url) // re-fetchable
}

/** Save bytes handed in from elsewhere (e.g. a converted page) into a project. */
export async function importFromData(
  data: Uint8Array,
  rawTitle: string,
  source: string
): Promise<IntakeResult> {
  if (!looksLikePdf(data)) throw new Error('Could not convert this page to a PDF.')
  const title = (rawTitle?.trim() || deriveTitle(source)).slice(0, 200)
  return newProjectFromBytes(data, title, source) // not re-fetchable → PDF stays in git
}

/** Read a PDF already inside the vault by relative path into a new project. */
export async function importFromPath(path: string): Promise<IntakeResult> {
  const bytes = await readBytes(path)
  if (!looksLikePdf(bytes)) throw new Error('The file does not look like a PDF.')
  return newProjectFromBytes(bytes, deriveTitle(path), path) // not re-fetchable
}

/** Open the system PDF picker, then import the chosen file. */
export async function pickAndImport(): Promise<IntakeResult | null> {
  const res = await FilePicker.pickFiles({
    types: ['application/pdf'],
    readData: true
  })
  const file = res.files[0]
  if (!file?.data) return null
  const bytes = base64ToBytes(file.data)
  if (!looksLikePdf(bytes)) throw new Error('The file does not look like a PDF.')
  const title = (file.name || deriveTitle('paper.pdf')).replace(/\.pdf$/i, '')
  return newProjectFromBytes(bytes, title, file.name ?? 'picked.pdf') // not re-fetchable
}

/** Mark an existing project re-fetchable: write its per-project `.gitignore` so
 * git stops tracking `paper.pdf` (used to migrate old URL projects). */
export async function markRefetchable(pdfPath: string): Promise<void> {
  await writeTextAtomic(join(dirname(pdfPath), '.gitignore'), 'paper.pdf\n')
}

/** Re-download an original PDF to an EXISTING project path (no new project). */
export async function refetch(pdfPath: string, url: string): Promise<void> {
  const bytes = await fetchBytes(normalizePdfUrl(url))
  if (!looksLikePdf(bytes)) throw new Error('The source did not return a PDF.')
  // Ensure the project's .gitignore keeps this re-downloaded PDF out of git.
  await writeTextAtomic(join(dirname(pdfPath), '.gitignore'), 'paper.pdf\n')
  await writeBytes(pdfPath, bytes)
}
