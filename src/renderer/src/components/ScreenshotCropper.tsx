import { useEffect, useRef, useState } from 'react'
import { Spinner } from './ui'

interface Shot {
  dataUrl: string
  width: number
  height: number
}
interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Full-window overlay: grabs a screenshot of the primary display, lets the user
 * drag a rectangle, and returns the cropped region as PNG bytes.
 */
export default function ScreenshotCropper({
  onDone,
  onCancel
}: {
  onDone: (bytes: Uint8Array) => void
  onCancel: () => void
}): JSX.Element {
  const [shot, setShot] = useState<Shot | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [layout, setLayout] = useState<{ scale: number; ox: number; oy: number } | null>(
    null
  )
  const [drag, setDrag] = useState<Rect | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    window.api.capture.screen().then(setShot).catch(onCancel)
  }, [onCancel])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  // Compute the contained-image rect so selection maps back to source pixels.
  useEffect(() => {
    if (!shot || !containerRef.current) return
    const fit = (): void => {
      const c = containerRef.current!
      const W = c.clientWidth
      const H = c.clientHeight
      const scale = Math.min(W / shot.width, H / shot.height)
      setLayout({
        scale,
        ox: (W - shot.width * scale) / 2,
        oy: (H - shot.height * scale) / 2
      })
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [shot])

  const onMouseDown = (e: React.MouseEvent): void => {
    const rect = containerRef.current!.getBoundingClientRect()
    start.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    setDrag({ x: start.current.x, y: start.current.y, w: 0, h: 0 })
  }
  const onMouseMove = (e: React.MouseEvent): void => {
    if (!start.current) return
    const rect = containerRef.current!.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    setDrag({
      x: Math.min(start.current.x, cx),
      y: Math.min(start.current.y, cy),
      w: Math.abs(cx - start.current.x),
      h: Math.abs(cy - start.current.y)
    })
  }
  const onMouseUp = async (): Promise<void> => {
    start.current = null
    if (!shot || !layout || !drag || drag.w < 6 || drag.h < 6) {
      setDrag(null)
      return
    }
    // Map displayed selection -> source pixels.
    const sx = (drag.x - layout.ox) / layout.scale
    const sy = (drag.y - layout.oy) / layout.scale
    const sw = drag.w / layout.scale
    const sh = drag.h / layout.scale

    const img = new Image()
    img.src = shot.dataUrl
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(sw))
    canvas.height = Math.max(1, Math.round(sh))
    canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), 'image/png'))
    onDone(new Uint8Array(await blob.arrayBuffer()))
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      className="fixed inset-0 z-[60] cursor-crosshair select-none bg-black/70"
    >
      {!shot && (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-white">
          <Spinner /> Capturing screen…
        </div>
      )}
      {shot && layout && (
        <img
          src={shot.dataUrl}
          draggable={false}
          style={{
            position: 'absolute',
            left: layout.ox,
            top: layout.oy,
            width: shot.width * layout.scale,
            height: shot.height * layout.scale
          }}
        />
      )}
      {drag && (
        <div
          className="absolute border-2 border-accent bg-accent/20"
          style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}
        />
      )}
      <div className="pointer-events-none absolute inset-x-0 top-4 text-center text-sm text-white/90">
        Drag to select a region · Esc to cancel
      </div>
    </div>
  )
}
