// Shared domain types used by both the main and renderer processes.

export type ProviderId = 'openrouter' | 'openai' | 'claude' | 'ollama'

export interface ProviderConfig {
  id: ProviderId
  /** Model identifier, e.g. "claude-opus-4-8", "gpt-4o", "llama3.1". */
  model: string
  /** Base URL override (mainly for Ollama / self-hosted gateways). */
  baseUrl?: string
}

export interface AppSettings {
  activeProvider: ProviderId
  providers: Record<ProviderId, ProviderConfig>
  /** Target language for translation, e.g. "Chinese", "German", "English". */
  targetLang: string
  theme: 'light' | 'dark' | 'system'
  /** Editable system prompt for "Find inspirations"; `{lang}` is substituted. */
  inspirePrompt: string
  /** Whether the first-run guidance tour has been seen. */
  tourCompleted: boolean
  /** Vault folder holding all projects + the bookmark library (Obsidian-style). */
  vaultPath: string
}

/** A bounding box in PDF user-space units: [x, y, width, height], origin top-left. */
export type BBox = [number, number, number, number]

/** One extracted paragraph / region of the PDF — the unit of translation + sync. */
export interface Block {
  id: string
  page: number
  bbox: BBox
  text: string
  translation?: string
  summary?: string
}

export interface Note {
  id: string
  /** TipTap/ProseMirror JSON document. */
  doc: unknown
  /** Relative image paths (under the project's images/ dir). */
  images: string[]
  /** Optional anchor to a paragraph block. */
  linkedBlockId?: string
  createdAt: number
}

export interface ProjectMeta {
  title: string
  source: string
  createdAt: number
  lang: string
}

export interface Project {
  meta: ProjectMeta
  /** Path to the PDF on disk (inside the project folder once saved). */
  pdfPath: string
  blocks: Block[]
  notes: Note[]
}

// ---- window session (restored on next launch) ----

/** One open tab's restorable state: which project + where it was scrolled. */
export interface SessionTab {
  /** Absolute path to the `.paperproj` folder. */
  dir: string
  pdfScroll: number
  transScroll: number
}

export interface SessionData {
  tabs: SessionTab[]
  /** Index into `tabs` of the tab that was active. */
  activeIndex: number
}

// ---- recents & bookmark library ----

/** A recently opened/saved project (MRU list). */
export interface RecentEntry {
  /** Absolute path to the `.paperproj` folder. */
  path: string
  title: string
  openedAt: number
}

/** A bookmarked paper stored in the library "database". */
export interface Bookmark {
  id: string
  title: string
  source: string
  /** `.paperproj` folder to reopen, if the project was saved. */
  projectPath: string | null
  /** User-defined, modifiable tags. */
  tags: string[]
  /** Short text excerpt (paper + notes) to make content searchable. */
  snippet: string
  addedAt: number
}

// ---- git vault sync ----

export interface GitInfo {
  isRepo: boolean
  hasRemote: boolean
  remoteUrl: string | null
  branch: string
  mergeInProgress: boolean
}

export type GitSyncResult =
  | { status: 'ok'; message?: string }
  | { status: 'no-remote' }
  | { status: 'conflict'; files: string[] }
  | { status: 'error'; message: string }

// ---- LLM ----

export type LlmTask = 'translate' | 'summarize' | 'inspire'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  /** Correlates streamed chunks back to the caller. */
  streamId: string
  provider: ProviderId
  messages: LlmMessage[]
}

export interface LlmChunkEvent {
  streamId: string
  delta: string
}

export interface LlmDoneEvent {
  streamId: string
  error?: string
}

// ---- Paper intake ----

export interface IntakeResult {
  pdfPath: string
  title: string
  source: string
}
