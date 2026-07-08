import { useMemo, useState } from 'react'
import { X, Copy, Check } from 'lucide-react'
import { useTab, useTabActions } from '@renderer/lib/tab'
import { extractReferences } from '@renderer/lib/references'

/** Hideable column listing the paper's references; click one to copy its text. */
export default function ReferencesPanel(): JSX.Element {
  const blocks = useTab((t) => t?.project.blocks ?? [])
  const { toggleRefs } = useTabActions()
  const refs = useMemo(() => extractReferences(blocks), [blocks])
  const [copied, setCopied] = useState<number | null>(null)

  const copy = async (i: number, text: string): Promise<void> => {
    await window.api.clipboard.write(text)
    setCopied(i)
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 1200)
  }

  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-medium">References</span>
        <span className="text-xs text-muted">{refs.length}</span>
        <div className="flex-1" />
        <button onClick={toggleRefs} title="Hide references" className="text-muted hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-1 overflow-auto px-2 py-2">
        {refs.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted">
            No references detected.
          </p>
        ) : (
          refs.map((r, i) => (
            <button
              key={i}
              onClick={() => copy(i, `${r.marker} ${r.text}`)}
              title="Copy reference"
              className="group relative block w-full rounded-md px-2 py-1.5 pr-7 text-left text-[13px] leading-relaxed hover:bg-border/40"
            >
              <span className="mr-1 font-medium text-accent">{r.marker}</span>
              {r.text}
              <span className="absolute right-1.5 top-1.5">
                {copied === i ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                )}
              </span>
            </button>
          ))
        )}
      </div>
    </aside>
  )
}
