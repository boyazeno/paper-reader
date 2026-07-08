import { useRef, useState } from 'react'
import { Clock, ChevronDown } from 'lucide-react'
import type { RecentEntry } from '@shared/types'
import { useStore } from '@renderer/store'
import { useClickAway } from '@renderer/lib/useClickAway'
import { Button } from './ui'

/** Toolbar dropdown listing recently opened projects. */
export default function RecentMenu(): JSX.Element {
  const openProjectPath = useStore((s) => s.openProjectPath)
  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [recents, setRecents] = useState<RecentEntry[]>([])
  useClickAway(ref, () => setOpen(false))

  const toggle = async (): Promise<void> => {
    if (open) return setOpen(false)
    setRecents(await window.api.recents.get())
    setOpen(true)
  }

  const pick = async (path: string): Promise<void> => {
    setOpen(false)
    await openProjectPath(path)
  }

  return (
    <div ref={ref} className="relative">
      <Button size="sm" variant="ghost" onClick={toggle} title="Recent projects">
        <Clock className="h-4 w-4" />
        Recent
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>

      {open && (
        <div className="absolute left-0 top-11 z-50 max-h-80 w-80 overflow-auto rounded-xl border border-border bg-surface p-1.5 shadow-2xl">
          {recents.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted">
              No recent projects yet.
            </div>
          ) : (
            recents.map((r) => (
              <button
                key={r.path}
                onClick={() => pick(r.path)}
                className="block w-full truncate rounded-md px-3 py-2 text-left text-sm hover:bg-border/50"
                title={r.path}
              >
                {r.title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
