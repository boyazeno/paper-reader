import { useCallback, useLayoutEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from './ui'

interface Step {
  target: string // data-tour value of the element to spotlight
  title: string
  text: string
  /** 'bottom' anchors below a toolbar button; 'pane' floats near a pane top. */
  place: 'bottom' | 'pane'
}

const STEPS: Step[] = [
  { target: 'original', title: 'Original paper', text: 'The source PDF renders on the left.', place: 'pane' },
  { target: 'translation', title: 'Translation', text: 'Its translation appears on the right, scroll-synced.', place: 'pane' },
  { target: 'notes', title: 'Notes', text: 'Write notes and clip screenshots here.', place: 'bottom' },
  { target: 'bookmark', title: 'Bookmark', text: 'Save papers to your searchable library.', place: 'bottom' },
  { target: 'translation', title: 'Multi-select', text: 'Ctrl/⌘-click to pick several paragraphs at once.', place: 'pane' },
  { target: 'settings', title: 'Settings', text: 'Models, language and prompts live here.', place: 'bottom' }
]

const BUBBLE_W = 300

export default function Tour({ onDone }: { onDone: () => void }): JSX.Element {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = STEPS[i]

  const measure = useCallback(() => {
    const el = document.querySelector(`[data-tour="${step.target}"]`)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [step.target])

  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const last = i === STEPS.length - 1
  const next = (): void => (last ? onDone() : setI(i + 1))
  const back = (): void => setI(Math.max(0, i - 1))

  // Spotlight + bubble geometry.
  const pad = 6
  const spot = rect
    ? { left: rect.left - pad, top: rect.top - pad, width: rect.width + 2 * pad, height: rect.height + 2 * pad }
    : null

  let bTop: number
  let bLeft: number
  if (rect) {
    bTop = step.place === 'bottom' ? rect.bottom + 12 : rect.top + 28
    bLeft = rect.left + rect.width / 2 - BUBBLE_W / 2
  } else {
    bTop = window.innerHeight / 2 - 80
    bLeft = window.innerWidth / 2 - BUBBLE_W / 2
  }
  bLeft = Math.max(12, Math.min(window.innerWidth - BUBBLE_W - 12, bLeft))
  bTop = Math.max(12, Math.min(window.innerHeight - 190, bTop))

  return (
    <div className="fixed inset-0 z-[100]">
      {/* blocks interaction with the app behind the tour */}
      <div className="absolute inset-0" />

      {spot && (
        <div
          className="absolute rounded-lg ring-2 ring-accent transition-all duration-200"
          style={{
            left: spot.left,
            top: spot.top,
            width: spot.width,
            height: spot.height,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)'
          }}
        />
      )}

      <div
        className="absolute rounded-xl border border-border bg-surface p-4 shadow-2xl transition-all duration-200"
        style={{ left: bLeft, top: bTop, width: BUBBLE_W }}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-sm font-semibold">{step.title}</span>
          <button onClick={onDone} title="Skip" className="text-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm leading-relaxed text-muted">{step.text}</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted">
            {i + 1} / {STEPS.length}
          </span>
          <div className="flex gap-2">
            {i > 0 && (
              <Button size="sm" variant="ghost" onClick={back}>
                Back
              </Button>
            )}
            <Button size="sm" variant="primary" onClick={next}>
              {last ? 'Done' : 'Next'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
