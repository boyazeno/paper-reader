import { useRef, useState } from 'react'
import {
  Languages,
  FileText,
  AlignLeft,
  Settings2,
  Lightbulb,
  MessageCircle,
  StickyNote,
  MoreVertical,
  Bookmark as BookmarkIcon,
  Library as LibraryIcon,
  Pencil,
  Sparkles,
  X
} from 'lucide-react'
import { useStore } from '@renderer/store'
import { TabIdContext, useTab, useTabActions } from '@renderer/lib/tab'
import { paperFitsContext, passageBudget, selectForOverview } from '@renderer/lib/qaContext'
import ResultPanel, { type Task } from '@renderer/components/ResultPanel'
import ChatPanel from '@renderer/components/ChatPanel'
import PdfViewMobile from './PdfViewMobile'
import TransViewMobile from './TransViewMobile'
import NotesSheet from './NotesSheet'
import BookmarkSheet from './BookmarkSheet'
import LibraryMobile from './LibraryMobile'
import PdfCropOverlay from './PdfCropOverlay'
import TabBarMobile from './TabBarMobile'

type Mode = 'pdf' | 'trans'

function ReaderInner({
  onNewTab,
  onOpenSettings
}: {
  onNewTab: () => void
  onOpenSettings: () => void
}): JSX.Element {
  const [mode, setMode] = useState<Mode>('pdf')
  const [task, setTask] = useState<Task | null>(null)
  const [chat, setChat] = useState<{ seed: string | null; nonce: number } | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const [notesHidden, setNotesHidden] = useState(false)
  const [bmOpen, setBmOpen] = useState(false)
  const [libOpen, setLibOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cropping, setCropping] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const cropResolve = useRef<((url: string | null) => void) | null>(null)

  const settings = useStore((s) => s.settings)
  const title = useTab((t) => t?.project.meta.title ?? '')
  const pdfPath = useTab((t) => t?.project.pdfPath ?? '')
  const autoTranslate = useTab((t) => t?.autoTranslate ?? false)
  const blocks = useTab((t) => t?.project.blocks ?? [])
  const selectedIds = useTab((t) => t?.selectedBlockIds ?? [])
  const originalText = useTab((t) => t?.originalText ?? '')
  const { toggleAutoTranslate, selectBlock, clearSelection, renameProject } = useTabActions()

  const selectionText = (): string =>
    blocks.filter((b) => selectedIds.includes(b.id)).map((b) => b.text).join('\n\n')

  const openInspire = (): void => {
    const sel = selectionText()
    const provider = settings?.activeProvider ?? 'claude'
    const text =
      sel ||
      (paperFitsContext(originalText, provider)
        ? originalText
        : selectForOverview(blocks, passageBudget(provider)).map((b) => b.text).join('\n\n'))
    if (text) setTask({ kind: 'inspire', text, nonce: Date.now() })
  }
  const openExplain = (): void => setChat({ seed: selectionText() || null, nonce: Date.now() })
  const openSummarize = (): void => {
    const t = selectionText()
    if (t) setTask({ kind: 'summarize', text: t, nonce: Date.now() })
  }

  const enterSelect = (id: string): void => {
    setSelecting(true)
    selectBlock(id, true, false)
  }
  const doneSelect = (): void => {
    setSelecting(false)
    clearSelection()
  }

  const startRename = (): void => {
    setRenameDraft(title)
    setRenaming(true)
  }
  const commitRename = (): void => {
    const t = renameDraft.trim()
    if (t) renameProject(t)
    setRenaming(false)
  }

  const onScreenshot = (): Promise<string | null> =>
    new Promise((resolve) => {
      cropResolve.current = resolve
      setMode('pdf')
      setNotesHidden(true)
      setCropping(true)
    })
  const finishCrop = async (bytes: Uint8Array | null): Promise<void> => {
    setCropping(false)
    setNotesHidden(false)
    let url: string | null = null
    if (bytes) {
      const { absPath } = await window.api.project.saveImage(pdfPath, bytes, Date.now())
      url = absPath
    }
    cropResolve.current?.(url)
    cropResolve.current = null
  }

  const seg = (m: Mode, lbl: string, Icon: typeof FileText): JSX.Element => (
    <button
      onClick={() => setMode(m)}
      className={
        'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition-colors ' +
        (mode === m ? 'bg-accent text-accent-fg' : 'text-muted')
      }
    >
      <Icon className="h-4 w-4" /> {lbl}
    </button>
  )
  const iconBtn = 'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted'
  const menuItem = (Icon: typeof FileText, label: string, onClick: () => void): JSX.Element => (
    <button
      onClick={() => {
        setMenuOpen(false)
        onClick()
      }}
      className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-border/40"
    >
      <Icon className="h-4 w-4 text-muted" /> {label}
    </button>
  )

  return (
    <div className="flex h-full w-full flex-col">
      <TabBarMobile onNew={onNewTab} />

      {/* toggle + actions */}
      <div className="flex shrink-0 items-center gap-1.5 px-2 py-1.5">
        <div className="flex flex-1 gap-1 rounded-lg border border-border bg-surface p-1">
          {seg('pdf', 'PDF', FileText)}
          {seg('trans', 'Translation', AlignLeft)}
        </div>
        <button
          onClick={toggleAutoTranslate}
          title="Auto-translate on scroll"
          className={'grid h-9 w-9 shrink-0 place-items-center rounded-lg ' + (autoTranslate ? 'bg-accent/15 text-accent' : 'text-muted')}
        >
          <Languages className="h-5 w-5" />
        </button>
        <button onClick={() => setNotesOpen(true)} className={iconBtn} aria-label="Notes">
          <StickyNote className="h-5 w-5" />
        </button>
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className={iconBtn} aria-label="More">
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-2xl">
                {menuItem(Pencil, 'Rename', startRename)}
                {menuItem(BookmarkIcon, 'Bookmark', () => setBmOpen(true))}
                {menuItem(LibraryIcon, 'Library', () => setLibOpen(true))}
                {menuItem(Settings2, 'Settings', onOpenSettings)}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0" style={{ display: mode === 'pdf' ? 'block' : 'none' }}>
          <PdfViewMobile visible={mode === 'pdf'} selecting={selecting} onLongPressBlock={enterSelect} />
        </div>
        <div className="absolute inset-0" style={{ display: mode === 'trans' ? 'block' : 'none' }}>
          <TransViewMobile visible={mode === 'trans'} selecting={selecting} onLongPressBlock={enterSelect} />
        </div>

        {selecting && selectedIds.length > 0 && (
          <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-surface px-2 py-1.5 shadow-lg">
            <span className="px-1.5 text-xs text-muted">{selectedIds.length} selected</span>
            <button onClick={openSummarize} className="flex items-center gap-1 rounded-full px-2 py-1 text-sm">
              <Sparkles className="h-4 w-4" /> Summary
            </button>
            <button onClick={openInspire} className="flex items-center gap-1 rounded-full px-2 py-1 text-sm">
              <Lightbulb className="h-4 w-4" /> Inspire
            </button>
            <button onClick={openExplain} className="flex items-center gap-1 rounded-full px-2 py-1 text-sm">
              <MessageCircle className="h-4 w-4" /> Explain
            </button>
            <button onClick={doneSelect} className="grid h-7 w-7 place-items-center rounded-full text-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {!selecting && !task && !chat && !notesOpen && (
          <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2">
            <button onClick={openInspire} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-sm shadow-lg">
              <Lightbulb className="h-4 w-4" /> {selectedIds.length ? 'Inspire' : 'Inspirations'}
            </button>
            <button onClick={openExplain} className="flex items-center gap-1.5 rounded-full bg-accent px-3 py-2 text-sm font-medium text-accent-fg shadow-lg">
              <MessageCircle className="h-4 w-4" /> Explain
            </button>
          </div>
        )}

        {task && (
          <ResultPanel task={task} onClose={() => setTask(null)} onRegenerate={() => setTask({ ...task, nonce: Date.now() })} />
        )}
        {chat && (
          <div className="mobile-chat">
            <ChatPanel key={chat.nonce} seedText={chat.seed} fullText={originalText} blocks={blocks} onClose={() => setChat(null)} />
          </div>
        )}

        {notesOpen && (
          <div style={{ display: notesHidden ? 'none' : 'block' }}>
            <NotesSheet onClose={() => setNotesOpen(false)} onScreenshot={onScreenshot} />
          </div>
        )}
        {cropping && <PdfCropOverlay onDone={finishCrop} onCancel={() => finishCrop(null)} />}
        {bmOpen && <BookmarkSheet onClose={() => setBmOpen(false)} />}
        {libOpen && (
          <div className="absolute inset-0 z-50">
            <LibraryMobile onClose={() => setLibOpen(false)} />
          </div>
        )}

        {renaming && (
          <div className="absolute inset-0 z-[55] flex items-center justify-center bg-black/40 p-6" onClick={() => setRenaming(false)}>
            <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-4" onClick={(e) => e.stopPropagation()}>
              <div className="mb-2 text-sm font-medium">Rename paper</div>
              <input
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitRename()}
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
                spellCheck={false}
              />
              <div className="mt-3 flex justify-end gap-2">
                <button onClick={() => setRenaming(false)} className="rounded-lg px-3 py-2 text-sm text-muted">
                  Cancel
                </button>
                <button onClick={commitRename} disabled={!renameDraft.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50">
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** The reader. Provides the active tab's context to reused code. */
export default function ReaderMobile({
  onNewTab,
  onOpenSettings
}: {
  onNewTab: () => void
  onOpenSettings: () => void
}): JSX.Element {
  const activeTabId = useStore((s) => s.activeTabId)
  if (!activeTabId) return <div />
  return (
    <TabIdContext.Provider value={activeTabId}>
      <ReaderInner onNewTab={onNewTab} onOpenSettings={onOpenSettings} />
    </TabIdContext.Provider>
  )
}
