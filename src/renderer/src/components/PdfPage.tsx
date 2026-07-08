import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Block } from '@shared/types'
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
  onPick: (id: string, additive: boolean, range: boolean) => void
  onHover: (id: string | null) => void
}

/** A single PDF page: canvas rendered lazily when scrolled near, plus clickable
 * block overlays that drive the left↔right highlight. */
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
  onPick,
  onHover
}: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [visible, setVisible] = useState(false)
  // Scale the canvas bitmap was last rasterized at; null until first render.
  // Tracked (rather than a boolean) so zooming re-renders at the new resolution
  // instead of CSS-stretching a stale low-res bitmap (blurry text).
  const renderedScale = useRef<number | null>(null)

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

  return (
    <div
      ref={hostRef}
      className="relative mx-auto bg-white shadow-sm ring-1 ring-border"
      style={{ width: width * scale, height: height * scale }}
      data-page={pageNum}
    >
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        style={{ width: width * scale, height: height * scale }}
      />
      {/* block overlays */}
      {blocks.map((b) => {
        const [x, y, w, h] = b.bbox
        const active = b.id === activeId
        const selected = selectedIds.includes(b.id)
        const hover = b.id === hoverId
        return (
          <div
            key={b.id}
            data-block={b.id}
            onClick={(e) => onPick(b.id, e.ctrlKey || e.metaKey, e.shiftKey)}
            onMouseEnter={() => onHover(b.id)}
            onMouseLeave={() => onHover(null)}
            className={cn(
              'absolute cursor-pointer rounded-sm transition-colors',
              active
                ? 'bg-accent/25 ring-1 ring-accent'
                : selected
                  ? 'bg-accent/20 ring-1 ring-accent/50'
                  : hover
                    ? 'bg-accent/10'
                    : 'hover:bg-accent/10'
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
    </div>
  )
}
