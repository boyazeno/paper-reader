import { useMemo, useState } from 'react'
import {
  FilePlus2,
  FolderOpen,
  Save,
  Undo2,
  Redo2,
  StickyNote,
  Settings2,
  Check,
  Square,
  Library as LibraryIcon,
  BookText,
  Languages
} from 'lucide-react'
import { useStore } from '@renderer/store'
import { useTab, useTabActions } from '@renderer/lib/tab'
import { cancelAllLlm } from '@renderer/lib/llm'
import { extractReferences } from '@renderer/lib/references'
import { Button } from './ui'
import RecentMenu from './RecentMenu'
import BookmarkButton from './BookmarkButton'
import SyncButton from './SyncButton'
import TitleEditor from './TitleEditor'

/** Top toolbar: open/new, save, undo/redo, notes + settings. */
export default function Toolbar(): JSX.Element {
  const setView = useStore((s) => s.setView)
  const openExisting = useStore((s) => s.openExisting)
  const showNotes = useTab((t) => t?.showNotes ?? false)
  const showRefs = useTab((t) => t?.showRefs ?? false)
  const autoTranslate = useTab((t) => t?.autoTranslate ?? false)
  const blocks = useTab((t) => t?.project.blocks ?? [])
  const hasRefs = useMemo(() => extractReferences(blocks).length > 0, [blocks])
  const canUndo = useTab((t) => (t?.past.length ?? 0) > 0)
  const canRedo = useTab((t) => (t?.future.length ?? 0) > 0)
  const { toggleNotes, toggleRefs, toggleAutoTranslate, save, saveAs, undo, redo } =
    useTabActions()
  const runningLlm = useStore((s) => s.runningLlm)

  const [saved, setSaved] = useState(false)

  // Opening a new paper adds a tab → show the Welcome picker as an overlay.
  const openNew = (): void => setView('welcome')
  const doSave = async (): Promise<void> => {
    await save()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-surface px-3">
      <Button size="sm" variant="ghost" onClick={openNew} title="Open new paper">
        <FilePlus2 className="h-4 w-4" />
        New
      </Button>
      <Button size="sm" variant="ghost" onClick={openExisting} title="Open project">
        <FolderOpen className="h-4 w-4" />
        Open
      </Button>
      <RecentMenu />
      <Button size="sm" variant="ghost" onClick={doSave} title="Save project (⌘S)">
        {saved ? <Check className="h-4 w-4 text-green-500" /> : <Save className="h-4 w-4" />}
        {saved ? 'Saved' : 'Save'}
      </Button>
      <Button size="sm" variant="ghost" onClick={saveAs} title="Save to a new location">
        Save As…
      </Button>
      <SyncButton />
      <div className="mx-1 h-5 w-px bg-border" />
      <Button size="icon" variant="ghost" onClick={undo} disabled={!canUndo} title="Undo">
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button size="icon" variant="ghost" onClick={redo} disabled={!canRedo} title="Redo">
        <Redo2 className="h-4 w-4" />
      </Button>

      <div className="flex flex-1 items-center justify-center gap-3 px-3">
        <TitleEditor />
        {runningLlm > 0 && (
          <Button
            size="sm"
            variant="outline"
            onClick={cancelAllLlm}
            title="Stop all running LLM tasks"
            className="border-red-400/40 text-red-400 hover:bg-red-500/10"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
            Stop all ({runningLlm})
          </Button>
        )}
      </div>

      <BookmarkButton />
      <Button
        size="icon"
        variant={autoTranslate ? 'outline' : 'ghost'}
        onClick={toggleAutoTranslate}
        title={
          autoTranslate
            ? 'Auto-translation on — click to stop translating while scrolling'
            : 'Auto-translation off — click to translate blocks as you scroll'
        }
      >
        <Languages className="h-4 w-4" />
      </Button>
      {hasRefs && (
        <Button
          size="icon"
          variant={showRefs ? 'outline' : 'ghost'}
          onClick={toggleRefs}
          title="References"
        >
          <BookText className="h-4 w-4" />
        </Button>
      )}
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setView('library')}
        title="Library"
      >
        <LibraryIcon className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant={showNotes ? 'outline' : 'ghost'}
        onClick={toggleNotes}
        title="Toggle notes"
        data-tour="notes"
      >
        <StickyNote className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setView('settings')}
        title="Settings"
        data-tour="settings"
      >
        <Settings2 className="h-4 w-4" />
      </Button>
    </header>
  )
}
