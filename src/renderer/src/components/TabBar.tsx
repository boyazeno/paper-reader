import { X, Plus } from 'lucide-react'
import { useStore } from '@renderer/store'
import { cn } from '@renderer/lib/cn'

/** Browser-style row of open papers; switch / close / open-another. */
export default function TabBar(): JSX.Element {
  const tabOrder = useStore((s) => s.tabOrder)
  const activeTabId = useStore((s) => s.activeTabId)
  const tabs = useStore((s) => s.tabs)
  const switchTab = useStore((s) => s.switchTab)
  const closeTab = useStore((s) => s.closeTab)
  const setView = useStore((s) => s.setView)

  return (
    <div className="flex h-9 shrink-0 items-stretch gap-1 border-b border-border bg-bg px-1.5 pt-1.5">
      {tabOrder.map((id) => {
        const t = tabs[id]
        const active = id === activeTabId
        return (
          <div
            key={id}
            data-tab
            onClick={() => switchTab(id)}
            title={t?.project.meta.title}
            className={cn(
              'group flex min-w-0 max-w-[14rem] cursor-pointer items-center gap-2 rounded-t-md border border-b-0 px-3 text-sm',
              active
                ? 'border-border bg-surface text-fg'
                : 'border-transparent text-muted hover:bg-surface/60'
            )}
          >
            <span className="truncate">{t?.project.meta.title ?? 'Untitled'}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(id)
              }}
              title="Close tab"
              className="grid h-4 w-4 shrink-0 place-items-center rounded text-muted opacity-0 transition-opacity hover:bg-border hover:text-fg group-hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )
      })}
      <button
        onClick={() => setView('welcome')}
        title="Open another paper"
        className="grid h-7 w-7 shrink-0 place-items-center self-center rounded-md text-muted hover:bg-surface"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}
