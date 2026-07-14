import { registerPlugin } from '@capacitor/core'

/**
 * VaultFs — the vault filesystem. On Android it is backed by a custom Kotlin
 * Capacitor plugin over the Storage Access Framework (a user-picked folder,
 * with persisted read/write permission). Every `path` is POSIX-relative to the
 * vault root, e.g. "projects/foo-ab12cd34.paperproj/paper.pdf". Bytes cross the
 * bridge base64-encoded.
 *
 * A pure-web in-memory fallback is provided so the UI can run in a desktop
 * browser during development (no persistence — device uses the native plugin).
 */
export interface VaultEntry {
  name: string
  type: 'file' | 'dir'
}

export interface VaultFsPlugin {
  /** Open the SAF tree picker; persists + returns the chosen tree URI. */
  chooseFolder(): Promise<{ uri: string }>
  /** The persisted vault URI, or null if none chosen yet. */
  getFolder(): Promise<{ uri: string | null }>
  readFile(options: { path: string }): Promise<{ data: string }>
  writeFile(options: { path: string; data: string }): Promise<void>
  exists(options: { path: string }): Promise<{ exists: boolean }>
  stat(options: { path: string }): Promise<{ type: 'file' | 'dir'; size: number; mtime: number }>
  list(options: { path: string }): Promise<{ entries: VaultEntry[] }>
  mkdir(options: { path: string }): Promise<void>
  delete(options: { path: string }): Promise<void>
  rename(options: { from: string; to: string }): Promise<void>
  reveal(): Promise<void>
}

// ---------- base64 <-> bytes ----------
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Wrap bytes as a Blob (cast around the DOM lib's ArrayBuffer-generic typing). */
export function bytesToBlob(bytes: Uint8Array, type = 'application/octet-stream'): Blob {
  return new Blob([bytes as unknown as BlobPart], { type })
}

// ---------- web fallback (in-memory) ----------
function webImpl(): VaultFsPlugin {
  const files = new Map<string, Uint8Array>() // path -> bytes
  const dirs = new Set<string>([''])
  let folder: string | null = null

  const norm = (p: string): string => p.replace(/^\/+|\/+$/g, '')
  const parents = (p: string): void => {
    const parts = norm(p).split('/')
    parts.pop()
    let acc = ''
    for (const s of parts) {
      acc = acc ? `${acc}/${s}` : s
      dirs.add(acc)
    }
  }

  return {
    async chooseFolder() {
      folder = 'memory://vault'
      return { uri: folder }
    },
    async getFolder() {
      return { uri: folder }
    },
    async readFile({ path }) {
      const b = files.get(norm(path))
      if (!b) throw new Error(`ENOENT: ${path}`)
      return { data: bytesToBase64(b) }
    },
    async writeFile({ path, data }) {
      parents(path)
      files.set(norm(path), base64ToBytes(data))
    },
    async exists({ path }) {
      const p = norm(path)
      return { exists: files.has(p) || dirs.has(p) }
    },
    async stat({ path }) {
      const p = norm(path)
      if (files.has(p)) return { type: 'file', size: files.get(p)!.length, mtime: 0 }
      if (dirs.has(p)) return { type: 'dir', size: 0, mtime: 0 }
      throw new Error(`ENOENT: ${path}`)
    },
    async list({ path }) {
      const base = norm(path)
      const prefix = base ? `${base}/` : ''
      const seen = new Map<string, VaultEntry>()
      const consider = (full: string, type: 'file' | 'dir'): void => {
        if (!full.startsWith(prefix)) return
        const rest = full.slice(prefix.length)
        if (!rest) return
        const name = rest.split('/')[0]
        const isLeaf = rest.indexOf('/') === -1
        seen.set(name, { name, type: isLeaf ? type : 'dir' })
      }
      for (const f of files.keys()) consider(f, 'file')
      for (const d of dirs) if (d) consider(d, 'dir')
      return { entries: [...seen.values()] }
    },
    async mkdir({ path }) {
      const p = norm(path)
      dirs.add(p)
      parents(`${p}/x`)
    },
    async delete({ path }) {
      const p = norm(path)
      files.delete(p)
      dirs.delete(p)
      for (const f of [...files.keys()]) if (f.startsWith(`${p}/`)) files.delete(f)
    },
    async rename({ from, to }) {
      const f = norm(from)
      const t = norm(to)
      if (files.has(f)) {
        files.set(t, files.get(f)!)
        files.delete(f)
      }
      for (const k of [...files.keys()]) {
        if (k.startsWith(`${f}/`)) {
          files.set(t + k.slice(f.length), files.get(k)!)
          files.delete(k)
        }
      }
      parents(t)
    },
    async reveal() {
      /* no-op on web */
    }
  }
}

export const VaultFs = registerPlugin<VaultFsPlugin>('VaultFs', {
  web: () => webImpl()
})

// ---------- byte-level convenience wrappers ----------
export async function readBytes(path: string): Promise<Uint8Array> {
  const { data } = await VaultFs.readFile({ path })
  return base64ToBytes(data)
}

export async function writeBytes(path: string, bytes: Uint8Array): Promise<void> {
  await VaultFs.writeFile({ path, data: bytesToBase64(bytes) })
}

export async function readText(path: string): Promise<string> {
  return new TextDecoder().decode(await readBytes(path))
}

/** Atomic-ish text write: write to <path>.tmp then rename (matches desktop). */
export async function writeTextAtomic(path: string, text: string): Promise<void> {
  const bytes = new TextEncoder().encode(text)
  const tmp = `${path}.tmp`
  await writeBytes(tmp, bytes)
  await VaultFs.rename({ from: tmp, to: path })
}

export async function exists(path: string): Promise<boolean> {
  return (await VaultFs.exists({ path })).exists
}

export async function mkdirp(path: string): Promise<void> {
  await VaultFs.mkdir({ path })
}
