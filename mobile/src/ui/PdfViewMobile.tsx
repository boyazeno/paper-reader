import { useEffect, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
import { loadPdf, type PDFDocumentProxy } from '@renderer/pdf/pdf'
import { extractBlocks } from '@renderer/pdf/extract'
import { useStore } from '@renderer/store'
import { useTab, useTabActions } from '@renderer/lib/tab'
import { centerInScroll } from '@renderer/lib/scroll'
import PdfPage from '@renderer/components/PdfPage'
import { useLongPress } from './useLongPress'

interface PageSize {
  width: number
  height: number
}

const NO_RECTS: [number, number, number, number][] = []
const MIN_ZOOM = 0.5
const MAX_ZOOM = 4

/**
 * Mobile PDF view: reuses the desktop <PdfPage> (canvas + selectable text layer
 * + block overlays + bbox hit-test) in a single scrollable column, with
 * pinch-to-zoom instead of Ctrl+wheel. Tapping a block selects it and (via the
 * shared store) lets the translation view scroll to the same paragraph.
 */
export default function PdfViewMobile({
  visible,
  selecting,
  onLongPressBlock
}: {
  visible: boolean
  selecting: boolean
  onLongPressBlock: (id: string) => void
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [sizes, setSizes] = useState<PageSize[]>([])
  const [fitScale, setFitScale] = useState(1)
  const [zoom, setZoom] = useState(1)
  const scale = fitScale * zoom

  const pdfPath = useTab((t) => t?.project.pdfPath ?? '')
  const meta = useTab((t) => t?.project.meta)
  const [downloading, setDownloading] = useState(false)
  const tabId = useStore((s) => s.activeTabId)
  const blocks = useTab((t) => t?.project.blocks ?? [])
  const activeId = useTab((t) => t?.activeBlockId ?? null)
  const hoverId = useTab((t) => t?.hoverBlockId ?? null)
  const selectedIds = useTab((t) => t?.selectedBlockIds ?? [])
  const restore = useTab((t) => t?.restore ?? null)
  const restored = useRef(false)
  const { setBlocks, selectBlock, setHoverBlock } = useTabActions()

  // Load the PDF + page sizes, then extract paragraph blocks if none saved.
  // If the PDF is missing (kept out of git for re-fetchable papers), re-download
  // the original first.
  useEffect(() => {
    if (!pdfPath) return
    let cancelled = false
    ;(async () => {
      let bytes: Uint8Array
      try {
        bytes = await window.api.project.readPdf(pdfPath)
      } catch (missing) {
        if (!meta?.pdfUrl) throw missing
        if (!cancelled) setDownloading(true)
        await window.api.intake.refetch(pdfPath, meta.pdfUrl)
        bytes = await window.api.project.readPdf(pdfPath)
        if (!cancelled) setDownloading(false)
      }
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
      const existing = useStore.getState().tabs[tabId ?? '']?.project.blocks ?? []
      if (existing.length === 0) {
        const extracted = await extractBlocks(d)
        if (!cancelled) setBlocks(extracted)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pdfPath, tabId, setBlocks, meta?.pdfUrl])

  // Apply the saved scroll offset once when restoring a session.
  useEffect(() => {
    if (restored.current || !restore || !doc) return
    restored.current = true
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = restore.pdf
    })
  }, [restore, doc])

  // Fit page width to the viewport (100% baseline; pinch/buttons scale it up).
  useEffect(() => {
    const el = scrollRef.current
    if (!el || sizes.length === 0) return
    const fit = (): void => {
      if (el.clientWidth === 0) return
      setFitScale(Math.max(0.2, (el.clientWidth - 24) / sizes[0].width))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [sizes])

  // Re-center the active block when this view becomes visible (a hidden view
  // has no layout, so the centering must run on show — same idea as restore).
  useEffect(() => {
    if (!visible || !activeId) return
    const container = scrollRef.current
    if (!container) return
    const raf = requestAnimationFrame(() => {
      const el = container.querySelector(`[data-block="${activeId}"]`)
      if (el) centerInScroll(container, el)
    })
    return () => cancelAnimationFrame(raf)
  }, [visible, activeId, scale])

  // Pinch-to-zoom: adjust the continuous zoom by the ratio of finger distance.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    let startDist = 0
    let startZoom = 1
    const dist = (t: TouchList): number => {
      const dx = t[0].clientX - t[1].clientX
      const dy = t[0].clientY - t[1].clientY
      return Math.hypot(dx, dy)
    }
    const onStart = (e: TouchEvent): void => {
      if (e.touches.length === 2) {
        startDist = dist(e.touches)
        startZoom = zoom
      }
    }
    const onMove = (e: TouchEvent): void => {
      if (e.touches.length === 2 && startDist > 0) {
        e.preventDefault()
        const ratio = dist(e.touches) / startDist
        setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, startZoom * ratio)))
      }
    }
    const onEnd = (e: TouchEvent): void => {
      if (e.touches.length < 2) startDist = 0
    }
    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [zoom])

  const step = (d: number): void => setZoom((z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + d)))
  // Block overlays are pointer-events:none, so long-press hit-tests bboxes (same
  // math as PdfPage.blockAt) against the page under the finger.
  const resolveBlock = (x: number, y: number): string | null => {
    const page = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest('[data-page]') as HTMLElement | null
    if (!page) return null
    const pageNum = Number(page.getAttribute('data-page'))
    const r = page.getBoundingClientRect()
    const px = (x - r.left) / scale
    const py = (y - r.top) / scale
    for (const b of blocks) {
      if (b.page !== pageNum) continue
      const [bx, by, bw, bh] = b.bbox
      if (px >= bx && px <= bx + bw && py >= by && py <= by + bh) return b.id
    }
    return null
  }
  const longPress = useLongPress(resolveBlock, onLongPressBlock)

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        data-scroll="pdf"
        className="h-full overflow-auto overscroll-contain bg-bg px-3 py-3"
        style={{ touchAction: 'pan-x pan-y' }}
        {...longPress}
      >
        {!doc && (
          <div className="py-10 text-center text-sm text-muted">
            {downloading
              ? `Downloading original PDF${meta?.pdfSize ? ` (${(meta.pdfSize / 1e6).toFixed(1)} MB)` : ''}…`
              : 'Loading PDF…'}
          </div>
        )}
        <div className="mx-auto flex w-fit flex-col items-center gap-4">
          {doc &&
            sizes.map((s, i) => (
              <PdfPage
                key={i}
                doc={doc}
                pageNum={i + 1}
                scale={scale}
                width={s.width}
                height={s.height}
                blocks={blocks.filter((b) => b.page === i + 1)}
                activeId={activeId}
                hoverId={hoverId}
                selectedIds={selectedIds}
                searchId={null}
                highlightRects={NO_RECTS}
                onPick={(id, additive, range) => selectBlock(id, selecting || additive, range)}
                onHover={setHoverBlock}
              />
            ))}
        </div>
      </div>

      <div className="absolute bottom-20 right-3 z-20 flex items-center gap-1 rounded-lg border border-border bg-surface/95 p-1 shadow-md backdrop-blur">
        <button
          onClick={() => step(-0.25)}
          className="grid h-8 w-8 place-items-center rounded text-muted"
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <span className="w-12 text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
        <button
          onClick={() => step(0.25)}
          className="grid h-8 w-8 place-items-center rounded text-muted"
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
