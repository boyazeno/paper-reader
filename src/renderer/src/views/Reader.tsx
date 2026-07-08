import { useRef, useState } from 'react'
import { useStore } from '@renderer/store'
import { useTab, useTabId } from '@renderer/lib/tab'
import { cn } from '@renderer/lib/cn'
import PdfPane from '@renderer/components/PdfPane'
import TranslatedPane from '@renderer/components/TranslatedPane'
import Toolbar from '@renderer/components/Toolbar'
import SelectionBar from '@renderer/components/SelectionBar'
import NotesPanel from '@renderer/components/NotesPanel'
import ReferencesPanel from '@renderer/components/ReferencesPanel'
import ResultPanel, { type Task } from '@renderer/components/ResultPanel'
import ChatPanel from '@renderer/components/ChatPanel'
import Tour from '@renderer/components/Tour'

export default function Reader(): JSX.Element {
  const tabId = useTabId()
  const project = useTab((t) => t?.project)
  const showNotes = useTab((t) => t?.showNotes ?? false)
  const showRefs = useTab((t) => t?.showRefs ?? false)
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)
  const isActive = useStore((s) => s.activeTabId === tabId)
  const [task, setTask] = useState<Task | null>(null)
  const [chat, setChat] = useState<{ text: string; nonce: number } | null>(null)

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

          <SelectionBar
            onRun={(kind, text) => setTask({ kind, text, nonce: Date.now() })}
            onExplain={(text) => setChat({ text, nonce: Date.now() })}
          />
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
              seedText={chat.text}
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
