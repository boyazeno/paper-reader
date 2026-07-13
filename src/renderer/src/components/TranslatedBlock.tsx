import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { RefreshCw, AlertCircle, Square, Languages } from 'lucide-react'
import type { Block, ProviderId } from '@shared/types'
import { translatePrompt } from '@shared/prompts'
import { useTabActions } from '@renderer/lib/tab'
import { runLlm, LlmCancelled } from '@renderer/lib/llm'
import { Spinner } from './ui'
import Markdown from './Markdown'
import { cn } from '@renderer/lib/cn'

interface Props {
  block: Block
  provider: ProviderId
  targetLang: string
  /** Translate automatically when the block scrolls into view. */
  autoTranslate: boolean
  active: boolean
  selected: boolean
  hover: boolean
  searchMatch: boolean
  /** The find query, when this block is the current search hit. */
  searchQuery: string
  onPick: (additive: boolean, range: boolean) => void
  onHover: (v: boolean) => void
}

/** Wrap each case-insensitive occurrence of `query` in `text` with a mark. */
function highlightParts(text: string, query: string): ReactNode {
  const q = query.trim()
  if (!q) return text
  const low = text.toLowerCase()
  const lq = q.toLowerCase()
  const out: React.ReactNode[] = []
  let i = 0
  let idx = low.indexOf(lq)
  while (idx !== -1) {
    if (idx > i) out.push(text.slice(i, idx))
    out.push(
      <mark key={idx} className="rounded-[1px] bg-amber-300/70 text-inherit">
        {text.slice(idx, idx + q.length)}
      </mark>
    )
    i = idx + q.length
    idx = low.indexOf(lq, i)
  }
  out.push(text.slice(i))
  return out
}

type Status = 'idle' | 'loading' | 'done' | 'error' | 'stopped'

export default function TranslatedBlock({
  block,
  provider,
  targetLang,
  autoTranslate,
  active,
  selected,
  hover,
  searchMatch,
  searchQuery,
  onPick,
  onHover
}: Props): JSX.Element {
  const { updateBlock } = useTabActions()
  const ref = useRef<HTMLDivElement>(null)
  const [live, setLive] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>(block.translation ? 'done' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const runRef = useRef<ReturnType<typeof runLlm> | null>(null)

  const translate = useCallback(() => {
    setStatus('loading')
    setError(null)
    setLive('')
    const run = runLlm(provider, translatePrompt(block.text, targetLang), setLive)
    runRef.current = run
    run.promise
      .then((full) => {
        updateBlock(block.id, { translation: full })
        setStatus('done')
        setLive(null)
      })
      .catch((e) => {
        if (e instanceof LlmCancelled) {
          setStatus('stopped')
          setLive(null)
        } else {
          setError(e instanceof Error ? e.message : 'Translation failed.')
          setStatus('error')
        }
      })
  }, [provider, targetLang, block.id, block.text, updateBlock])

  const stop = (e: React.MouseEvent): void => {
    e.stopPropagation()
    runRef.current?.cancel()
  }

  // While auto-translate is on, translate the first time the block scrolls into
  // view. When it's off, the user translates each paragraph manually (button).
  useEffect(() => {
    const el = ref.current
    if (!el || block.translation || status !== 'idle' || !autoTranslate) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          io.disconnect()
          translate()
        }
      },
      { rootMargin: '200px 0px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [block.translation, status, translate, autoTranslate])

  useEffect(() => () => runRef.current?.cancel(), [])

  const regenerate = (e: React.MouseEvent): void => {
    e.stopPropagation()
    runRef.current?.cancel()
    updateBlock(block.id, { translation: undefined }, true) // record for undo
    translate()
  }

  const showText = block.translation ?? live ?? ''
  const untranslated =
    !block.translation &&
    (status === 'idle' || status === 'stopped' || (status === 'loading' && live === ''))

  return (
    <div
      ref={ref}
      data-tblock={block.id}
      onClick={(e) => onPick(e.ctrlKey || e.metaKey, e.shiftKey)}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={cn(
        'group relative cursor-pointer rounded-md px-3 py-2 text-[15px] leading-relaxed transition-colors',
        // Box-highlight only when translated (can't mark the exact original
        // text there); untranslated blocks mark the matched substring instead.
        searchMatch && !untranslated
          ? 'bg-amber-300/30 ring-1 ring-amber-400'
          : active
            ? 'bg-accent/15 ring-1 ring-accent/40'
            : selected
              ? 'bg-accent/10 ring-1 ring-accent/30'
              : hover
                ? 'bg-border/40'
                : 'hover:bg-border/30'
      )}
    >
      {untranslated ? (
        searchMatch && searchQuery.trim() ? (
          // Plain text while searching so the exact match can be marked.
          <span className="text-muted">{highlightParts(block.text, searchQuery)}</span>
        ) : (
          <Markdown className="text-muted">{block.text}</Markdown>
        )
      ) : (
        <Markdown>{showText}</Markdown>
      )}

      {/* status / stop / regenerate affordances */}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-1">
        {status === 'idle' && !block.translation && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              translate()
            }}
            title="Translate this paragraph"
            className="rounded p-1 text-muted opacity-0 transition-opacity hover:bg-border hover:text-fg group-hover:opacity-100"
          >
            <Languages className="h-3.5 w-3.5" />
          </button>
        )}
        {status === 'loading' && (
          <>
            <Spinner className="text-muted" />
            <button
              onClick={stop}
              title="Stop translation"
              className="rounded p-1 text-muted hover:bg-border hover:text-fg"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          </>
        )}
        {status === 'error' && <AlertCircle className="h-4 w-4 text-red-400" />}
        {(status === 'done' || status === 'error' || status === 'stopped') && (
          <button
            onClick={regenerate}
            title={status === 'stopped' ? 'Translate' : 'Regenerate translation'}
            className="rounded p-1 text-muted opacity-0 transition-opacity hover:bg-border group-hover:opacity-100"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {error && <div className="mt-1 text-xs text-red-400">{error}</div>}
    </div>
  )
}
