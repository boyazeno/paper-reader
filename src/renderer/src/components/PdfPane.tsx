import { useEffect, useMemo, useRef, useState } from 'react'
import { ZoomIn, ZoomOut } from 'lucide-react'
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
