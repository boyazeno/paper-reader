import type { Bookmark } from '@shared/types'

export interface ParsedQuery {
  terms: string[]
  tags: string[]
}

/**
 * Obsidian-style query parsing:
 *   - `tag:foo` or `#foo` → tag filter (case-insensitive substring on tags)
 *   - any other word     → free-text term matched against title/source/tags/snippet
 */
export function parseQuery(q: string): ParsedQuery {
  const tags: string[] = []
  const terms: string[] = []
  for (const tok of q.trim().split(/\s+/).filter(Boolean)) {
    if (tok.toLowerCase().startsWith('tag:')) {
      const t = tok.slice(4).toLowerCase()
      if (t) tags.push(t)
    } else if (tok.startsWith('#') && tok.length > 1) {
      tags.push(tok.slice(1).toLowerCase())
    } else {
      terms.push(tok.toLowerCase())
    }
  }
  return { terms, tags }
}

export function matchBookmark(bm: Bookmark, q: ParsedQuery): boolean {
  const tagsLc = bm.tags.map((t) => t.toLowerCase())
  for (const t of q.tags) {
    if (!tagsLc.some((x) => x.includes(t))) return false
  }
  if (q.terms.length) {
    const hay = [bm.title, bm.source, bm.snippet, ...bm.tags].join(' ').toLowerCase()
    for (const term of q.terms) {
      if (!hay.includes(term)) return false
    }
  }
  return true
}

/** Filter bookmarks by an Obsidian-style query; empty query returns all. */
export function searchBookmarks(list: Bookmark[], query: string): Bookmark[] {
  const q = parseQuery(query)
  if (!q.terms.length && !q.tags.length) return list
  return list.filter((bm) => matchBookmark(bm, q))
}

/** Distinct tags across the library, sorted by frequency then name. */
export function allTags(list: Bookmark[]): string[] {
  const counts = new Map<string, number>()
  for (const bm of list) for (const t of bm.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([t]) => t)
}
