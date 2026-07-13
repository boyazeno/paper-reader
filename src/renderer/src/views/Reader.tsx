import { useRef, useState } from 'react'
import { MessageCircle, Lightbulb } from 'lucide-react'
import { useStore } from '@renderer/store'
import { useTab, useTabId } from '@renderer/lib/tab'
import { paperFitsContext, passageBudget, selectForOverview } from '@renderer/lib/qaContext'
import { cn } from '@renderer/lib/cn'
import PdfPane from '@renderer/components/PdfPane'
import TranslatedPane from '@renderer/components/TranslatedPane'
import Toolbar from '@renderer/components/Toolbar'
import SelectionBar from '@renderer/components/SelectionBar'
import NotesPanel from '@renderer/components/NotesPanel'
import ReferencesPanel from '@renderer/components/ReferencesPanel'
import ResultPanel, { type Task } from '@renderer/components/ResultPanel'
import ChatPanel from '@renderer/components/ChatPanel'
import SearchBar from '@renderer/components/SearchBar'
import Tour from '@renderer/components/Tour'
import { Button } from '@renderer/components/ui'

export default function Reader(): JSX.Element {
  const tabId = useTabId()
  const project = useTab((t) => t?.project)
  const showNotes = useTab((t) => t?.showNotes ?? false)
  const showRefs = useTab((t) => t?.showRefs ?? false)
  const originalText = useTab((t) => t?.originalText ?? '')
  const selectedIds = useTab((t) => t?.selectedBlockIds ?? [])
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)
  const isActive = useStore((s) => s.activeTabId === tabId)
  const [task, setTask] = useState<Task | null>(null)
  // `seed` = the excerpt to explain, or null to offer "Explain everything".
  const [chat, setChat] = useState<{ seed: string | null; nonce: number } | null>(null)

  const selectionText = (): string =>
    (project?.blocks ?? [])
      .filter((b) => selectedIds.includes(b.id))
      .map((b) => b.text)
      .join('\n\n')

  // Permanent "Explain it": explain the current selection if any, else open the
  // chat in whole-paper mode.
  const openExplain = (): void => {
    setChat({ seed: selectionText() || null, nonce: Date.now() })
  }

  // Permanent "Find inspirations": inspire from the selection if any, else from
  // the whole paper (full text when it fits the model, else a spread of it —
  // the same routing "explain everything" uses).
  const openInspire = (): void => {
    const sel = selectionText()
    const provider = settings?.activeProvider ?? 'claude'
    const text =
      sel ||
      (paperFitsContext(originalText, provider)
        ? originalText
        : selectForOverview(project?.blocks ?? [], passageBudget(provider))
            .map((b) => b.text)
            .join('\n\n'))
    if (text) setTask({ kind: 'inspire', text, nonce: Date.now() })
  }

  // Draggable split between the PDF (left) and translation (right) columns —
  // `split` is the left column's fraction of the pair's width.
  const splitRef = useRef<HTMLDivElement>(null)
  const [split, setSplit] = useState(0.5)
  const [dragging, setDragging] = useState(false)

  const startDrag = (e: React.MouseEvent): void => {
    e.preventDefault()
    const container = splitRef.current
    if (!container) return
    setDragging(true)
    const onMove = (ev: MouseEvent): void => {
      const rect = container.getBoundingClientRect()
      const ratio = (ev.clientX - rect.left) / rect.width
      setSplit(Math.min(0.8, Math.max(0.2, ratio)))
    }
    const onUp = (): void => {
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!project) return <div />

  return (
    <div className="flex h-full w-full flex-col">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <div
          ref={splitRef}
          className={cn('relative flex min-w-0 flex-1', dragging && 'select-none')}
        >
          <div className="h-full min-w-0" style={{ width: `${split * 100}%` }}>
            <PdfPane pdfPath={project.pdfPath} />
          </div>

          {/* Draggable divider: thin line with a wider invisible grab area. */}
          <div
            onMouseDown={startDrag}
            title="Drag to resize"
            className={cn(
              'relative z-10 w-px shrink-0 cursor-col-resize bg-border',
              dragging ? 'bg-accent' : 'hover:bg-accent/60'
            )}
          >
            <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
          </div>

          <div className="h-full min-w-0 flex-1">
            <TranslatedPane />
          </div>

          {/* While dragging, a full-cover layer keeps the PDF canvas from
              swallowing mouse-move events and holds the resize cursor. */}
          {dragging && <div className="absolute inset-0 z-20 cursor-col-resize" />}

          <SearchBar />

          <SelectionBar
            onRun={(kind, text) => setTask({ kind, text, nonce: Date.now() })}
            onExplain={(text) => setChat({ seed: text, nonce: Date.now() })}
          />

          {/* Always-available global actions (hidden while a panel is open). */}
          {!chat && !task && (
            <div className="absolute bottom-4 right-4 z-40 flex items-center gap-2">
              <Button
                variant="outline"
                onClick={openInspire}
                title="Find inspirations from the selection, or the whole paper"
                className="rounded-full bg-surface shadow-lg"
              >
                <Lightbulb className="h-4 w-4" />
                Find inspirations
              </Button>
              <Button
                variant="primary"
                onClick={openExplain}
                title="Explain the selection, or the whole paper"
                className="rounded-full shadow-lg"
              >
                <MessageCircle className="h-4 w-4" />
                Explain it
              </Button>
            </div>
          )}

          {task && (
            <ResultPanel
              task={task}
              onClose={() => setTask(null)}
              onRegenerate={() => setTask({ ...task, nonce: Date.now() })}
            />
          )}
          {chat && (
            <ChatPanel
              key={chat.nonce}
              seedText={chat.seed}
              fullText={originalText}
              blocks={project.blocks}
              onClose={() => setChat(null)}
            />
          )}
        </div>
        {showRefs && <ReferencesPanel />}
        {showNotes && <NotesPanel />}
      </div>

      {isActive && settings && !settings.tourCompleted && (
        <Tour onDone={() => patchSettings({ tourCompleted: true })} />
      )}
    </div>
  )
}
