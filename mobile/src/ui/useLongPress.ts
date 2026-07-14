import { useRef } from 'react'

/**
 * Touch long-press on a scroll container: after ~450ms without moving, resolve
 * the block id under the finger via `resolve(clientX, clientY)` and fire the
 * callback. Cancels on move (so scrolling isn't hijacked) or early release.
 *
 * The resolver differs per view: the PDF hit-tests block bboxes (its overlays
 * are pointer-events:none), while the translation list uses DOM lookup.
 */
export function useLongPress(
  resolve: (x: number, y: number) => string | null,
  onLongPress: (id: string) => void
): {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: () => void
  onTouchEnd: () => void
} {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = (): void => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0]
      const x = t.clientX
      const y = t.clientY
      clear()
      timer.current = setTimeout(() => {
        const id = resolve(x, y)
        if (id) {
          if (navigator.vibrate) navigator.vibrate(10)
          onLongPress(id)
        }
      }, 450)
    },
    onTouchMove: clear,
    onTouchEnd: clear
  }
}

/** DOM resolver: nearest element matching `selector` carrying `attr`. */
export function domResolver(selector: string, attr: string) {
  return (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)?.closest(selector) as HTMLElement | null
    return el?.getAttribute(attr) ?? null
  }
}
