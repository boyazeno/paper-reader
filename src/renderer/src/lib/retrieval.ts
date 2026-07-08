import type { Block } from '@shared/types'

/**
 * Lightweight, dependency-free lexical retrieval over a paper's paragraph blocks
 * (BM25). Blocks are natural chunks — already paragraph-sized and page-tagged —
 * so a retrieved hit carries its `page`/`id` for citation and scroll-to.
 */

// Common English words that add noise to lexical matching.
const STOP = new Set(
  ('a an the of to in on for and or is are was were be been being with as by at from that ' +
    'this it its into we our their they he she you i not no do does did can could will would ' +
    'should may might must than then so such also more most other some any each has have had')
    .split(' ')
)

export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (w) => w.length > 1 && !STOP.has(w)
  )
}

/** Rough token estimate (~4 chars/token) for context-budget routing. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export interface Retrieved {
  block: Block
  score: number
}

/** Rank blocks against `query` with Okapi BM25; returns the top `k` (score > 0). */
export function retrieve(blocks: Block[], query: string, k = 8): Retrieved[] {
  const qTerms = [...new Set(tokenize(query))]
  if (qTerms.length === 0 || blocks.length === 0) return []

  const docs = blocks.map((b) => tokenize(b.text))
  const N = docs.length
  const avgdl = docs.reduce((s, d) => s + d.length, 0) / N || 1

  const df = new Map<string, number>()
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1)

  const k1 = 1.5
  const b = 0.75
  const idf = (t: string): number => {
    const n = df.get(t) ?? 0
    return Math.log(1 + (N - n + 0.5) / (n + 0.5))
  }

  const scored: Retrieved[] = docs.map((d, i) => {
    const dl = d.length || 1
    const tf = new Map<string, number>()
    for (const t of d) tf.set(t, (tf.get(t) ?? 0) + 1)
    let score = 0
    for (const t of qTerms) {
      const f = tf.get(t) ?? 0
      if (f === 0) continue
      score += idf(t) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * dl) / avgdl)))
    }
    return { block: blocks[i], score }
  })

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}
