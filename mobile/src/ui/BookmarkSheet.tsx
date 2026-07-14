import { useEffect, useState } from 'react'
import { BookmarkIcon, Trash2, X } from 'lucide-react'
import type { Bookmark, Project } from '@shared/types'
import { useStore } from '@renderer/store'
import { useTab, useTabActions, useTabId } from '@renderer/lib/tab'
import TagEditor from '@renderer/components/TagEditor'

function buildSnippet(project: Project): string {
  return project.blocks.slice(0, 14).map((b) => b.text).join(' ').slice(0, 800)
}

/** Bottom sheet to add/edit this paper's library bookmark (reuses the snippet
 * + upsert logic from the desktop BookmarkButton). */
export default function BookmarkSheet({ onClose }: { onClose: () => void }): JSX.Element {
  const tabId = useTabId()
  const project = useTab((t) => t?.project)
  const { save } = useTabActions()
  const [tags, setTags] = useState<string[]>([])
  const [existing, setExisting] = useState<Bookmark | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!project) return
    ;(async () => {
      const savedPath = useStore.getState().tabs[tabId]?.savedPath ?? null
      const lib = await window.api.library.get()
      const found =
        lib.find((b) => savedPath && b.projectPath === savedPath) ??
        lib.find((b) => b.source === project.meta.source && b.title === project.meta.title) ??
        null
      setExisting(found)
      setTags(found?.tags ?? [])
    })()
  }, [project, tabId])

  const persist = async (): Promise<void> => {
    if (!project) return
    await save()
    const savedPath = useStore.getState().tabs[tabId]?.savedPath ?? null
    if (!savedPath) return
    const p = useStore.getState().tabs[tabId]?.project as Project
    const bm: Bookmark = {
      id: existing?.id ?? crypto.randomUUID(),
      title: p.meta.title,
      source: p.meta.source,
      projectPath: savedPath,
      tags,
      snippet: buildSnippet(p),
      addedAt: existing?.addedAt ?? Date.now()
    }
    await window.api.library.upsert(bm)
    setExisting(bm)
    setSaved(true)
    setTimeout(onClose, 600)
  }

  const remove = async (): Promise<void> => {
    if (existing) await window.api.library.remove(existing.id)
    onClose()
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <div className="rounded-t-2xl border-t border-border bg-surface p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <BookmarkIcon className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium">{existing ? 'Edit bookmark' : 'Bookmark paper'}</span>
          <div className="flex-1" />
          <button onClick={onClose} className="text-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mb-2 truncate text-xs text-muted">{project?.meta.title}</div>
        <TagEditor tags={tags} onChange={setTags} />
        <div className="mt-4 flex items-center gap-2">
          <button onClick={persist} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg">
            {saved ? 'Saved ✓' : existing ? 'Update' : 'Save'}
          </button>
          {existing && (
            <button onClick={remove} className="grid h-9 w-9 place-items-center rounded-lg text-muted">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
