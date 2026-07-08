import type { Block } from '@shared/types'

export interface Reference {
  /** e.g. "[1]" or "1." */
  marker: string
  text: string
  /** Source block, for scroll-to in the PDF. */
  blockId?: string
}

// ---------------------------------------------------------------------------
// Heading detection
// ---------------------------------------------------------------------------

const HEAD_WORDS = '(?:references?|bibliography|workscited|literaturecited|referencesandnotes)'
const ROMAN = '(?:i{1,3}|iv|v|vi{0,3}|ix|x{1,3})'
// Word prefixes a references heading may carry ("Supplementary References",
// "Appendix References", "Online Appendix" before the word, etc.).
const HEAD_PREFIX = '(?:appendix|section|supplementary|supplementarymaterials?|onlineappendix)?'
// Glued form (all whitespace stripped, so "R EFERENCES" small-caps and
// "7References" both match): only arabic/roman enumerators may abut the word —
// none of them forms an English word with "references". A bare letter is *not*
// allowed here, else "Preferences" → "p"+"references" would false-match.
const HEADING_GLUED = new RegExp(`^${HEAD_PREFIX}(?:\\d{1,3}|${ROMAN})?[.):]*${HEAD_WORDS}`)
// Separated form (single spaces kept): a letter/number enumerator is allowed
// only when a real separator follows it ("A. References", "A References") — so
// the plain word "Preferences" (no separator) is rejected.
const HEADING_SEP = new RegExp(
  `^(?:appendix\\s+)?(?:[a-z]|\\d{1,3}|${ROMAN})(?:[.):]+\\s*|\\s+)${HEAD_WORDS}`
)

/** lowercase + strip all whitespace (so "R EFERENCES" small-caps still match). */
function norm(t: string): string {
  return t.toLowerCase().replace(/\s+/g, '')
}

/** lowercase + collapse runs of whitespace to single spaces. */
function normSpaced(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, ' ')
}

function matchesHeading(text: string): boolean {
  return HEADING_GLUED.test(norm(text)) || HEADING_SEP.test(normSpaced(text))
}

// Strips a leading heading (optional prefix word + enumerator + the heading
// word + trailing separators) from a block's *original* text.
const HEAD_STRIP_RE = new RegExp(
  '^\\s*(?:appendix|section|supplementary(?:\\s+materials?)?|online\\s+appendix)?\\s*' +
    '(?:[\\divxlc]{1,4}[.):]*\\s*)?' +
    '(?:references?|bibliography|works\\s*cited|literature\\s*cited|references\\s+and\\s+notes)' +
    '[\\s:.)\\-]*',
  'i'
)

/** Text of `block` with a leading references-heading removed, if present. */
function afterHeadingWord(block: Block): string {
  const m = block.text.match(HEAD_STRIP_RE)
  return m ? block.text.slice(m[0].length) : block.text
}

/** Does the text right after a heading word look like the first reference entry? */
function looksLikeEntryStart(s: string): boolean {
  const t = s.trim()
  if (/^\[\d{1,3}\]/.test(t)) return true // "[1]" (usually followed by a space)
  if (/^\(?\d{1,3}[.)]/.test(t)) return true // "1." / "1)" / "(1)"
  if (/^[A-Z][A-Za-z'’-]+,?\s+[A-Z]\./.test(t)) return true // "Smith, J."
  return false
}

/**
 * A reference-section heading: matches the heading pattern AND is either a short
 * standalone block or is immediately followed by something that looks like the
 * first entry (heading merged with its first reference). This rejects prose
 * mentions ("References to prior work…") and bare running page-headers.
 */
function isRefHeading(block: Block): boolean {
  if (!matchesHeading(block.text)) return false
  const trimmed = block.text.trim()
  if (trimmed.length <= 30) return true
  return looksLikeEntryStart(afterHeadingWord(block))
}

// Sections clearly end where these begin (when they abut the list with no gap).
const STOP_RE = /^(?:appendix|section)?[\divxlc.):]*(?:acknowledg|appendix|supplementary)/

function isStopHeading(block: Block): boolean {
  return STOP_RE.test(norm(block.text)) && !isRefHeading(block)
}

// ---------------------------------------------------------------------------
// Reference-likeness scoring
// ---------------------------------------------------------------------------

/** How strongly a block looks like a bibliography entry (or run of entries). */
function refScore(t: string): number {
  let s = 0
  if (/^\s*\[\d{1,3}\]/.test(t)) s += 3
  else if (/^\s*\(?\d{1,3}[.)]\s/.test(t)) s += 2
  if (/\b(?:19|20)\d{2}\b/.test(t)) s += 2 // year
  if (/\bet\s?al\b/i.test(t)) s += 2
  if (/[A-Z]\.\s?[A-Z]?\.?(?:,|\s|$)/.test(t)) s += 1 // author initials "J. K."
  if (/\b(?:doi|arxiv|https?:)/i.test(t)) s += 2
  if (/\b(?:proc\.|proceedings|journal|conf\.|conference|trans\.|vol\.|pp?\.|pages|editors?|eds?\.)/i.test(t))
    s += 1
  if (/\bpp?\.\s?\d+|\b\d+\s?[–-]\s?\d+\b/.test(t)) s += 1 // page range
  return s
}

const LIKE = (t: string): boolean => refScore(t) >= 2

// ---------------------------------------------------------------------------
// Entry splitting within one section slice
// ---------------------------------------------------------------------------

const MIN_ENTRY_LEN = 8

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/** Map a character offset in the joined slice text back to its source block id. */
function makeOffsetMap(slice: Block[]): { joined: string; at: (off: number) => string | undefined } {
  const spans: { start: number; id: string }[] = []
  let joined = ''
  for (const b of slice) {
    spans.push({ start: joined.length, id: b.id })
    joined += (joined ? ' ' : '') + b.text
  }
  const at = (off: number): string | undefined => {
    let id: string | undefined
    for (const s of spans) {
      if (s.start <= off) id = s.id
      else break
    }
    return id
  }
  return { joined, at }
}

/** Strategy A — bracketed [n] markers forming an increasing run. */
function splitBracketed(slice: Block[]): Reference[] | null {
  const { joined, at } = makeOffsetMap(slice)
  // Marker offsets that coincide with a block start get priority for seeding.
  const blockStarts = new Set<number>()
  {
    let pos = 0
    for (const b of slice) {
      blockStarts.add(pos)
      pos += (pos ? 1 : 0) + b.text.length
    }
  }
  const re = /\[(\d{1,3})\]/g
  const marks: { idx: number; n: number; atStart: boolean }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(joined)) !== null) {
    marks.push({ idx: m.index, n: parseInt(m[1], 10), atStart: blockStarts.has(m.index) })
  }
  if (marks.length === 0) return null

  // Seed from the first marker at a block start, else the very first marker.
  const seed = marks.find((x) => x.atStart) ?? marks[0]
  let expected = seed.n
  const cuts: { idx: number; n: number }[] = []
  for (const mk of marks) {
    if (mk.idx < seed.idx) continue
    if (mk.n === expected) {
      cuts.push({ idx: mk.idx, n: mk.n })
      expected++
    }
  }
  if (cuts.length === 0) return null

  const refs: Reference[] = []
  for (let i = 0; i < cuts.length; i++) {
    const end = i + 1 < cuts.length ? cuts[i + 1].idx : joined.length
    const seg = joined.slice(cuts[i].idx, end)
    const mm = seg.match(/^\[(\d{1,3})\]\s*([\s\S]*)$/)
    if (!mm) continue
    const text = clean(mm[2])
    if (!text) continue
    refs.push({ marker: `[${mm[1]}]`, text, blockId: at(cuts[i].idx) })
  }
  return refs.length ? refs : null
}

/** Strategy B — "n." / "n)" numbered entries (per-block or one collapsed block). */
function splitNumbered(slice: Block[]): Reference[] | null {
  // Per-block: each entry block starts with an increasing-by-1 number.
  const perBlock: Reference[] = []
  let expected: number | null = null
  for (const b of slice) {
    const mm = b.text.match(/^\s*(\d{1,3})[.)]\s+([\s\S]+)$/)
    if (!mm) continue
    const n = parseInt(mm[1], 10)
    if (expected === null) expected = n
    if (n !== expected) continue
    const text = clean(mm[2])
    if (text.length >= MIN_ENTRY_LEN) perBlock.push({ marker: `${n}.`, text, blockId: b.id })
    expected++
  }
  if (perBlock.length >= 2) return perBlock

  // Collapsed: one block containing "1. … 2. … 3. …" with increasing numbers.
  if (slice.length <= 2) {
    const { joined, at } = makeOffsetMap(slice)
    const re = /(?:^|\s)(\d{1,3})[.)]\s+/g
    const marks: { idx: number; n: number; textStart: number }[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(joined)) !== null) {
      marks.push({ idx: m.index, n: parseInt(m[1], 10), textStart: m.index + m[0].length })
    }
    const seq: typeof marks = []
    let exp: number | null = null
    for (const mk of marks) {
      if (exp === null) exp = mk.n
      if (mk.n === exp) {
        seq.push(mk)
        exp++
      }
    }
    if (seq.length >= 3) {
      const refs: Reference[] = []
      for (let i = 0; i < seq.length; i++) {
        const end = i + 1 < seq.length ? seq[i + 1].idx : joined.length
        const text = clean(joined.slice(seq[i].textStart, end))
        if (text.length >= MIN_ENTRY_LEN)
          refs.push({ marker: `${seq[i].n}.`, text, blockId: at(seq[i].idx) })
      }
      if (refs.length >= 3) return refs
    }
  }
  return null
}

/** Strategy C1 — author-year, multi-block: each block is one entry. */
function splitAuthorYearMulti(slice: Block[]): Reference[] | null {
  if (slice.length < 2) return null
  const refs: Reference[] = []
  for (const b of slice) {
    const text = clean(b.text)
    if (text.length < MIN_ENTRY_LEN) continue
    if (refScore(text) === 0 && text.length < 30) continue // stray header / page no.
    refs.push({ marker: `${refs.length + 1}.`, text, blockId: b.id })
  }
  return refs.length ? refs : null
}

/** Strategy C2 — single collapsed block: split before "<end> Surname, A." starts. */
function splitCollapsed(slice: Block[]): Reference[] {
  const b = slice[slice.length - 1]
  if (!b) return []
  const parts = b.text.split(/(?<=\.)\s+(?=[A-Z][A-Za-z'’-]+,\s+[A-Z]\.)/)
  if (parts.length >= 3) {
    const refs: Reference[] = []
    for (const p of parts) {
      const text = clean(p)
      if (text.length >= MIN_ENTRY_LEN)
        refs.push({ marker: `${refs.length + 1}.`, text, blockId: b.id })
    }
    if (refs.length >= 3) return refs
  }
  const whole = clean(b.text)
  return whole.length >= MIN_ENTRY_LEN ? [{ marker: '1.', text: whole, blockId: b.id }] : []
}

/**
 * Split one accepted section slice into entries. We already know the slice *is*
 * a reference list. A solid numeric structure (>=2 consecutive [n] or n.
 * markers) is authoritative — it must win over per-block author-year, which
 * would otherwise miscount any non-entry block as its own entry. Otherwise pick
 * the longest weak candidate, then a single-block split.
 */
function splitSection(slice: Block[]): Reference[] {
  if (slice.length === 0) return []
  const bracketed = splitBracketed(slice)
  if (bracketed && bracketed.length >= 2) return bracketed
  const numbered = splitNumbered(slice)
  if (numbered && numbered.length >= 2) return numbered

  const weak = [bracketed, numbered, splitAuthorYearMulti(slice)]
    .filter((c): c is Reference[] => !!c && c.length > 0)
    .sort((a, b) => b.length - a.length)[0]
  return weak ?? splitCollapsed(slice)
}

// ---------------------------------------------------------------------------
// Section detection
// ---------------------------------------------------------------------------

const GAP_TOL = 2

interface Section {
  start: number // first entry block (after the heading)
  end: number // inclusive last entry block
}

const CAPTION_RE = /^\s*(?:figure|fig\.?|table|algorithm|listing)\s*\d/i

/** Blocks of a section for splitting: drop interior running-header / stop
 * headings and stray figure/table captions, but keep a single collapsed block
 * (heading merged with the list). */
function sectionSlice(blocks: Block[], sec: Section): Block[] {
  const raw = blocks.slice(sec.start, sec.end + 1)
  if (raw.length <= 1) return raw
  return raw.filter(
    (b, i) =>
      i === 0 ||
      (!isRefHeading(b) && !isStopHeading(b) && !(CAPTION_RE.test(b.text) && refScore(b.text) < 2))
  )
}

/** Grow a section forward from a heading at `h` while blocks stay reference-like. */
function growSection(blocks: Block[], h: number): Section | null {
  let lastLike = -1
  let gap = 0
  for (let i = h + 1; i < blocks.length; i++) {
    const b = blocks[i]
    if (isStopHeading(b)) break
    if (LIKE(b.text)) {
      lastLike = i
      gap = 0
    } else if (isRefHeading(b)) {
      // A repeated running-header "References" mid-list: skip it, don't break,
      // and don't count it toward the non-reference gap.
      continue
    } else if (++gap > GAP_TOL) {
      break
    }
  }
  if (lastLike < 0) {
    // Heading may be merged with the whole list in this same block.
    const head = blocks[h]
    const markers = (head.text.match(/\[\d{1,3}\]/g) ?? []).length
    if (markers >= 2 || (refScore(head.text) >= 4 && head.text.length > 200))
      return { start: h, end: h }
    return null
  }
  return { start: h + 1, end: lastLike }
}

/** Find maximal runs of >=4 consecutive increasing "[n]"-start blocks. */
function bracketRuns(blocks: Block[], covered: (i: number) => boolean): Section[] {
  const out: Section[] = []
  let i = 0
  while (i < blocks.length) {
    if (covered(i) || !/^\s*\[\d{1,3}\]/.test(blocks[i].text)) {
      i++
      continue
    }
    let j = i
    let expected = parseInt(blocks[i].text.match(/^\s*\[(\d{1,3})\]/)![1], 10)
    while (j < blocks.length && !covered(j)) {
      const mm = blocks[j].text.match(/^\s*\[(\d{1,3})\]/)
      if (!mm || parseInt(mm[1], 10) !== expected) break
      expected++
      j++
    }
    if (j - i >= 4) out.push({ start: i, end: j - 1 })
    i = Math.max(j, i + 1)
  }
  return out
}

/**
 * Extract the paper's reference list. Detects every genuine reference section —
 * tolerant of numbered/prefixed headings, references that are not the last
 * section, and per-page running "References" headers — and concatenates them so
 * papers with supplementary references keep all entries.
 */
export function extractReferences(blocks: Block[]): Reference[] {
  const accepted: Section[] = []
  let consumedUntil = -1

  for (let h = 0; h < blocks.length; h++) {
    if (h <= consumedUntil || !isRefHeading(blocks[h])) continue
    const sec = growSection(blocks, h)
    if (!sec) continue
    const slice = sectionSlice(blocks, sec)
    const likeCount = slice.filter((b) => LIKE(b.text)).length
    const entries = splitSection(slice)
    if (likeCount >= 2 || entries.length >= 2) {
      accepted.push(sec)
      consumedUntil = sec.end
    }
  }

  // Heading-less rescue: long runs of "[n]"-numbered blocks not already covered.
  const isCovered = (i: number): boolean => accepted.some((s) => i >= s.start - 1 && i <= s.end)
  for (const run of bracketRuns(blocks, isCovered)) accepted.push(run)
  accepted.sort((a, b) => a.start - b.start)

  // Concatenate, then drop adjacent duplicates (residual running-header noise).
  const refs: Reference[] = []
  for (const sec of accepted) {
    const slice = sectionSlice(blocks, sec)
    for (const r of splitSection(slice)) {
      const prev = refs[refs.length - 1]
      if (prev && norm(prev.text) === norm(r.text)) continue
      refs.push(r)
    }
  }
  return refs
}
