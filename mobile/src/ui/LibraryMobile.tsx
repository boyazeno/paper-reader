import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Search, BookOpen, Trash2 } from 'lucide-react'
import type { Bookmark } from '@shared/types'
import { useStore } from '@renderer/store'
import { Input } from '@renderer/components/ui'
import TagEditor from '@renderer/components/TagEditor'
import { searchBookmarks, allTags } from '@renderer/lib/search'

/** Library — bookmarks with tag/title/text search (reuses lib/search). */
export default function LibraryMobile({ onClose }: { onClose: () => void }): JSX.Element {
  const openProjectPath = useStore((s) => s.openProjectPath)
  const [items, setItems] = useState<Bookmark[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    window.api.library.get().then(setItems)
  }, [])

  const results = useMemo(() => searchBookmarks(items, query), [items, query])
  const tags = useMemo(() => allTags(items), [items])

  const updateTags = async (bm: Bookmark, next: string[]): Promise<void> => {
    const nb = { ...bm, tags: next }
    setItems((l) => l.map((b) => (b.id === bm.id ? nb : b)))
    await window.api.library.upsert(nb)
  }
  const remove = async (id: string): Promise<void> => setItems(await window.api.library.remove(id))
  const addTag = (t: string): void => setQuery((q) => (q.includes(`tag:${t}`) ? q : `${q} tag:${t}`.trim()))

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-2">
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-muted">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, text, or tag:foo"
            className="pl-9"
            spellCheck={false}
          />
        </div>
      </header>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => addTag(t)}
              className="rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent"
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto overscroll-contain px-3 py-3">
        {items.length === 0 ? (
          <Empty>No bookmarks yet — bookmark a paper from the reader.</Empty>
        ) : results.length === 0 ? (
          <Empty>No matches.</Empty>
        ) : (
          <div className="flex flex-col gap-3">
            {results.map((bm) => (
              <article key={bm.id} className="rounded-xl border border-border bg-surface p-4">
                <h2 className="truncate font-medium">{bm.title}</h2>
                <p className="truncate text-xs text-muted">{bm.source}</p>
                {bm.snippet && <p className="mt-2 line-clamp-2 text-sm text-muted">{bm.snippet}</p>}
                <div className="mt-3">
                  <TagEditor tags={bm.tags} onChange={(t) => updateTags(bm, t)} />
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    disabled={!bm.projectPath}
                    onClick={() => bm.projectPath && openProjectPath(bm.projectPath).then(onClose)}
                    className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-40"
                  >
                    <BookOpen className="h-4 w-4" /> Open
                  </button>
                  <button onClick={() => remove(bm.id)} className="grid h-8 w-8 place-items-center rounded-lg text-muted">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">{children}</div>
}
