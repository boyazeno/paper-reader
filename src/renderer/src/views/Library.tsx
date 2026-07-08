import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Search, ExternalLink, Trash2, BookOpen } from 'lucide-react'
import type { Bookmark } from '@shared/types'
import { useStore } from '@renderer/store'
import { Button, Input } from '@renderer/components/ui'
import TagEditor from '@renderer/components/TagEditor'
import { searchBookmarks, allTags } from '@renderer/lib/search'

export default function Library(): JSX.Element {
  const setView = useStore((s) => s.setView)
  const hasTabs = useStore((s) => s.tabOrder.length > 0)
  const openProjectPath = useStore((s) => s.openProjectPath)

  const [items, setItems] = useState<Bookmark[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    window.api.library.get().then(setItems)
  }, [])

  const results = useMemo(() => searchBookmarks(items, query), [items, query])
  const tags = useMemo(() => allTags(items), [items])

  const updateTags = async (bm: Bookmark, nextTags: string[]): Promise<void> => {
    const next = { ...bm, tags: nextTags }
    setItems((list) => list.map((b) => (b.id === bm.id ? next : b)))
    await window.api.library.upsert(next)
  }

  const remove = async (id: string): Promise<void> => {
    setItems(await window.api.library.remove(id))
  }

  const addTagToQuery = (t: string): void =>
    setQuery((q) => (q.includes(`tag:${t}`) ? q : `${q} tag:${t}`.trim()))

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-border px-6 py-3">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setView(hasTabs ? 'reader' : 'welcome')}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">Library</h1>
        <div className="relative ml-2 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, text, or tag:foo · #foo"
            className="pl-9"
            spellCheck={false}
          />
        </div>
      </header>

      {/* tag cloud */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-6 py-2.5">
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => addTagToQuery(t)}
              className="rounded-md bg-accent/10 px-2 py-0.5 text-xs text-accent hover:bg-accent/20"
            >
              #{t}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto px-6 py-4">
        {items.length === 0 ? (
          <Empty>No bookmarks yet — bookmark a paper from the reader.</Empty>
        ) : results.length === 0 ? (
          <Empty>No matches for “{query}”.</Empty>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {results.map((bm) => (
              <article
                key={bm.id}
                className="rounded-xl border border-border bg-surface p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-medium">{bm.title}</h2>
                    <p className="truncate text-xs text-muted">{bm.source}</p>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    {new Date(bm.addedAt).toLocaleDateString()}
                  </span>
                </div>

                {bm.snippet && (
                  <p className="mt-2 line-clamp-2 text-sm text-muted">{bm.snippet}</p>
                )}

                <div className="mt-3">
                  <TagEditor tags={bm.tags} onChange={(t) => updateTags(bm, t)} />
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!bm.projectPath}
                    onClick={() => bm.projectPath && openProjectPath(bm.projectPath)}
                  >
                    {bm.projectPath ? (
                      <BookOpen className="h-4 w-4" />
                    ) : (
                      <ExternalLink className="h-4 w-4" />
                    )}
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(bm.id)}
                    title="Remove from library"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
  return <div className="grid h-full place-items-center text-sm text-muted">{children}</div>
}
