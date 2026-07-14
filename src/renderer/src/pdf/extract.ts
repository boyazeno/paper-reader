import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Block, BBox } from '@shared/types'

/**
 * Paragraph extraction with two-column awareness.
 *
 * Each column in a real paper flows independently, so left/right lines rarely
 * share a baseline — we therefore detect columns from the horizontal *extent*
 * of lines, not from gaps within a single row:
 *   1. convert pdfjs items to top-left rects, cluster into raw lines by y,
 *   2. pre-split any line that does contain a wide gutter gap (handles the rare
 *      shared-baseline case) so every segment belongs to one column,
 *   3. find the column split x that best separates segments into a left set
 *      (right edge ≤ split) and a right set (left edge ≥ split) with few
 *      straddlers — full-width titles/headers/figures are the straddlers,
 *   4. emit reading order: full-width lines delimit bands; within a band the
 *      whole left column precedes the whole right column,
 *   5. group consecutive same-column lines into paragraphs.
 *
 * Single-column pages produce no valid split and read top-to-bottom as before.
 */

type Col = 'left' | 'right' | 'full' | 'single'

interface Item {
  str: string
  x: number
  y: number // top
  w: number
  h: number
}

interface Line {
  items: Item[]
  x: number
  y: number
  right: number
  bottom: number
  h: number
  col: Col
}

function rectUnion(rects: { x: number; y: number; w: number; h: number }[]): BBox {
  const x0 = Math.min(...rects.map((r) => r.x))
  const y0 = Math.min(...rects.map((r) => r.y))
  const x1 = Math.max(...rects.map((r) => r.x + r.w))
  const y1 = Math.max(...rects.map((r) => r.y + r.h))
  return [x0, y0, x1 - x0, y1 - y0]
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

/** Body left margin = the leftmost frequently-used line start, so first-line
 * indents (a less-common start further right) can be told apart from it. */
function bodyMargin(xs: number[], binW: number): number {
  const bins = new Map<number, number>()
  for (const x of xs) {
    const b = Math.round(x / binW)
    bins.set(b, (bins.get(b) ?? 0) + 1)
  }
  const maxCount = Math.max(...bins.values())
  const frequent = [...bins.keys()].filter((b) => (bins.get(b) as number) >= maxCount * 0.5)
  return Math.min(...frequent) * binW
}

// ---- math-aware line reconstruction (offline heuristics) ----

/** Common math Unicode → LaTeX, so a detected `$…$` run renders in KaTeX. */
const MATH_SYM: Record<string, string> = {
  '∫': '\\int', '∮': '\\oint', '∑': '\\sum', '∏': '\\prod', '√': '\\sqrt{}',
  '∞': '\\infty', '∂': '\\partial', '∇': '\\nabla', '∆': '\\Delta',
  '±': '\\pm', '∓': '\\mp', '×': '\\times', '÷': '\\div', '·': '\\cdot', '∗': '*',
  '≤': '\\leq', '≥': '\\geq', '≠': '\\neq', '≈': '\\approx', '≡': '\\equiv',
  '∝': '\\propto', '∼': '\\sim', '≪': '\\ll', '≫': '\\gg',
  '→': '\\to', '←': '\\leftarrow', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow',
  '⇐': '\\Leftarrow', '⇔': '\\Leftrightarrow', '↦': '\\mapsto',
  '∈': '\\in', '∉': '\\notin', '∋': '\\ni', '⊂': '\\subset', '⊆': '\\subseteq',
  '⊃': '\\supset', '⊇': '\\supseteq', '∪': '\\cup', '∩': '\\cap', '∖': '\\setminus',
  '∀': '\\forall', '∃': '\\exists', '∄': '\\nexists', '∅': '\\emptyset',
  '¬': '\\neg', '∧': '\\wedge', '∨': '\\vee', '⊕': '\\oplus', '⊗': '\\otimes',
  '⟨': '\\langle', '⟩': '\\rangle', '‖': '\\|', '…': '\\dots', '⋯': '\\cdots',
  '∘': '\\circ', '∙': '\\bullet', '†': '\\dagger', 'ℓ': '\\ell', 'ℝ': '\\mathbb{R}',
  'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}',
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\epsilon',
  'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta', 'ι': '\\iota', 'κ': '\\kappa',
  'λ': '\\lambda', 'μ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho',
  'σ': '\\sigma', 'ς': '\\varsigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\phi',
  'ϕ': '\\phi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  'Γ': '\\Gamma', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi', 'Π': '\\Pi',
  'Σ': '\\Sigma', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega'
}

const hasSym = (s: string): boolean => [...s].some((c) => c in MATH_SYM)
const toLatex = (s: string): string => [...s].map((c) => MATH_SYM[c] ?? c).join('')
/** A short token (variable/number cluster like `x`, `mc`, `dx`) that can carry a
 * sub/superscript — capped at 3 chars so prose words don't get pulled into math
 * by a following footnote marker. */
const isVarBase = (s: string): boolean => {
  const t = s.trim()
  return t.length >= 1 && t.length <= 3 && /^[A-Za-z0-9()[\]]+$/.test(t)
}

/**
 * Reconstruct one line's text with offline math heuristics: recover
 * super/subscripts from glyph geometry (a smaller item raised/lowered from the
 * baseline → `^{…}` / `_{…}`), map math symbols to LaTeX, and wrap the detected
 * math in `$…$` so KaTeX renders it. Prose is left untouched.
 */
function lineText(line: Line): string {
  const items = line.items // sorted by x
  const n = items.length
  if (n === 0) return ''
  const baseH = median(items.map((i) => i.h)) || 10
  const bigCenters = items.filter((i) => i.h >= baseH * 0.85).map((i) => i.y + i.h / 2)
  const baseCenter = bigCenters.length
    ? median(bigCenters)
    : median(items.map((i) => i.y + i.h / 2))
  const gapThresh = baseH * 0.3
  const adjacent = (a: Item, b: Item): boolean => b.x - (a.x + a.w) <= gapThresh

  type Cls = 'base' | 'sup' | 'sub'
  const cls: Cls[] = items.map((it) => {
    const center = it.y + it.h / 2
    const small = it.h <= baseH * 0.92
    if (small && center < baseCenter - baseH * 0.22) return 'sup'
    if (small && center > baseCenter + baseH * 0.22) return 'sub'
    return 'base'
  })

  // Mark which items are "math": symbol-bearing, or a single-char base that a
  // script attaches to, then chain scripts onto a mathy predecessor.
  const mathy: boolean[] = items.map((it, i) => {
    if (hasSym(it.str)) return true
    if (cls[i] === 'base' && isVarBase(it.str)) {
      const nx = items[i + 1]
      if (nx && cls[i + 1] !== 'base' && adjacent(it, nx)) return true
    }
    return false
  })
  for (let i = 1; i < n; i++) {
    if (cls[i] !== 'base' && !mathy[i] && mathy[i - 1] && adjacent(items[i - 1], items[i])) {
      mathy[i] = true
    }
  }

  // Emit prose items and math runs as space-separated tokens (matching the
  // original word-joining), so only the math internals are tightened.
  const tokens: string[] = []
  let i = 0
  while (i < n) {
    if (!mathy[i]) {
      tokens.push(items[i].str) // prose (or a stray script after a word)
      i++
      continue
    }
    let math = ''
    let sup = ''
    let sub = ''
    const flushScripts = (): void => {
      if (sup) {
        math += `^{${sup}}`
        sup = ''
      }
      if (sub) {
        math += `_{${sub}}`
        sub = ''
      }
    }
    while (i < n && mathy[i]) {
      if (cls[i] === 'sup') sup += toLatex(items[i].str)
      else if (cls[i] === 'sub') sub += toLatex(items[i].str)
      else {
        flushScripts()
        math += toLatex(items[i].str)
      }
      i++
    }
    flushScripts()
    tokens.push(`$${math}$`)
  }
  return tokens.join(' ')
}

function makeLine(items: Item[], col: Col = 'single'): Line {
  const sorted = [...items].sort((a, b) => a.x - b.x)
  const x = Math.min(...sorted.map((i) => i.x))
  const right = Math.max(...sorted.map((i) => i.x + i.w))
  const y = Math.min(...sorted.map((i) => i.y))
  const bottom = Math.max(...sorted.map((i) => i.y + i.h))
  return { items: sorted, x, y, right, bottom, h: bottom - y, col }
}

/** Cluster items into lines by vertical-centre proximity. The line's baseline is
 * anchored on its full-size glyphs, and smaller glyphs (super/subscripts) get a
 * looser tolerance so they stay on the line instead of splitting off — which is
 * what lets the math reconstruction see them. */
function clusterLines(items: Item[], lineHeight: number): Line[] {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x)
  const groups: Item[][] = []
  let cur: Item[] = []
  let baseline = 0 // centre of the current line's full-size glyphs
  const recompute = (): void => {
    const big = cur.filter((i) => i.h >= lineHeight * 0.85).map((i) => i.y + i.h / 2)
    baseline = big.length ? median(big) : median(cur.map((i) => i.y + i.h / 2))
  }
  for (const it of sorted) {
    const c = it.y + it.h / 2
    const small = it.h < lineHeight * 0.8
    // A script (small glyph) may sit up to ~1 line-height off the baseline; a
    // full-size glyph on the next line is ~1.2 line-heights away, so this keeps
    // scripts in but doesn't merge adjacent lines.
    const tol = small ? lineHeight * 1.0 : lineHeight * 0.6
    if (cur.length && Math.abs(c - baseline) < tol) {
      cur.push(it)
      recompute()
    } else {
      if (cur.length) groups.push(cur)
      cur = [it]
      recompute()
    }
  }
  if (cur.length) groups.push(cur)
  return groups.map((g) => makeLine(g))
}

/** Split a line at its widest central gap larger than `minGap` (a shared-
 * baseline two-column row); otherwise return it unchanged. */
function preSplitAtGutter(line: Line, pageWidth: number, minGap: number): Line[] {
  const items = line.items // sorted by x
  const c0 = pageWidth * 0.28
  const c1 = pageWidth * 0.72
  let bestI = -1
  let bestGap = 0
  for (let i = 0; i < items.length - 1; i++) {
    const gapStart = items[i].x + items[i].w
    const gapEnd = items[i + 1].x
    const mid = (gapStart + gapEnd) / 2
    if (mid > c0 && mid < c1 && gapEnd - gapStart > minGap && gapEnd - gapStart > bestGap) {
      bestGap = gapEnd - gapStart
      bestI = i
    }
  }
  if (bestI < 0) return [line]
  return [makeLine(items.slice(0, bestI + 1)), makeLine(items.slice(bestI + 1))]
}

/** Split a straddling line at the gap that contains the known gutter `split`.
 * A genuine full-width line flows continuously across `split` (no real gap
 * there) and is returned unchanged. */
function splitAtKnownGutter(line: Line, split: number, minGap: number): Line[] {
  const items = line.items
  for (let i = 0; i < items.length - 1; i++) {
    const end = items[i].x + items[i].w
    const start = items[i + 1].x
    if (end <= split && start >= split) {
      return start - end > minGap
        ? [makeLine(items.slice(0, i + 1)), makeLine(items.slice(i + 1))]
        : [line]
    }
  }
  return [line] // an item spans the split → continuous full-width text
}

/**
 * Find the column split x that best separates line segments into left/right
 * with the fewest full-width straddlers, requiring both columns to be
 * populated. Returns null for single-column pages.
 */
function detectColumnSplit(segments: Line[], pageWidth: number): number | null {
  const n = segments.length
  if (n < 6) return null
  const tol = 2
  let best: number | null = null
  let bestStraddle = Infinity
  for (let s = pageWidth * 0.3; s <= pageWidth * 0.7; s += pageWidth * 0.01) {
    let left = 0
    let right = 0
    let straddle = 0
    for (const seg of segments) {
      if (seg.right <= s + tol) left++
      else if (seg.x >= s - tol) right++
      else straddle++
    }
    // Require both columns to be substantially and roughly evenly populated —
    // a lone short cluster of right-side items (tables, right-aligned numbers)
    // on a single-column page must not be mistaken for a second column.
    const balanced = Math.min(left, right) >= Math.max(left, right) * 0.5
    if (left >= n * 0.25 && right >= n * 0.25 && balanced && straddle < bestStraddle) {
      bestStraddle = straddle
      best = s
    }
  }
  // Reject when too many lines straddle (single column / mostly full-width).
  if (best == null || bestStraddle > n * 0.3) return null
  return best
}

function classify(seg: Line, split: number): Col {
  const tol = 2
  if (seg.right <= split + tol) return 'left'
  if (seg.x >= split - tol) return 'right'
  return 'full'
}

/** Reading order: within each band delimited by full-width lines, the whole
 * left column precedes the whole right column. */
function orderColumns(left: Line[], right: Line[], full: Line[]): Line[] {
  left.sort((a, b) => a.y - b.y)
  right.sort((a, b) => a.y - b.y)
  full.sort((a, b) => a.y - b.y)
  const ordered: Line[] = []
  let li = 0
  let ri = 0
  for (const f of full) {
    while (li < left.length && left[li].y < f.y) ordered.push(left[li++])
    while (ri < right.length && right[ri].y < f.y) ordered.push(right[ri++])
    ordered.push(f)
  }
  while (li < left.length) ordered.push(left[li++])
  while (ri < right.length) ordered.push(right[ri++])
  return ordered
}

async function extractPage(doc: PDFDocumentProxy, pageNum: number): Promise<Block[]> {
  const page = await doc.getPage(pageNum)
  const viewport = page.getViewport({ scale: 1 })
  const pageHeight = viewport.height
  const pageWidth = viewport.width
  const content = await page.getTextContent()

  const items: Item[] = []
  for (const it of content.items as any[]) {
    if (!('str' in it) || !it.str || !it.str.trim()) continue
    const [, , , d, e, f] = it.transform as number[]
    const h = Math.abs(d) || it.height || 10
    const yTop = pageHeight - f - h // flip to top-left origin
    items.push({ str: it.str, x: e, y: yTop, w: it.width, h })
  }
  if (items.length === 0) return []

  const lineHeight = median(items.map((i) => i.h)) || 10
  const rawLines = clusterLines(items, lineHeight)
  // First pass splits obvious wide gutters so column detection sees clean lines.
  const segments = rawLines.flatMap((l) => preSplitAtGutter(l, pageWidth, lineHeight * 1.3))
  const split = detectColumnSplit(segments, pageWidth)

  let ordered: Line[]
  if (split == null) {
    ordered = [...rawLines].sort((a, b) => a.y - b.y)
  } else {
    // Second pass: split any line still straddling the now-known gutter.
    const left: Line[] = []
    const right: Line[] = []
    const full: Line[] = []
    for (const seg of segments) {
      const parts =
        seg.x < split - 2 && seg.right > split + 2
          ? splitAtKnownGutter(seg, split, lineHeight * 0.7)
          : [seg]
      for (const p of parts) {
        p.col = classify(p, split)
        ;(p.col === 'left' ? left : p.col === 'right' ? right : full).push(p)
      }
    }
    ordered = orderColumns(left, right, full)
  }

  // --- group lines into paragraphs ---
  const blocks: Block[] = []
  let group: Line[] = []
  const flush = (): void => {
    if (group.length === 0) return
    const bbox = rectUnion(
      group.map((l) => ({ x: l.x, y: l.y, w: l.right - l.x, h: l.h }))
    )
    const text = group
      .map(lineText)
      .join(' ')
      .replace(/[ \t]+/g, ' ')
      .trim()
    if (text)
      blocks.push({ id: `p${pageNum}-b${blocks.length}`, page: pageNum, bbox, text })
    group = []
  }

  // Adaptive line gap: a paragraph break is a gap noticeably larger than the
  // document's typical intra-paragraph line spacing.
  const gaps: number[] = []
  for (let k = 1; k < ordered.length; k++) {
    const a = ordered[k - 1]
    const b = ordered[k]
    if (a.col === b.col) {
      const g = b.y - a.bottom
      if (g >= 0 && g <= lineHeight * 3) gaps.push(g)
    }
  }
  const typicalGap = gaps.length ? median(gaps) : lineHeight * 0.3
  const paraGap = typicalGap + lineHeight * 0.6
  const indentMin = lineHeight * 0.5

  // Body left margin per column, for first-line-indent detection.
  const bodyLeftByCol = new Map<Col, number>()
  for (const col of ['left', 'right', 'full', 'single'] as Col[]) {
    const xs = ordered.filter((l) => l.col === col).map((l) => l.x)
    if (xs.length) bodyLeftByCol.set(col, bodyMargin(xs, lineHeight * 0.4))
  }

  for (const ln of ordered) {
    const prev = group[group.length - 1]
    if (prev) {
      const sameCol = ln.col === prev.col
      const gap = ln.y - prev.bottom
      const bodyLeft = bodyLeftByCol.get(ln.col) ?? ln.x
      // First-line indent: indented line whose predecessor sat at the margin
      // (so hanging-indent continuation runs aren't split every line).
      const indented =
        ln.x > bodyLeft + indentMin && Math.abs(prev.x - bodyLeft) < indentMin
      if (!sameCol || gap > paraGap || gap < -lineHeight || indented) flush()
    }
    group.push(ln)
  }
  flush()
  return blocks
}

/** Extract paragraph blocks for the whole document, in reading order. */
export async function extractBlocks(doc: PDFDocumentProxy): Promise<Block[]> {
  const all: Block[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const pageBlocks = await extractPage(doc, p)
    all.push(...pageBlocks)
  }
  return all
}
