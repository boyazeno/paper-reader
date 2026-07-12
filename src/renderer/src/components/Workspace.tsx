import { useStore } from '@renderer/store'
import { TabIdContext } from '@renderer/lib/tab'
import Reader from '@renderer/views/Reader'
import TabBar from './TabBar'

/**
 * Hosts every open paper as a separate mounted `Reader`, only the active one
 * visible. Keeping inactive Readers mounted (display:none) preserves their full
 * per-tab state — loaded PDF, rendered canvases, scroll/zoom, translations,
 * undo history, open panels — so switching tabs is instant.
 */
export default function Workspace(): JSX.Element {
  const tabOrder = useStore((s) => s.tabOrder)
  const activeTabId = useStore((s) => s.activeTabId)

  return (
    <div className="flex h-full w-full flex-col">
      <TabBar />
      <div className="relative min-h-0 flex-1">
        {tabOrder.map((id) => (
          <TabIdContext.Provider key={id} value={id}>
            <div
              data-tab-panel={id}
              className="absolute inset-0"
              style={{ display: id === activeTabId ? 'flex' : 'none' }}
            >
              <Reader />
            </div>
          </TabIdContext.Provider>
        ))}
      </div>
    </div>
  )
}
