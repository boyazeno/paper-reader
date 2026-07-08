import { useRef, useState } from 'react'
import { Bookmark as BookmarkIcon, Trash2 } from 'lucide-react'
import type { Bookmark, Project } from '@shared/types'
import { useStore } from '@renderer/store'
import { useTab, useTabActions, useTabId } from '@renderer/lib/tab'
import { useClickAway } from '@renderer/lib/useClickAway'
import { Button } from './ui'
import TagEditor from './TagEditor'

function buildSnippet(project: Project): string {
  return project.blocks
    .slice(0, 14)
    .map((b) => b.text)
    .join(' ')
    .slice(0, 800)
}

/** Toolbar button to bookmark the current paper into the library with tags. */
export default function BookmarkButton(): JSX.Element {
  const tabId = useTabId()
  const project = useTab((t) => t?.project)
  const { save } = useTabActions()

  const ref = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [tags, setTags] = useState<string[]>([])
  const [existing, setExisting] = useState<Bookmark | null>(null)
  const [saved, setSaved] = useState(false)
  useClickAway(ref, () => setOpen(false))

  const openPopover = async (): Promise<void> => {
    if (!project) return
    const savedPath = useStore.getState().tabs[tabId]?.savedPath ?? null
    const lib = await window.api.library.get()
    const found =
      lib.find((b) => savedPath && b.projectPath === savedPath) ??
      lib.find((b) => b.source === project.meta.source && b.title === project.meta.title) ??
      null
    setExisting(found)
    setTags(found?.tags ?? [])
    setSaved(false)
    setOpen(true)
  }

  const persist = async (nextTags: string[]): Promise<void> => {
    if (!project) return
    // Persist the project (writes project.json into its vault folder; prompts
    // for a location only if it has none) so the bookmark can reopen it.
    await save()
    const savedPath = useStore.getState().tabs[tabId]?.savedPath ?? null
    if (!savedPath) return // user cancelled the save dialog
    const p = useStore.getState().tabs[tabId]?.project as Project
    const bm: Bookmark = {
      id: existing?.id ?? crypto.randomUUID(),
      title: p.meta.title,
      source: p.meta.source,
      projectPath: savedPath,
      tags: nextTags,
      snippet: buildSnippet(p),
      addedAt: existing?.addedAt ?? Date.now()
    }
    await window.api.library.upsert(bm)
    setExisting(bm)
    setSaved(true)
  }

  const remove = async (): Promise<void> => {
    if (existing) await window.api.library.remove(existing.id)
    setExisting(null)
    setTags([])
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative" data-tour="bookmark">
      <Button
        size="icon"
        variant={existing ? 'outline' : 'ghost'}
        onClick={() => (open ? setOpen(false) : openPopover())}
        title="Bookmark this paper"
      >
        <BookmarkIcon className={existing ? 'h-4 w-4 fill-current text-accent' : 'h-4 w-4'} />
      </Button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 rounded-xl border border-border bg-surface p-3 shadow-2xl">
          <div className="mb-2 text-sm font-medium">
            {existing ? 'Edit bookmark' : 'Bookmark paper'}
          </div>
          <div className="mb-2 truncate text-xs text-muted">{project?.meta.title}</div>
          <TagEditor tags={tags} onChange={setTags} />
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={() => persist(tags)}>
              {saved ? 'Saved ✓' : existing ? 'Update' : 'Save'}
            </Button>
            {existing && (
              <Button size="sm" variant="ghost" onClick={remove} title="Remove bookmark">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
