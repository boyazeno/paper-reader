import { VaultFs, base64ToBytes, bytesToBase64 } from './vaultFs'

/**
 * A `fs.promises`-shaped adapter over VaultFs so isomorphic-git can operate on
 * the vault (its `.git` lives in the vault, same as the desktop). All paths are
 * normalized to vault-relative POSIX (isomorphic-git joins its `dir` — which we
 * pass as '' — with repo paths, yielding leading-slash paths we strip here).
 */

function norm(p: string): string {
  const s = p.replace(/\/+$/, '').replace(/^(\.\/|\/)+/, '')
  return s === '.' ? '' : s // isomorphic-git probes the repo root as '.'
}

function enoent(path: string): Error & { code: string } {
  const e = new Error(`ENOENT: no such file or directory, '${path}'`) as Error & { code: string }
  e.code = 'ENOENT'
  return e
}

class Stats {
  type: 'file' | 'dir'
  size: number
  mtimeMs: number
  constructor(type: 'file' | 'dir', size: number, mtimeMs: number) {
    this.type = type
    this.size = size
    this.mtimeMs = mtimeMs
  }
  isFile(): boolean {
    return this.type === 'file'
  }
  isDirectory(): boolean {
    return this.type === 'dir'
  }
  isSymbolicLink(): boolean {
    return false
  }
  get mode(): number {
    return this.type === 'dir' ? 0o40000 : 0o100644
  }
  get ino(): number {
    return 0
  }
  get uid(): number {
    return 1
  }
  get gid(): number {
    return 1
  }
  get dev(): number {
    return 1
  }
  get ctimeMs(): number {
    return this.mtimeMs
  }
}

async function readFile(
  path: string,
  opts?: { encoding?: string } | string
): Promise<Uint8Array | string> {
  const p = norm(path)
  let data: string
  try {
    data = (await VaultFs.readFile({ path: p })).data
  } catch {
    throw enoent(p)
  }
  const bytes = base64ToBytes(data)
  const enc = typeof opts === 'string' ? opts : opts?.encoding
  return enc ? new TextDecoder().decode(bytes) : bytes
}

async function writeFile(
  path: string,
  data: Uint8Array | string
): Promise<void> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  await VaultFs.writeFile({ path: norm(path), data: bytesToBase64(bytes) })
}

async function unlink(path: string): Promise<void> {
  await VaultFs.delete({ path: norm(path) })
}

async function readdir(path: string): Promise<string[]> {
  const p = norm(path)
  try {
    if (p && (await VaultFs.stat({ path: p })).type !== 'dir') {
      const e = new Error(`ENOTDIR: '${p}'`) as Error & { code: string }
      e.code = 'ENOTDIR'
      throw e
    }
  } catch (e) {
    if ((e as { code?: string }).code) throw e
    throw enoent(p)
  }
  const { entries } = await VaultFs.list({ path: p })
  return entries.map((x) => x.name)
}

async function mkdir(path: string): Promise<void> {
  await VaultFs.mkdir({ path: norm(path) })
}

async function rmdir(path: string): Promise<void> {
  await VaultFs.delete({ path: norm(path) })
}

async function stat(path: string): Promise<Stats> {
  const p = norm(path)
  try {
    const s = await VaultFs.stat({ path: p })
    return new Stats(s.type, s.size, s.mtime)
  } catch {
    throw enoent(p)
  }
}

async function rename(oldPath: string, newPath: string): Promise<void> {
  await VaultFs.rename({ from: norm(oldPath), to: norm(newPath) })
}

async function readlink(path: string): Promise<string> {
  throw enoent(path) // no symlinks in the vault
}
async function symlink(): Promise<void> {
  const e = new Error('ENOTSUP: symlinks unsupported') as Error & { code: string }
  e.code = 'ENOTSUP'
  throw e
}
async function chmod(): Promise<void> {
  /* no-op: SAF has no unix modes */
}

export const gitFs = {
  promises: {
    readFile,
    writeFile,
    unlink,
    readdir,
    mkdir,
    rmdir,
    stat,
    lstat: stat,
    rename,
    readlink,
    symlink,
    chmod
  }
}
