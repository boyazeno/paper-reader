import { CapacitorHttp } from '@capacitor/core'
import { base64ToBytes } from './vaultFs'

/** Normalize common arXiv/abstract URLs to a direct PDF link (ported). */
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
 * Download a URL to bytes via the native HTTP stack (CapacitorHttp), which is
 * not subject to WebView CORS — the mobile equivalent of the desktop main-
 * process fetch. Binary comes back base64-encoded.
 */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await CapacitorHttp.get({ url, responseType: 'arraybuffer' })
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Download failed (HTTP ${res.status}).`)
  }
  const data = res.data as unknown
  if (typeof data === 'string') return base64ToBytes(data)
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  // Web fallback may hand back a plain object/blob; last resort via fetch.
  const r = await fetch(url)
  return new Uint8Array(await r.arrayBuffer())
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  return new TextDecoder('latin1').decode(bytes.subarray(0, 5)) === '%PDF-'
}
