import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, Square, X, AlertCircle } from 'lucide-react'
import type { LlmMessage } from '@shared/types'
import { explainSystem, explainFirstUser } from '@shared/prompts'
import { useStore } from '@renderer/store'
import { runLlm, LlmCancelled } from '@renderer/lib/llm'
import { Button } from './ui'
import Markdown from './Markdown'
import { cn } from '@renderer/lib/cn'

interface ViewMsg {
  role: 'user' | 'assistant'
  content: string
}

/** Mini chat window: explains the selected excerpt, then keeps chatting. */
export default function ChatPanel({
  seedText,
  onClose
}: {
  seedText: string
  onClose: () => void
}): JSX.Element {
  const settings = useStore((s) => s.settings)
  const provider = settings?.activeProvider ?? 'claude'
  const lang = settings?.targetLang ?? 'Chinese'

  const historyRef = useRef<LlmMessage[]>([])
  const liveRef = useRef('')
  const runRef = useRef<ReturnType<typeof runLlm> | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const started = useRef(false)

  const [view, setView] = useState<ViewMsg[]>([])
  const [live, setLive] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'idle' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')

  const commit = (content: string): void => {
    historyRef.current = [...historyRef.current, { role: 'assistant', content }]
    setView((v) => [...v, { role: 'assistant', content }])
    setLive(null)
    setStatus('idle')
  }

  const runTurn = (): void => {
    setStatus('loading')
    setError(null)
    liveRef.current = ''
    setLive('')
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
            setLive(null)
            setStatus('idle')
          }
        } else {
          setError(e instanceof Error ? e.message : 'Request failed.')
          setLive(null)
          setStatus('error')
        }
      })
  }

  // Kick off the initial explanation.
  useEffect(() => {
    if (started.current) return
    started.current = true
    historyRef.current = [explainSystem(lang), explainFirstUser(seedText)]
    runTurn()
    return () => runRef.current?.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autoscroll to the newest content.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight })
  }, [view, live])

  const send = (): void => {
    const text = input.trim()
    if (!text || status === 'loading') return
    setInput('')
    historyRef.current = [...historyRef.current, { role: 'user', content: text }]
    setView((v) => [...v, { role: 'user', content: text }])
    runTurn()
  }

  return (
    <div className="absolute bottom-4 right-4 z-50 flex h-[72%] w-[380px] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <MessageCircle className="h-4 w-4 text-accent" />
        <span className="text-sm font-medium">Explain</span>
        <div className="flex-1" />
        <button onClick={onClose} title="Close" className="text-muted hover:text-fg">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="border-b border-border px-3 py-2">
        <p className="line-clamp-2 text-xs italic text-muted">“{seedText}”</p>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-auto px-3 py-3">
        {view.map((m, i) => (
          <Bubble key={i} role={m.role} content={m.content} />
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
  content
}: {
  role: 'user' | 'assistant'
  content: string
}): JSX.Element {
  return (
    <div className={cn('flex', role === 'user' ? 'justify-end' : 'justify-start')}>
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
    </div>
  )
}
