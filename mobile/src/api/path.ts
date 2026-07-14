// Minimal POSIX-style path helpers so the ported desktop logic (which used
// Node's `path`) works in the browser. All vault paths are POSIX-relative to
// the vault root, e.g. "projects/foo-ab12cd34.paperproj/paper.pdf".

export function join(...parts: string[]): string {
  const segs: string[] = []
  for (const raw of parts) {
    if (!raw) continue
    for (const s of raw.split('/')) {
      if (s === '' || s === '.') continue
      if (s === '..') segs.pop()
      else segs.push(s)
    }
  }
  const abs = parts[0]?.startsWith('/') ?? false
  return (abs ? '/' : '') + segs.join('/')
}

export function dirname(p: string): string {
  const i = p.replace(/\/+$/, '').lastIndexOf('/')
  if (i < 0) return '.'
  if (i === 0) return '/'
  return p.slice(0, i)
}

export function basename(p: string): string {
  const clean = p.replace(/\/+$/, '')
  const i = clean.lastIndexOf('/')
  return i < 0 ? clean : clean.slice(i + 1)
}

export function isAbsolute(p: string): boolean {
  return p.startsWith('/')
}

/** POSIX `relative(from, to)` for vault-relative bookkeeping. */
export function relative(from: string, to: string): string {
  const f = from.replace(/\/+$/, '').split('/').filter(Boolean)
  const t = to.replace(/\/+$/, '').split('/').filter(Boolean)
  let i = 0
  while (i < f.length && i < t.length && f[i] === t[i]) i++
  const up = f.slice(i).map(() => '..')
  return [...up, ...t.slice(i)].join('/')
}
