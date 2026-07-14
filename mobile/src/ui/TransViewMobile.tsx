import { useEffect, useRef } from 'react'
import { useStore } from '@renderer/store'
import { useTab, useTabActions } from '@renderer/lib/tab'
import { centerInScroll } from '@renderer/lib/scroll'
import TranslatedBlock from '@renderer/components/TranslatedBlock'
import { useLongPress, domResolver } from './useLongPress'

/**
 * Mobile translation view — the same per-block reused <TranslatedBlock> flow as
 * desktop, but re-centers on the active block whenever it becomes visible, so
 * toggling PDF→Translation lands on the paragraph the reader tapped.
 */
export default function TransViewMobile({
  visible,
  selecting,
  onLongPressBlock
}: {
  visible: boolean
  selecting: boolean
  onLongPressBlock: (id: string) => void
}): JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const blocks = useTab((t) => t?.project.blocks ?? [])
  const settings = useStore((s) => s.settings)
  const activeId = useTab((t) => t?.activeBlockId ?? null)
  const selectedIds = useTab((t) => t?.selectedBlockIds ?? [])
  const autoTranslate = useTab((t) => t?.autoTranslate ?? false)
  const restore = useTab((t) => t?.restore ?? null)
  const restored = useRef(false)
  const { selectBlock, setHoverBlock } = useTabActions()

  // Apply the saved scroll offset once when restoring a session.
  useEffect(() => {
    if (restored.current || !restore || blocks.length === 0) return
    restored.current = true
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = restore.trans
    })
  }, [restore, blocks.length])

  useEffect(() => {
    if (!visible || !activeId) return
    const container = scrollRef.current
    if (!container) return
    const raf = requestAnimationFrame(() => {
      const el = container.querySelector(`[data-tblock="${activeId}"]`)
      if (el) centerInScroll(container, el)
    })
    return () => cancelAnimationFrame(raf)
  }, [visible, activeId])

  const provider = settings?.activeProvider ?? 'claude'
  const targetLang = settings?.targetLang ?? 'Chinese'
  const longPress = useLongPress(domResolver('[data-tblock]', 'data-tblock'), onLongPressBlock)

  return (
    <div
      ref={scrollRef}
      data-scroll="trans"
      className="h-full overflow-auto overscroll-contain bg-surface px-4 py-5"
      {...longPress}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-1">
        {blocks.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">Paragraphs will appear here.</p>
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
            hover={false}
            searchMatch={false}
            searchQuery={''}
            onPick={(additive, range) => selectBlock(b.id, selecting || additive, range)}
            onHover={(v) => setHoverBlock(v ? b.id : null)}
          />
        ))}
      </div>
    </div>
  )
}
