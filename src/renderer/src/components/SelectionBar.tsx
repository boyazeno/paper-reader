import { Sparkles, Lightbulb, MessageCircle, X } from 'lucide-react'
import { useTab, useTabActions } from '@renderer/lib/tab'
import { Button } from './ui'
import type { LlmTask } from '@shared/types'

/** Floating action bar shown when one or more paragraphs are selected. */
export default function SelectionBar({
  onRun,
  onExplain
}: {
  onRun: (kind: Extract<LlmTask, 'summarize' | 'inspire'>, text: string) => void
  onExplain: (text: string) => void
}): JSX.Element | null {
  const blocks = useTab((t) => t?.project.blocks ?? [])
  const selectedIds = useTab((t) => t?.selectedBlockIds ?? [])
  const { clearSelection } = useTabActions()

  if (selectedIds.length === 0) return null

  const text = blocks
    .filter((b) => selectedIds.includes(b.id))
    .map((b) => b.text)
    .join('\n\n')

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-5 z-30 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-border bg-surface px-2 py-1.5 shadow-lg">
        <span className="px-2 text-xs text-muted">
          {selectedIds.length} selected
          <span className="ml-1 opacity-70">· Shift/⌘-click to add</span>
        </span>
        <Button size="sm" variant="primary" onClick={() => onRun('summarize', text)}>
          <Sparkles className="h-4 w-4" />
          Summarize
        </Button>
        <Button size="sm" onClick={() => onRun('inspire', text)}>
          <Lightbulb className="h-4 w-4" />
          Find inspirations
        </Button>
        <Button size="sm" onClick={() => onExplain(text)}>
          <MessageCircle className="h-4 w-4" />
          Explain it
        </Button>
        <Button size="icon" variant="ghost" onClick={clearSelection} title="Clear">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
