import { join } from './path'
import { readBytes, bytesToBlob } from './vaultFs'

/**
 * Note images are stored on disk as relative `images/<name>` paths (same as
 * desktop). The WebView can't load a vault content-URI directly, so at runtime
 * we read the bytes and hand the editor a `blob:` URL. This registry maps each
 * blob URL back to its relative path so saving can rewrite it to the on-disk
 * form — the mobile analogue of the desktop prfile:// rewrite.
 */
const blobToRel = new Map<string, string>()
const cacheKeyToBlob = new Map<string, string>() // `${dir}::${rel}` -> blobUrl

/** Resolve an on-disk `images/<name>` to a runtime blob URL (bytes read once). */
export async function loadNoteImage(dir: string, rel: string): Promise<string> {
  const key = `${dir}::${rel}`
  const cached = cacheKeyToBlob.get(key)
  if (cached) return cached
  const bytes = await readBytes(join(dir, rel))
  const url = URL.createObjectURL(bytesToBlob(bytes, 'image/png'))
  blobToRel.set(url, rel)
  cacheKeyToBlob.set(key, url)
  return url
}

/** Register a freshly-saved screenshot's blob URL ↔ relative path. */
export function registerNoteImage(rel: string, blobUrl: string): void {
  blobToRel.set(blobUrl, rel)
}

/** Runtime src → on-disk src. Blob URLs map back to `images/<name>`. */
export function toDiskImageSrc(src: string): string {
  if (blobToRel.has(src)) return blobToRel.get(src)!
  return src // already `images/<name>` (e.g. loaded then re-saved unchanged)
}
