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

/** System turn for whole-paper Q&A: the full paper text is the grounding context. */
export function explainPaperSystem(targetLang: string, fullText: string): LlmMessage {
  return {
    role: 'system',
    content:
      `You are a knowledgeable research assistant helping a reader understand an ` +
      `academic paper. The paper's full text is provided below — ground every answer ` +
      `in it, define jargon, give intuition, and note why things matter. Respond in ` +
      `${targetLang}. Be concise; use headings or bullet points where they help.\n\n` +
      `=== PAPER FULL TEXT ===\n${fullText}`
  }
}

/** System turn for retrieval-grounded Q&A: the model answers from excerpts and
 * cites page numbers (used when the paper is too long to send in full). */
export function ragSystem(targetLang: string): LlmMessage {
  return {
    role: 'system',
    content:
      `You are a research assistant answering questions about an academic paper. You are ` +
      `given the most relevant excerpts, each tagged with its page like [p.3]. Answer using ` +
      `these excerpts and cite the pages you rely on inline (e.g. [p.3]). If the excerpts do ` +
      `not contain the answer, say so and suggest where in the paper to look. Respond in ` +
      `${targetLang}. Be concise.`
  }
}

/** User turn carrying retrieved excerpts plus the reader's question. */
export function ragUser(question: string, passages: string): LlmMessage {
  return { role: 'user', content: `Relevant excerpts:\n\n${passages}\n\nQuestion: ${question}` }
}

/** User turn that asks for an explanation of the whole paper. */
export function explainEverythingUser(): LlmMessage {
  return {
    role: 'user',
    content:
      `Explain the whole paper: the problem it addresses, the method/approach, the key ` +
      `results, and why it matters. Then I may ask follow-up questions.`
  }
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
