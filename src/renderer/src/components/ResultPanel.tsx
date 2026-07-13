import { useEffect, useRef, useState } from 'react'
import { Sparkles, Lightbulb, RefreshCw, Square, X, AlertCircle } from 'lucide-react'
import { useStore } from '@renderer/store'
import { runLlm, LlmCancelled } from '@renderer/lib/llm'
import { summarizePrompt, inspirePrompt } from '@shared/prompts'
import { Button, Spinner } from './ui'
import Markdown from './Markdown'
import type { LlmTask } from '@shared/types'

export interface Task {
  kind: Extract<LlmTask, 'summarize' | 'inspire'>
  text: string
  /** Bumped to force a regenerate. */
  nonce: number
}

const META = {
  summarize: { title: 'Summary', Icon: Sparkles, build: summarizePrompt },
  inspire: { title: 'Inspirations', Icon: Lightbulb, build: inspirePrompt }
} as const

/** Bottom sheet that streams a summarize / inspire result, with regenerate. */
export default function ResultPanel({
  task,
  onClose,
  onRegenerate
}: {
  task: Task
  onClose: () => void
  onRegenerate: () => void
}): JSX.Element {
  const settings = useStore((s) => s.settings)
  const [out, setOut] = useState('')
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const runRef = useRef<ReturnType<typeof runLlm> | null>(null)

  const { title, Icon, build } = META[task.kind]

  useEffect(() => {
    const provider = settings?.activeProvider ?? 'claude'
    const lang = settings?.targetLang ?? 'Chinese'
    setOut('')
    setStatus('loading')
    setError(null)
    // Inspire uses the user-editable prompt from settings.
    const messages =
      task.kind === 'inspire'
        ? inspirePrompt(task.text, lang, settings?.inspirePrompt)
        : build(task.text, lang)
    const run = runLlm(provider, messages, setOut)
    runRef.current = run
    run.promise
      .then(() => setStatus('done'))
      .catch((e) => {
        // A user stop keeps whatever streamed so far; only real errors show red.
        if (e instanceof LlmCancelled) setStatus('done')
        else {
          setError(e instanceof Error ? e.message : 'Request failed.')
          setStatus('error')
        }
      })
    return () => run.cancel()
  }, [task.nonce, task.kind, task.text, build, settings])

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 mx-auto max-w-3xl px-4 pb-4">
      <div className="flex max-h-[42vh] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <Icon className="h-4 w-4 text-accent" />
          <span className="text-sm font-medium">{title}</span>
          {status === 'loading' && <Spinner className="text-muted" />}
          <div className="flex-1" />
          {status === 'loading' ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => runRef.current?.cancel()}
              title="Stop"
            >
              <Square className="h-4 w-4 fill-current" />
              Stop
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={onRegenerate} title="Regenerate">
              <RefreshCw className="h-4 w-4" />
              Regenerate
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={onClose} title="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-auto overscroll-contain px-4 py-3 text-[15px] leading-relaxed">
          {error ? (
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          ) : (
            <Markdown>{out || '…'}</Markdown>
          )}
        </div>
      </div>
    </div>
  )
}
