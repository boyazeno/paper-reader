import { useState } from 'react'
import { X, Tag as TagIcon } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

interface Props {
  tags: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
  className?: string
}

/** Editable tag chips: type + Enter (or comma) to add, × to remove. */
export default function TagEditor({
  tags,
  onChange,
  placeholder = 'Add tag…',
  className
}: Props): JSX.Element {
  const [input, setInput] = useState('')

  const add = (raw: string): void => {
    const t = raw.trim().replace(/,$/, '').trim()
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      onChange([...tags, t])
    }
    setInput('')
  }

  const remove = (t: string): void => onChange(tags.filter((x) => x !== t))

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-bg px-2 py-1.5',
        className
      )}
    >
      <TagIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
      {tags.map((t) => (
        <span
          key={t}
          className="flex items-center gap-1 rounded-md bg-accent/15 px-1.5 py-0.5 text-xs text-accent"
        >
          {t}
          <button onClick={() => remove(t)} className="hover:text-fg" title="Remove tag">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(input)
          } else if (e.key === 'Backspace' && !input && tags.length) {
            remove(tags[tags.length - 1])
          }
        }}
        onBlur={() => input.trim() && add(input)}
        placeholder={tags.length ? '' : placeholder}
        className="min-w-[80px] flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
        spellCheck={false}
      />
    </div>
  )
}
