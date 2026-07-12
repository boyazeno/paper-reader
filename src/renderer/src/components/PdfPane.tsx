import { useEffect, useMemo, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import type { BBox } from '@shared/types'
import { loadPdf, type PDFDocumentProxy } from '@renderer/pdf/pdf'
import { extractBlocks } from '@renderer/pdf/extract'
import { useStore } from '@renderer/store'
import { useTab, useTabActions, useTabId } from '@renderer/lib/tab'
import { centerInScroll } from '@renderer/lib/scroll'
import { Spinner } from './ui'
import PdfPage from './PdfPage'

interface PageSize {
  width: number
  height: number
}

/** Zoom levels relative to fit-to-width (100% = fits the column). */
const ZOOM_LEVELS = [1, 1.25, 1.5, 1.75, 2]

const NO_RECTS: BBox[] = []

/**
 * Bounding rects (PDF coords) of the text fragments that cover `query` inside a
 * block's bbox — for tight search highlighting over the rasterized page. Uses
 * pdf.js text-fragment positions (the same transform math as extract.ts).
 */
function matchRectsInBlock(
  items: { str?: string; transform: number[]; width: number; height?: number }[],
  pageHeight: number,
  bbox: BBox,
  query: string
): BBox[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const [bx, by, bw, bh] = bbox
  const frags: { str: string; x: number; y: number; w: number; h: number }[] = []
  for (const it of items) {
    if (!it.str) continue
    const h = Math.abs(it.transform[3]) || it.height || 10
    const x = it.transform[4]
    const y = pageHeight - it.transform[5] - h
    const w = it.width
    // keep only fragments overlapping this block's box
    if (y + h < by - 2 || y > by + bh + 2) continue
    if (x + w < bx - 2 || x > bx + bw + 2) continue
    frags.push({ str: it.str, x, y, w, h })
  }
  frags.sort((a, b) => a.y - b.y || a.x - b.x)

  // Concatenate fragment text (spaced), tracking each char's fragment + offset
  // within it, so a match can be narrowed to a sub-rect of its fragment (pdf.js
  // often returns multi-word runs; proportional char widths approximate glyphs).
  let joined = ''
  const cf: number[] = [] // fragment index per char (-1 = inserted separator)
  const ci: number[] = [] // char index within that fragment
  frags.forEach((f, fi) => {
    if (joined) {
      joined += ' '
      cf.push(-1)
      ci.push(-1)
    }
    for (let k = 0; k < f.str.length; k++) {
      joined += f.str[k]
      cf.push(fi)
      ci.push(k)
    }
  })

  const low = joined.toLowerCase()
  const rects: BBox[] = []
  for (let idx = low.indexOf(q); idx !== -1; idx = low.indexOf(q, idx + q.length)) {
    const end = idx + q.length
    let k = idx
    while (k < end) {
      const fi = cf[k]
      if (fi < 0) {
        k++
        continue
      }
      const start = k
      while (k < end && cf[k] === fi) k++
      const f = frags[fi]
      const len = f.str.length || 1
      const c0 = ci[start]
      const c1 = ci[k - 1] + 1
      rects.push([f.x + (c0 / len) * f.w, f.y, ((c1 - c0) / len) * f.w, f.h])
    }
  }
  return rects
}

/** Left column: renders the original PDF and owns the highlight overlay. */
export default function PdfPane({ pdfPath }: { pdfPath: string }): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [sizes, setSizes] = useState<PageSize[]>([])
  const [fitScale, setFitScale] = useState(1)
  const [zoom, setZoom] = useState(1)
  const scale = fitScale * zoom
  const [status, setStatus] = useState<'loading' | 'extracting' | 'ready' | 'error'>(
    'loading'
  )

  const tabId = useTabId()
  const blocks = useTab((t) => t?.project.blocks ?? [])
  const activeId = useTab((t) => t?.activeBlockId ?? null)
  const hoverId = useTab((t) => t?.hoverBlockId ?? null)
  const selectedIds = useTab((t) => t?.selectedBlockIds ?? [])
  const searchId = useTab((t) => t?.searchMatchId ?? null)
  const searchQuery = useTab((t) => t?.searchQuery ?? '')
  const [hl, setHl] = useState<{ page: number; rects: BBox[] } | null>(null)
  const restore = useTab((t) => t?.restore ?? null)
  const restoredRef = useRef(false)
  const { setBlocks, selectBlock, setHoverBlock: setHover } = useTabActions()

  // Load document + page sizes + extract blocks.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const bytes = await window.api.project.readPdf(pdfPath)
        const d = await loadPdf(bytes)
        if (cancelled) return
        const ps: PageSize[] = []
        for (let p = 1; p <= d.numPages; p++) {
          const vp = (await d.getPage(p)).getViewport({ scale: 1 })
          ps.push({ width: vp.width, height: vp.height })
        }
        if (cancelled) return
        setDoc(d)
        setSizes(ps)
        // Skip extraction when blocks were restored from a saved project.
        const existing = useStore.getState().tabs[tabId]?.project.blocks ?? []
        if (existing.length === 0) {
          setStatus('extracting')
          const extracted = await extractBlocks(d)
          if (cancelled) return
          setBlocks(extracted)
        }
        setStatus('ready')
      } catch (e) {
        console.error('PDF load failed', e)
        if (!cancelled) setStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdfPath, setBlocks, tabId])

  // Fit page width to the column (this is the 100% baseline; zoom scales it up).
  useEffect(() => {
    const el = scrollRef.current
    if (!el || sizes.length === 0) return
    const fit = (): void => {
      // Skip while the tab is hidden (display:none → clientWidth 0), else we'd
      // clobber the saved fit with a bogus tiny scale.
      if (el.clientWidth === 0) return
      const avail = el.clientWidth - 48 // padding
      setFitScale(Math.max(0.2, avail / sizes[0].width))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [sizes])

  const stepZoom = (dir: 1 | -1): void =>
    setZoom((z) => {
      const i = ZOOM_LEVELS.indexOf(z)
      return ZOOM_LEVELS[Math.max(0, Math.min(ZOOM_LEVELS.length - 1, i + dir))]
    })

  // Ctrl/⌘ + wheel to zoom.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      stepZoom(e.deltaY < 0 ? 1 : -1)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Scroll the active block into view when the user clicks a paragraph (the
  // panes scroll independently otherwise — no scroll-linking).
  useEffect(() => {
    if (!activeId) return
    const container = scrollRef.current
    if (!container) return
    // Defer to next frame so layout (canvas/scale) has settled.
    const raf = requestAnimationFrame(() => {
      const el = container.querySelector(`[data-block="${activeId}"]`)
      if (el) centerInScroll(container, el)
    })
    return () => cancelAnimationFrame(raf)
  }, [activeId, scale])

  // Scroll the current search hit into view.
  useEffect(() => {
    if (!searchId) return
    const container = scrollRef.current
    if (!container) return
    const raf = requestAnimationFrame(() => {
      const el = container.querySelector(`[data-block="${searchId}"]`)
      if (el) centerInScroll(container, el)
    })
    return () => cancelAnimationFrame(raf)
  }, [searchId, scale])

  // Apply the saved scroll offset once when restoring from a session.
  useEffect(() => {
    if (restoredRef.current || status !== 'ready' || !restore) return
    restoredRef.current = true
    const el = scrollRef.current
    if (el) el.scrollTop = restore.pdf
  }, [status, restore])

  // Compute tight highlight rects for the current search hit's exact text.
  useEffect(() => {
    if (!doc || !searchId || !searchQuery.trim()) {
      setHl(null)
      return
    }
    const block = blocks.find((b) => b.id === searchId)
    if (!block) {
      setHl(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const page = await doc.getPage(block.page)
        const vp = page.getViewport({ scale: 1 })
        const content = await page.getTextContent()
        const rects = matchRectsInBlock(
          content.items as { str?: string; transform: number[]; width: number }[],
          vp.height,
          block.bbox,
          searchQuery
        )
        if (!cancelled) setHl(rects.length ? { page: block.page, rects } : null)
      } catch {
        if (!cancelled) setHl(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [doc, searchId, searchQuery, blocks])

  const blocksByPage = useMemo(() => {
    const m = new Map<number, typeof blocks>()
    for (const b of blocks) {
      const arr = m.get(b.page) ?? []
      arr.push(b)
      m.set(b.page, arr)
    }
    return m
  }, [blocks])

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div
        ref={scrollRef}
        data-tour="original"
        data-scroll="pdf"
        className="min-h-0 flex-1 overflow-auto bg-bg px-6 py-6"
      >
        {status !== 'ready' && status !== 'error' && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
            <Spinner />
            {status === 'loading' ? 'Loading PDF…' : 'Extracting paragraphs…'}
          </div>
        )}
        {status === 'error' && (
          <div className="py-10 text-center text-sm text-red-400">
            Could not open this PDF.
          </div>
        )}
        {/* w-fit + mx-auto: centered when it fits, scrollable from the left when zoomed */}
        <div className="mx-auto flex w-fit flex-col items-center gap-6">
          {doc &&
            sizes.map((s, i) => (
              <PdfPage
                key={i}
                doc={doc}
                pageNum={i + 1}
                scale={scale}
                width={s.width}
                height={s.height}
                blocks={blocksByPage.get(i + 1) ?? []}
                activeId={activeId}
                hoverId={hoverId}
                selectedIds={selectedIds}
                searchId={searchId}
                highlightRects={hl && hl.page === i + 1 ? hl.rects : NO_RECTS}
                onPick={selectBlock}
                onHover={setHover}
              />
            ))}
        </div>
      </div>

      {status === 'ready' && (
        <div className="absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-lg border border-border bg-surface/95 p-0.5 shadow-md backdrop-blur">
          <button
            onClick={() => stepZoom(-1)}
            disabled={zoom <= ZOOM_LEVELS[0]}
            title="Zoom out"
            className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-border/50 disabled:opacity-40"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <select
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            title="Zoom"
            className="h-7 rounded bg-transparent px-1 text-xs text-fg outline-none"
          >
            {ZOOM_LEVELS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
          <button
            onClick={() => stepZoom(1)}
            disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
            title="Zoom in"
            className="grid h-7 w-7 place-items-center rounded text-muted hover:bg-border/50 disabled:opacity-40"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
