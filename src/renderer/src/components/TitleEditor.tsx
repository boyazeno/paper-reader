import { useEffect, useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useTab, useTabActions } from '@renderer/lib/tab'

/** The current paper's title in the toolbar — click (or the pencil) to rename in
 * place. Enter commits, Esc cancels; the new name is saved to the project. */
export default function TitleEditor(): JSX.Element {
  const title = useTab((t) => t?.project.meta.title ?? '')
  const { renameProject } = useTabActions()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const cancel = useRef(false)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const start = (): void => {
    setDraft(title)
    setEditing(true)
  }

  // Enter and Esc both blur the input; this fires on that blur.
  const commit = (): void => {
    setEditing(false)
    if (cancel.current) {
      cancel.current = false
      return
    }
    void renameProject(draft)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation() // keep global shortcuts out of the rename field
          if (e.key === 'Enter') {
            e.preventDefault()
            inputRef.current?.blur()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            cancel.current = true
            inputRef.current?.blur()
          }
        }}
        spellCheck={false}
        className="w-full max-w-md rounded-md border border-border bg-bg px-2 py-1 text-center text-sm font-medium text-fg outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
      />
    )
  }

  return (
    <button
      onClick={start}
      title="Rename this paper"
      className="group flex min-w-0 max-w-md items-center gap-1.5 rounded-md px-2 py-1 hover:bg-border/40"
    >
      <span className="truncate text-sm font-medium text-muted">{title}</span>
      <Pencil className="h-3.5 w-3.5 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
    </button>
  )
}
