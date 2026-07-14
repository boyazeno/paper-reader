import { Plus, X } from 'lucide-react'
import { useStore } from '@renderer/store'

/** Browser-style open-papers row: tap to switch, × to close, + to add. */
export default function TabBarMobile({ onNew }: { onNew: () => void }): JSX.Element {
  const tabOrder = useStore((s) => s.tabOrder)
  const tabs = useStore((s) => s.tabs)
  const activeTabId = useStore((s) => s.activeTabId)
  const switchTab = useStore((s) => s.switchTab)
  const closeTab = useStore((s) => s.closeTab)

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-surface px-1">
      <div className="flex flex-1 items-center gap-1 overflow-x-auto">
        {tabOrder.map((id) => {
          const t = tabs[id]
          if (!t) return null
          const active = id === activeTabId
          return (
            <div
              key={id}
              onClick={() => switchTab(id)}
              className={
                'flex max-w-[9rem] shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs ' +
                (active ? 'border-accent/40 bg-accent/15 text-accent' : 'border-transparent text-muted')
              }
            >
              <span className="truncate">{t.project.meta.title || 'Untitled'}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(id)
                }}
                className="shrink-0 rounded p-0.5 hover:bg-border/50"
                aria-label="Close tab"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )
        })}
      </div>
      <button
        onClick={onNew}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted hover:bg-border/40"
        aria-label="New paper"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  )
}
