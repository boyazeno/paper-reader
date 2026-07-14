import { useRef, useState } from 'react'

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Touch-drag a rectangle over the PDF; crop that region straight from the
 * rendered page canvas(es) into a PNG. Replaces the desktop full-screen capture
 * — the "screenshot" is the actual PDF pixels under the selection.
 */
export default function PdfCropOverlay({
  onDone,
  onCancel
}: {
  onDone: (bytes: Uint8Array) => void
  onCancel: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const [drag, setDrag] = useState<Rect | null>(null)

  const local = (t: { clientX: number; clientY: number }): { x: number; y: number } => {
    const r = ref.current!.getBoundingClientRect()
    return { x: t.clientX - r.left, y: t.clientY - r.top }
  }

  const onTouchStart = (e: React.TouchEvent): void => {
    const p = local(e.touches[0])
    start.current = p
    setDrag({ x: p.x, y: p.y, w: 0, h: 0 })
  }
  const onTouchMove = (e: React.TouchEvent): void => {
    if (!start.current) return
    e.preventDefault()
    const p = local(e.touches[0])
    setDrag({
      x: Math.min(start.current.x, p.x),
      y: Math.min(start.current.y, p.y),
      w: Math.abs(p.x - start.current.x),
      h: Math.abs(p.y - start.current.y)
    })
  }

  const onTouchEnd = async (): Promise<void> => {
    const box = ref.current!.getBoundingClientRect()
    const d = drag
    start.current = null
    setDrag(null)
    if (!d || d.w < 8 || d.h < 8) return onCancel()

    // Selection in viewport (client) coords.
    const selL = box.left + d.x
    const selT = box.top + d.y
    const out = document.createElement('canvas')
    out.width = Math.round(d.w)
    out.height = Math.round(d.h)
    const ctx = out.getContext('2d')!
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)

    // Composite the overlapping part of each rendered page canvas.
    let drew = false
    for (const cv of Array.from(document.querySelectorAll('[data-page] canvas')) as HTMLCanvasElement[]) {
      const cr = cv.getBoundingClientRect()
      const ix = Math.max(selL, cr.left)
      const iy = Math.max(selT, cr.top)
      const ix2 = Math.min(selL + d.w, cr.right)
      const iy2 = Math.min(selT + d.h, cr.bottom)
      if (ix2 <= ix || iy2 <= iy) continue // no overlap
      const sx = ((ix - cr.left) / cr.width) * cv.width
      const sy = ((iy - cr.top) / cr.height) * cv.height
      const sw = ((ix2 - ix) / cr.width) * cv.width
      const sh = ((iy2 - iy) / cr.height) * cv.height
      ctx.drawImage(cv, sx, sy, sw, sh, ix - selL, iy - selT, ix2 - ix, iy2 - iy)
      drew = true
    }
    if (!drew) return onCancel()
    const blob: Blob = await new Promise((res) => out.toBlob((b) => res(b!), 'image/png'))
    onDone(new Uint8Array(await blob.arrayBuffer()))
  }

  return (
    <div
      ref={ref}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className="absolute inset-0 z-50 touch-none bg-black/30"
    >
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <span className="rounded-full bg-black/70 px-3 py-1 text-xs text-white">
          Drag over the PDF to capture a region
        </span>
      </div>
      <button
        onClick={onCancel}
        className="absolute right-3 top-3 rounded-full bg-black/70 px-3 py-1 text-xs text-white"
      >
        Cancel
      </button>
      {drag && (
        <div
          className="absolute border-2 border-accent bg-accent/20"
          style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}
        />
      )}
    </div>
  )
}
