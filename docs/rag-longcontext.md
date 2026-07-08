# Long-PDF context for Q&A

## Problem

The "Explain it" chat grounds answers in the paper. The first implementation put
the **entire** extracted text into the system prompt (`explainPaperSystem`). For
long PDFs that:

- overflows smaller context windows (fatal for local Ollama models),
- is expensive on every multi-turn message, and
- triggers **"lost in the middle"** — LLM accuracy follows a U-shaped curve and
  drops >30% when the relevant passage sits in the middle of a long context.

## Methods considered (matching content in long context)

- **Long-context vs RAG — route, don't pick.** Best 2025–26 results route: send
  focused questions to retrieval and global/multi-hop ones to full context.
  Order-preserving RAG with ~48K well-chosen tokens has beaten full-context at
  117K tokens — quality over quantity.
- **Anthropic Contextual Retrieval:** hybrid dense-embeddings + BM25 (+ optional
  per-chunk context header) + reranking; ~-49% retrieval failures (-67% with a
  reranker).
- **Local embeddings** (`transformers.js` + `all-MiniLM-L6-v2`, 384-dim) with
  in-memory cosine scale to ~10K chunks — plenty for one paper, fully offline.
- **Prompt caching** for a fixed document across a chat: Anthropic −90% on
  cached input (explicit `cache_control`), OpenAI −50% (implicit), Gemini ~−75%.

Key leverage for this app: we already extract **paragraph `blocks`** that carry
`page` + `id` + `bbox` — natural chunks with built-in **citations and
scroll-to**, which most RAG stacks have to reconstruct.

## Design — routed, tiered, local-first

1. **Size router.** Estimate paper tokens (`chars/4`) against a per-provider
   budget. Fits → send in full (with prompt caching). Too big → retrieval.
2. **Retrieval over blocks.** Rank blocks per question, send only the top ones as
   page-tagged excerpts; the model cites `[p.N]` and the UI turns those into
   clickable chips that scroll the PDF.
3. **Global "Explain everything".** If it fits → full text. If not → a spread of
   blocks sampled across the paper (Phase 1); map-reduce section summaries later.

## Status

### Phase 1 — shipped

- `lib/retrieval.ts` — dependency-free **BM25** over blocks (`retrieve`,
  `tokenize`, `estimateTokens`).
- `lib/qaContext.ts` — per-provider `STUFF_BUDGET`, `paperFitsContext`,
  `passageBudget`, `formatPassages`, `capByTokens`, `selectForOverview`.
- `ChatPanel` — routes stuff vs retrieval; in retrieval mode shows a `retrieval`
  badge, retrieves per turn, and renders clickable **Sources: p.N** chips
  (`setActiveBlock` → scroll). Excerpt-explain path unchanged.
- `main/llm/claude.ts` — `cache_control: ephemeral` on the system block so the
  stuffed paper text is cached across turns (no-op below the min cache size).
- Budgets: `claude/openai/openrouter = 100–150K`, `ollama = 6K`.

### Phase 2 — next

- Local **dense embeddings** (`transformers.js` MiniLM) → **hybrid** BM25 + cosine,
  computed once per paper and persisted as a sidecar in the `.paperproj` folder.
- Decisions to settle: local vs API embeddings (default local for privacy) and
  the per-provider context-budget table.

### Phase 3 — later

- **Map-reduce** section summaries for global questions; optional **reranking**;
  Anthropic-style **contextual chunk headers**.

## Sources

- Anthropic — Contextual Retrieval: https://www.anthropic.com/engineering/contextual-retrieval
- RAGFlow 2025 review: https://ragflow.io/blog/rag-review-2025-from-rag-to-context
- Long-context vs RAG decision framework: https://tianpan.co/blog/2026-04-09-long-context-vs-rag-production-decision-framework
- "Lost in the middle" techniques: https://www.getmaxim.ai/articles/solving-the-lost-in-the-middle-problem-advanced-rag-techniques-for-long-context-llms/
- Vector embeddings in Node.js (MiniLM): https://philna.sh/blog/2024/09/25/how-to-create-vector-embeddings-in-node-js/
- Prompt caching compared: https://www.prompthub.us/blog/prompt-caching-with-openai-anthropic-and-google-models
