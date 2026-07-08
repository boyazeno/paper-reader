import { useEffect, type RefObject } from 'react'

/** Call `onAway` when a pointerdown or Escape occurs outside `ref`. */
export function useClickAway(ref: RefObject<HTMLElement>, onAway: () => void): void {
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onAway()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onAway()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, onAway])
}
