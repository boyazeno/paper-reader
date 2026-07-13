import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, Square, X, AlertCircle, Sparkles } from 'lucide-react'
import type { Block, LlmMessage } from '@shared/types'
import {
  explainSystem,
  explainFirstUser,
  explainPaperSystem,
  explainEverythingUser,
  ragSystem,
  ragUser
} from '@shared/prompts'
import { useStore } from '@renderer/store'
import { useTabActions } from '@renderer/lib/tab'
import { runLlm, LlmCancelled } from '@renderer/lib/llm'
import { retrieve } from '@renderer/lib/retrieval'
import {
  paperFitsContext,
  passageBudget,
  formatPassages,
  capByTokens,
  selectForOverview
} from '@renderer/lib/qaContext'
import { Button } from './ui'
import Markdown from './Markdown'
import { cn } from '@renderer/lib/cn'

interface Source {
  page: number
  blockId: string
}
interface ViewMsg {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
}

/** Unique pages (in order) from the blocks used to answer a turn. */
function pageSources(blocks: Block[]): Source[] {
  const seen = new Set<number>()
  const out: Source[] = []
  for (const b of blocks) {
    if (!seen.has(b.page)) {
      seen.add(b.page)
      out.push({ page: b.page, blockId: b.id })
    }
  }
  return out.sort((a, b) => a.page - b.page)
}

/**
 * Mini chat window. With `seedText` it explains that excerpt immediately. With
 * no excerpt it explains / answers questions about the whole paper: if the paper
 * fits the provider's context it is sent in full, otherwise the chat retrieves
 * the most relevant page-tagged excerpts per turn (shown as clickable sources).
 */
export default function ChatPanel({
  seedText,
  fullText,
  blocks,
  onClose
}: {
  seedText: string | null
  fullText: string
  blocks: Block[]
  onClose: () => void
}): JSX.Element {
  const settings = useStore((s) => s.settings)
  const provider = settings?.activeProvider ?? 'claude'
  const lang = settings?.targetLang ?? 'Chinese'
  const { setActiveBlock } = useTabActions()

  // Retrieval mode when there's no excerpt and the paper is too big to send whole.
  const ragMode = !seedText && !paperFitsContext(fullText, provider)

  const historyRef = useRef<LlmMessage[]>([])
  const liveRef = useRef('')
  const runRef = useRef<ReturnType<typeof runLlm> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)
  // Whether the view is pinned to the bottom (autoscroll while streaming).
  // Cleared when the user scrolls up so we stop fighting them.
  const atBottom = useRef(true)
  // Blocks that fed the in-flight turn, attached to its answer once it commits.
  const pendingSources = useRef<Block[]>([])

  const [view, setView] = useState<ViewMsg[]>([])
  const [live, setLive] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>(
    seedText ? 'loading' : 'idle'
  )
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')

  const commit = (content: string): void => {
    const used = pendingSources.current
    pendingSources.current = []
    historyRef.current = [...historyRef.current, { role: 'assistant', content }]
    setView((v) => [
      ...v,
      { role: 'assistant', content, sources: used.length ? pageSources(used) : undefined }
    ])
    setLive(null)
    setStatus('idle')
  }

  const runTurn = (): void => {
    setStatus('loading')
    setError(null)
    liveRef.current = ''
    setLive('')
    atBottom.current = true // a new turn re-pins to the bottom
    const run = runLlm(provider, historyRef.current, (full) => {
      liveRef.current = full
      setLive(full)
    })
    runRef.current = run
    run.promise
      .then((full) => commit(full))
      .catch((e) => {
        if (e instanceof LlmCancelled) {
          if (liveRef.current) commit(liveRef.current)
          else {
            pendingSources.current = []
            setLive(null)
            setStatus('idle')
          }
        } else {
          pendingSources.current = []
          setError(e instanceof Error ? e.message : 'Request failed.')
          setLive(null)
          setStatus('error')
        }
      })
  }

  // Seed the conversation. Excerpt → explain right away; whole-paper → wait for
  // the user, seeding either the full text (fits) or a retrieval instruction.
  useEffect(() => {
    if (started.current) return
    started.current = true
    if (seedText) {
      historyRef.current = [explainSystem(lang), explainFirstUser(seedText)]
      runTurn()
    } else if (ragMode) {
      historyRef.current = [ragSystem(lang)]
    } else {
      historyRef.current = [explainPaperSystem(lang, fullText)]
    }
    return () => runRef.current?.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const explainEverything = (): void => {
    if (status === 'loading') return
    if (ragMode) {
      const picked = selectForOverview(blocks, passageBudget(provider))
      pendingSources.current = picked
      historyRef.current = [
        ...historyRef.current,
        ragUser(
          'Explain the whole paper: the problem it addresses, the method/approach, the key results, and why it matters.',
          formatPassages(picked)
        )
      ]
    } else {
      historyRef.current = [...historyRef.current, explainEverythingUser()]
    }
    setView((v) => [...v, { role: 'user', content: 'Explain the whole paper' }])
    runTurn()
  }

  // Autoscroll to the newest content — but only while pinned to the bottom, so
  // a user who scrolled up to read isn't yanked back down on every token.
  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottom.current) el.scrollTo({ top: el.scrollHeight })
  }, [view, live])

  // Track whether the user is at the bottom; scrolling up unpins autoscroll.
  const onScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const send = (): void => {
    const text = input.trim()
    if (!text || status === 'loading') return
    setInput('')
    if (ragMode) {
      const hits = capByTokens(
        retrieve(blocks, text, 8).map((r) => r.block),
        passageBudget(provider)
      )
      pendingSources.current = hits
      historyRef.current = [...historyRef.current, ragUser(text, formatPassages(hits))]
    } else {
      historyRef.current = [...historyRef.current, { role: 'user', content: text }]
    }
    setView((v) => [...v, { role: 'user', content: text }])
    runTurn()
  }

  return (
    <div className="absolute bottom-4 right-4 z-50 flex h-[72%] w-[380px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <MessageCircle className="h-4 w-4 text-accent" />
        <span className="text-sm font-medium">Explain</span>
        {ragMode && (
          <span
            title="This paper is long — answers use the most relevant excerpts."
            className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent"
          >
            retrieval
          </span>
        )}
        <div className="flex-1" />
        <button onClick={onClose} title="Close" className="text-muted hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>

      {seedText && (
        <div className="border-b border-border px-3 py-2">
          <p className="line-clamp-2 text-xs italic text-muted">“{seedText}”</p>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-3 overflow-auto px-3 py-3"
      >
        {!seedText && view.length === 0 && status !== 'loading' && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-sm text-muted">
              {ragMode
                ? 'This paper is long — I’ll answer from the most relevant excerpts (with page citations). Explain it, or ask a question.'
                : 'Explain the whole paper, or ask a question about it below.'}
            </p>
            <Button variant="primary" onClick={explainEverything} disabled={!fullText}>
              <Sparkles className="h-4 w-4" />
              Explain everything
            </Button>
            {!fullText && (
              <p className="text-xs text-muted">Text is still being extracted…</p>
            )}
          </div>
        )}
        {view.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} sources={m.sources} onJump={setActiveBlock} />
        ))}
        {live != null && <Bubble role="assistant" content={live || '…'} />}
        {status === 'error' && (
          <div className="flex items-center gap-1 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-border p-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder="Ask a follow-up…"
          rows={1}
          className="max-h-24 flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        />
        {status === 'loading' ? (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => runRef.current?.cancel()}
            title="Stop"
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="primary"
            onClick={send}
            disabled={!input.trim()}
            title="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

function Bubble({
  role,
  content,
  sources,
  onJump
}: {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
  onJump?: (blockId: string) => void
}): JSX.Element {
  return (
    <div className={cn('flex flex-col gap-1', role === 'user' ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed',
          role === 'user'
            ? 'whitespace-pre-wrap bg-accent text-accent-fg'
            : 'border border-border bg-bg text-fg'
        )}
      >
        {role === 'assistant' ? <Markdown>{content}</Markdown> : content}
      </div>
      {sources && sources.length > 0 && (
        <div className="flex max-w-[85%] flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted">Sources:</span>
          {sources.map((s) => (
            <button
              key={s.blockId}
              onClick={() => onJump?.(s.blockId)}
              title="Jump to this page in the PDF"
              className="rounded bg-border/50 px-1.5 py-0.5 text-[10px] text-accent hover:bg-border"
            >
              p.{s.page}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
