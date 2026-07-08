import type { LlmMessage, ProviderId } from '@shared/types'
import { useStore } from '@renderer/store'

let counter = 0
export function newStreamId(prefix = 's'): string {
  counter += 1
  return `${prefix}-${Date.now()}-${counter}`
}

/** Thrown when a run is stopped by the user (distinct from a real error). */
export class LlmCancelled extends Error {
  constructor() {
    super('cancelled')
    this.name = 'LlmCancelled'
  }
}

// --- tiny concurrency limiter so we don't fire dozens of translations at once ---
const MAX_CONCURRENT = 3
let active = 0
const queue: (() => void)[] = []

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active += 1
    return Promise.resolve()
  }
  return new Promise((resolve) => queue.push(resolve))
}
function release(): void {
  active -= 1
  const next = queue.shift()
  if (next) {
    active += 1
    next()
  }
}

export interface LlmRun {
  streamId: string
  /** Resolves with the full text, rejects with LlmCancelled if stopped. */
  promise: Promise<string>
  cancel: () => void
}

// Registry of in-flight runs so a global "Stop all" can reach every one.
const activeRuns = new Set<LlmRun>()

function bumpRunning(n: number): void {
  useStore.setState((s) => ({ runningLlm: Math.max(0, s.runningLlm + n) }))
}

/** Stop every in-flight LLM run (translations, summarize, inspire). */
export function cancelAllLlm(): void {
  for (const run of [...activeRuns]) run.cancel()
}

/**
 * Run a streaming LLM task. `onDelta` receives the cumulative text so far.
 * Respects a global concurrency cap; returns a handle for cancellation.
 */
export function runLlm(
  provider: ProviderId,
  messages: LlmMessage[],
  onDelta: (full: string) => void
): LlmRun {
  const streamId = newStreamId()
  let full = ''
  let cancelled = false

  const run: LlmRun = {
    streamId,
    promise: Promise.resolve(''),
    cancel: () => {
      cancelled = true
      window.api.llm.cancel(streamId)
    }
  }

  activeRuns.add(run)
  bumpRunning(1)

  run.promise = (async () => {
    await acquire()
    const off = window.api.llm.onChunk((e) => {
      if (e.streamId !== streamId) return
      full += e.delta
      onDelta(full)
    })
    try {
      if (cancelled) throw new LlmCancelled()
      const res = await window.api.llm.start({ streamId, provider, messages })
      if (cancelled) throw new LlmCancelled()
      if (!res.ok) throw new Error(res.error || 'LLM request failed.')
      return full
    } finally {
      off()
      release()
      activeRuns.delete(run)
      bumpRunning(-1)
    }
  })()

  return run
}
