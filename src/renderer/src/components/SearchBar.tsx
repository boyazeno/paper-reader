import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react'
import { useTab, useTabActions } from '@renderer/lib/tab'

/**
 * Ctrl+F find bar: searches the paper's extracted text (the blocks) and steps
 * through matching paragraphs, scrolling/highlighting each one in both panes.
 * Always mounted (returns null when closed) so the query survives close/reopen.
 */
export default function SearchBar(): JSX.Element | null {
  const open = useTab((t) => t?.searchOpen ?? false)
  const blocks = useTab((t) => t?.project.blocks ?? [])
  const { setSearchMatch, setSearchQuery, closeSearch } = useTabActions()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [] as string[]
    return blocks.filter((b) => b.text.toLowerCase().includes(q)).map((b) => b.id)
  }, [blocks, query])

  // Focus + select the field when the bar opens.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [open])

  // Publish the query so both panes can highlight the exact matched text.
  useEffect(() => {
    if (open) setSearchQuery(query)
  }, [query, open, setSearchQuery])

  // Jump to the first hit whenever the match set changes (only while open, so a
  // background translation editing blocks can't re-highlight a closed search).
  useEffect(() => {
    if (!open) return
    setIndex(0)
    setSearchMatch(matches[0] ?? null)
  }, [matches, open, setSearchMatch])

  const go = (dir: 1 | -1): void => {
    if (matches.length === 0) return
    const next = (index + dir + matches.length) % matches.length
    setIndex(next)
    setSearchMatch(matches[next])
  }

  if (!open) return null

  const total = matches.length

  return (
    <div className="absolute right-4 top-3 z-40 flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 shadow-lg">
      <Search className="h-4 w-4 shrink-0 text-muted" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation() // keep global shortcuts out of the field
          if (e.key === 'Enter') {
            e.preventDefault()
            go(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            closeSearch()
          }
        }}
        placeholder="Find in paper…"
        spellCheck={false}
        className="w-48 bg-transparent px-1 py-0.5 text-sm outline-none"
      />
      <span className="min-w-[3.25rem] text-center text-xs tabular-nums text-muted">
        {total ? `${index + 1} / ${total}` : query.trim() ? '0 / 0' : ''}
      </span>
      <button
        onClick={() => go(-1)}
        disabled={!total}
        title="Previous (Shift+Enter)"
        className="rounded p-1 text-muted hover:bg-border/50 disabled:opacity-40"
      >
        <ChevronUp className="h-4 w-4" />
      </button>
      <button
        onClick={() => go(1)}
        disabled={!total}
        title="Next (Enter)"
        className="rounded p-1 text-muted hover:bg-border/50 disabled:opacity-40"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
      <button
        onClick={closeSearch}
        title="Close (Esc)"
        className="rounded p-1 text-muted hover:bg-border/50"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
