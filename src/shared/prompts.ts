import type { LlmMessage } from './types'

/** Prompt builders for the three LLM tasks. Shared so main + renderer agree. */

export function translatePrompt(text: string, targetLang: string): LlmMessage[] {
  return [
    {
      role: 'system',
      content:
        `You are an expert academic translator. Translate the user's text into ${targetLang}. ` +
        `Preserve technical terms, math, and citations. Keep inline notation as-is. ` +
        `Output ONLY the translation — no preamble, no notes.`
    },
    { role: 'user', content: text }
  ]
}

export function summarizePrompt(text: string, targetLang: string): LlmMessage[] {
  return [
    {
      role: 'system',
      content:
        `You summarize academic text concisely in ${targetLang}. Produce 2-4 sentences ` +
        `capturing the key claim, method, and result. No preamble.`
    },
    { role: 'user', content: text }
  ]
}

/** Default system prompt for "Find inspirations". `{lang}` is substituted with
 * the target language at send time. Editable in Settings. */
export const DEFAULT_INSPIRE_PROMPT =
  'You are a research ideation partner. Given an excerpt from a paper, propose ' +
  '2-3 concrete, novel research directions, open questions, or connections it inspires. ' +
  'Be specific and technical. Answer in {lang}. Use short bullet points.'

/** System turn for the "Explain it" chat. */
export function explainSystem(targetLang: string): LlmMessage {
  return {
    role: 'system',
    content:
      `You are a knowledgeable research assistant helping a reader understand an ` +
      `academic paper. First explain the selected excerpt clearly and intuitively — ` +
      `define jargon, give intuition, and note why it matters. Then answer the ` +
      `reader's follow-up questions conversationally. Respond in ${targetLang}. Be concise.`
  }
}

/** First user turn carrying the selected excerpt to explain. */
export function explainFirstUser(text: string): LlmMessage {
  return { role: 'user', content: `Explain this excerpt:\n\n"""\n${text}\n"""` }
}

export function inspirePrompt(
  text: string,
  targetLang: string,
  template: string = DEFAULT_INSPIRE_PROMPT
): LlmMessage[] {
  const system = (template || DEFAULT_INSPIRE_PROMPT).replaceAll('{lang}', targetLang)
  return [
    { role: 'system', content: system },
    { role: 'user', content: text }
  ]
}
