import { useEffect, useRef } from 'react'
import { useStore } from '@renderer/store'
import { useTab, useTabActions } from '@renderer/lib/tab'
import { centerInScroll } from '@renderer/lib/scroll'
import TranslatedBlock from './TranslatedBlock'

/**
 * Right column: one entry per block in reading order. Blocks translate on demand
 * as they scroll into view only while auto-translate is on; otherwise the user
 * translates each paragraph manually. Clicking an entry selects the block and
 * scrolls the original on the left to it.
 */
export default function TranslatedPane(): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const blocks = useTab((t) => t?.project.blocks ?? [])
  const settings = useStore((s) => s.settings)
  const activeId = useTab((t) => t?.activeBlockId ?? null)
  const hoverId = useTab((t) => t?.hoverBlockId ?? null)
  const selectedIds = useTab((t) => t?.selectedBlockIds ?? [])
  const searchId = useTab((t) => t?.searchMatchId ?? null)
  const searchQuery = useTab((t) => t?.searchQuery ?? '')
  const restore = useTab((t) => t?.restore ?? null)
  const restoredRef = useRef(false)
  const autoTranslate = useTab((t) => t?.autoTranslate ?? false)
  const { selectBlock, setHoverBlock: setHover } = useTabActions()

  // Scroll the active block into view when the user clicks a paragraph (the
  // panes scroll independently otherwise — no scroll-linking).
  useEffect(() => {
    if (!activeId) return
    const container = scrollRef.current
    if (!container) return
    const el = container.querySelector(`[data-tblock="${activeId}"]`)
    if (el) centerInScroll(container, el)
  }, [activeId])

  // Scroll the current search hit into view.
  useEffect(() => {
    if (!searchId) return
    const container = scrollRef.current
    if (!container) return
    const el = container.querySelector(`[data-tblock="${searchId}"]`)
    if (el) centerInScroll(container, el)
  }, [searchId])

  // Apply the saved scroll offset once when restoring from a session.
  useEffect(() => {
    if (restoredRef.current || !restore || blocks.length === 0) return
    restoredRef.current = true
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = restore.trans
    })
  }, [restore, blocks.length])

  const provider = settings?.activeProvider ?? 'claude'
  const targetLang = settings?.targetLang ?? 'Chinese'

  return (
    <div
      ref={scrollRef}
      data-tour="translation"
      data-scroll="trans"
      className="h-full overflow-auto overscroll-contain bg-surface px-6 py-6"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-1">
        {blocks.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">
            Paragraphs will appear here.
          </p>
        )}
        {blocks.map((b) => (
          <TranslatedBlock
            key={b.id}
            block={b}
            provider={provider}
            targetLang={targetLang}
            autoTranslate={autoTranslate}
            active={b.id === activeId}
            selected={selectedIds.includes(b.id)}
            hover={b.id === hoverId}
            searchMatch={b.id === searchId}
            searchQuery={b.id === searchId ? searchQuery : ''}
            onPick={(additive, range) => selectBlock(b.id, additive, range)}
            onHover={(v) => setHover(v ? b.id : null)}
          />
        ))}
      </div>
    </div>
  )
}
