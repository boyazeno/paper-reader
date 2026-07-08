import type { Block, ProviderId } from '@shared/types'
import { estimateTokens } from './retrieval'

/**
 * Context-budget routing for the Q&A chat. If a paper fits comfortably in the
 * active provider's window we send it in full (and let prompt caching keep
 * multi-turn cheap); otherwise the chat switches to retrieval and only sends the
 * relevant excerpts per turn. Budgets are conservative token ceilings for how
 * much *paper* we're willing to stuff — not the model's hard limit.
 */
const STUFF_BUDGET: Record<ProviderId, number> = {
  claude: 150_000,
  openai: 100_000,
  openrouter: 100_000,
  ollama: 6_000 // local models are usually small-context
}

export function stuffBudget(provider: ProviderId): number {
  return STUFF_BUDGET[provider] ?? 60_000
}

/** Does the whole paper fit the provider's stuffing budget? */
export function paperFitsContext(fullText: string, provider: ProviderId): boolean {
  return estimateTokens(fullText) <= stuffBudget(provider)
}

/** Token ceiling for retrieved excerpts sent on a single retrieval turn. */
export function passageBudget(provider: ProviderId): number {
  return Math.max(1_500, Math.floor(stuffBudget(provider) * 0.4))
}

/** Format blocks as page-tagged excerpts for the LLM. */
export function formatPassages(blocks: Block[]): string {
  return blocks.map((b) => `[p.${b.page}] ${b.text}`).join('\n\n')
}

/** Trim a ranked block list to a token budget (keeps order). */
export function capByTokens(blocks: Block[], maxTokens: number): Block[] {
  const out: Block[] = []
  let used = 0
  for (const b of blocks) {
    const t = estimateTokens(b.text)
    if (out.length && used + t > maxTokens) break
    out.push(b)
    used += t
  }
  return out
}

/**
 * Pick a spread of blocks across the whole paper (for a global "explain
 * everything" when the full text won't fit) — evenly sampled so intro, method,
 * and results are all represented, capped to `maxTokens`.
 */
export function selectForOverview(blocks: Block[], maxTokens: number): Block[] {
  if (blocks.length === 0) return []
  const avg = estimateTokens(blocks.map((b) => b.text).join(' ')) / blocks.length || 1
  const capacity = Math.max(1, Math.floor(maxTokens / avg))
  if (capacity >= blocks.length) return blocks
  const stride = blocks.length / capacity
  const out: Block[] = []
  for (let i = 0; i < capacity; i++) out.push(blocks[Math.floor(i * stride)])
  return out
}
