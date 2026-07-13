import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { pdfjs } from '@renderer/pdf/pdf'
import type { Block, BBox } from '@shared/types'
import { cn } from '@renderer/lib/cn'

interface Props {
  doc: PDFDocumentProxy
  pageNum: number
  /** CSS pixels per PDF point. */
  scale: number
  width: number // unscaled page width (pts)
  height: number // unscaled page height (pts)
  blocks: Block[]
  activeId: string | null
  hoverId: string | null
  selectedIds: string[]
  searchId: string | null
  /** Tight search-highlight rects (PDF coords) for this page's matched text. */
  highlightRects: BBox[]
  onPick: (id: string, additive: boolean, range: boolean) => void
  onHover: (id: string | null) => void
}

/** A single PDF page: canvas rendered lazily when scrolled near, a selectable
 * text layer over it, plus block overlays that drive the left↔right highlight. */
export default function PdfPage({
  doc,
  pageNum,
  scale,
  width,
  height,
  blocks,
  activeId,
  hoverId,
  selectedIds,
  searchId,
  highlightRects,
  onPick,
  onHover
}: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  // Scale the canvas bitmap was last rasterized at; null until first render.
  // Tracked (rather than a boolean) so zooming re-renders at the new resolution
  // instead of CSS-stretching a stale low-res bitmap (blurry text).
  const renderedScale = useRef<number | null>(null)
  // The text layer is positioned with `calc(var(--scale-factor) * …)`, so it is
  // rendered once and zoom just updates the CSS variable — no re-render needed.
  const textRendered = useRef(false)
  const lastHover = useRef<string | null>(null)

  // Render when the page scrolls near the viewport.
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && setVisible(true),
      { rootMargin: '600px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible || renderedScale.current === scale) return
    const canvas = canvasRef.current
    if (!canvas) return
    let cancelled = false
    let task: { cancel: () => void } | null = null
    ;(async () => {
      const page = await doc.getPage(pageNum)
      if (cancelled) return
      const dpr = window.devicePixelRatio || 1
      // Rasterize at the on-screen resolution (scale × dpr), but cap the backing
      // store so very high zoom on HiDPI displays can't exceed the browser's
      // canvas area limit (which would render blank).
      const MAX_AREA = 16_777_216 // 4096²
      let renderScale = scale * dpr
      const area = width * height * renderScale * renderScale
      if (area > MAX_AREA) renderScale *= Math.sqrt(MAX_AREA / area)
      const viewport = page.getViewport({ scale: renderScale })
      const ctx = canvas.getContext('2d')!
      canvas.width = viewport.width
      canvas.height = viewport.height
      task = page.render({ canvasContext: ctx, viewport })
      try {
        await (task as any).promise
        renderedScale.current = scale
      } catch {
        /* render cancelled */
      }
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, doc, pageNum, scale, width, height])

  // Render the selectable text layer once (positions scale via --scale-factor).
  useEffect(() => {
    if (!visible || textRendered.current) return
    const container = textRef.current
    if (!container) return
    let cancelled = false
    let layer: { cancel?: () => void } | null = null
    ;(async () => {
      const page = await doc.getPage(pageNum)
      if (cancelled) return
      const textContentSource = await page.getTextContent()
      if (cancelled) return
      container.replaceChildren()
      layer = new pdfjs.TextLayer({
        textContentSource,
        container,
        viewport: page.getViewport({ scale })
      })
      try {
        await (layer as any).render()
        textRendered.current = true
      } catch {
        /* render cancelled */
      }
    })()
    return () => {
      cancelled = true
      layer?.cancel?.()
    }
    // scale intentionally excluded: the layer is scaled via --scale-factor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, doc, pageNum])

  // Which block (if any) sits under a pointer event, via bbox hit-testing.
  const blockAt = (e: { clientX: number; clientY: number }): string | null => {
    const host = hostRef.current
    if (!host) return null
    const r = host.getBoundingClientRect()
    const px = (e.clientX - r.left) / scale
    const py = (e.clientY - r.top) / scale
    for (const b of blocks) {
      const [x, y, w, h] = b.bbox
      if (px >= x && px <= x + w && py >= y && py <= y + h) return b.id
    }
    return null
  }

  const onClick = (e: React.MouseEvent): void => {
    // Don't hijack a click that finished a text selection (drag-to-select).
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed && sel.toString().trim()) return
    const id = blockAt(e)
    if (id) onPick(id, e.ctrlKey || e.metaKey, e.shiftKey)
  }

  const onMouseMove = (e: React.MouseEvent): void => {
    const id = blockAt(e)
    if (id !== lastHover.current) {
      lastHover.current = id
      onHover(id)
    }
  }

  const onMouseLeave = (): void => {
    if (lastHover.current !== null) {
      lastHover.current = null
      onHover(null)
    }
  }

  return (
    <div
      ref={hostRef}
      className="relative mx-auto bg-white shadow-sm ring-1 ring-border"
      style={{ width: width * scale, height: height * scale }}
      data-page={pageNum}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ width: width * scale, height: height * scale }}
      />
      {/* block overlays — visual only; interaction is hit-tested on the host so
          the text layer above stays selectable */}
      {blocks.map((b) => {
        const [x, y, w, h] = b.bbox
        const active = b.id === activeId
        const selected = selectedIds.includes(b.id)
        const hover = b.id === hoverId
        // Box-highlight the matched paragraph only as a fallback when we
        // couldn't locate the exact text fragments.
        const searchHit = b.id === searchId && highlightRects.length === 0
        return (
          <div
            key={b.id}
            data-block={b.id}
            className={cn(
              'pointer-events-none absolute rounded-sm transition-colors',
              searchHit
                ? 'bg-amber-300/40 ring-2 ring-amber-400'
                : active
                  ? 'bg-accent/25 ring-1 ring-accent'
                  : selected
                    ? 'bg-accent/20 ring-1 ring-accent/50'
                    : hover
                      ? 'bg-accent/10'
                      : ''
            )}
            style={{
              left: x * scale,
              top: y * scale,
              width: w * scale,
              height: h * scale
            }}
          />
        )
      })}

      {/* selectable text layer (transparent), above the block overlays */}
      <div
        ref={textRef}
        className="textLayer"
        style={{ '--scale-factor': scale } as CSSProperties}
      />

      {/* tight highlights over the exact matched search text */}
      {highlightRects.map(([x, y, w, h], i) => (
        <div
          key={`hl${i}`}
          className="pointer-events-none absolute z-[3] rounded-[1px] bg-amber-300/50 ring-1 ring-amber-400"
          style={{ left: x * scale, top: y * scale, width: w * scale, height: h * scale }}
        />
      ))}
    </div>
  )
}
