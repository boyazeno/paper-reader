import { create } from 'zustand'
import type { AppSettings, Block, IntakeResult, Project } from '@shared/types'

export type View = 'welcome' | 'reader' | 'settings' | 'library'

/** Everything scoped to one open paper (one tab). */
export interface TabState {
  id: string
  project: Project
  /** Folder the project was saved to / opened from; null until a Save As. */
  savedPath: string | null
  /** Block currently selected (drives the left↔right highlight + scroll). */
  activeBlockId: string | null
  /** Block under the pointer (lighter, transient highlight). */
  hoverBlockId: string | null
  /** Multi-selection for batch LLM actions (summarize / inspire). */
  selectedBlockIds: string[]
  /** Whether the notes column is visible. */
  showNotes: boolean
  /** Whether the references column is visible. */
  showRefs: boolean
  /** Auto-translate blocks as they scroll into view (off by default). */
  autoTranslate: boolean
  /** Undo / redo history over committed project edits. */
  past: Project[]
  future: Project[]
  /** Timestamp of the last note keystroke (coalesces undo steps). */
  lastNoteEditTs: number
  /** Full extracted paper text (blocks joined), cached as LLM Q&A context. */
  originalText: string
  /** Whether the Ctrl+F find bar is open. */
  searchOpen: boolean
  /** Block the current search hit lives in (drives scroll + highlight). */
  searchMatchId: string | null
  /** The active find query (for highlighting the exact matched text). */
  searchQuery: string
  /** One-shot pane scroll offsets to apply on restore from a saved session. */
  restore: { pdf: number; trans: number } | null
}

interface AppState {
  view: View
  settings: AppSettings | null
  /** Number of in-flight LLM runs (maintained by lib/llm). */
  runningLlm: number
  /** Whether the Scholar Inbox embedded browser overlay is showing. */
  scholarOpen: boolean

  // ---- tabs (one per open paper) ----
  tabs: Record<string, TabState>
  tabOrder: string[]
  activeTabId: string | null

  // ---- global ----
  setView: (v: View) => void
  setSettings: (s: AppSettings) => void
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>
  init: () => Promise<void>
  openScholar: () => void
  closeScholar: () => void

  // ---- tab management ----
  openTab: (
    project: Project,
    savedPath: string | null,
    restore?: { pdf: number; trans: number }
  ) => string
  closeTab: (id: string) => void
  switchTab: (id: string) => void

  // ---- per-tab (operate on tabs[tabId]) ----
  setBlocks: (tabId: string, blocks: Block[]) => void
  updateBlock: (tabId: string, id: string, patch: Partial<Block>, record?: boolean) => void
  setActiveBlock: (tabId: string, id: string | null) => void
  setHoverBlock: (tabId: string, id: string | null) => void
  /**
   * Select a block. `additive` (Ctrl/Cmd) toggles it into the multi-selection;
   * `range` (Shift) selects every block from the anchor to this one.
   */
  selectBlock: (tabId: string, id: string, additive: boolean, range?: boolean) => void
  clearSelection: (tabId: string) => void
  toggleNotes: (tabId: string) => void
  toggleRefs: (tabId: string) => void
  toggleAutoTranslate: (tabId: string) => void
  openSearch: (tabId: string) => void
  closeSearch: (tabId: string) => void
  setSearchMatch: (tabId: string, id: string | null) => void
  setSearchQuery: (tabId: string, query: string) => void
  /** Replace the project's note document (rich-text JSON + referenced images). */
  setNote: (tabId: string, doc: unknown, images: string[]) => void
  undo: (tabId: string) => void
  redo: (tabId: string) => void
  save: (tabId: string) => Promise<void>
  saveAs: (tabId: string) => Promise<void>
  /** Rename the paper (its display title); persists if the project is saved. */
  renameProject: (tabId: string, title: string) => Promise<void>

  // ---- open paths (create / activate tabs) ----
  openIntake: (r: IntakeResult) => void
  openExisting: () => Promise<void>
  openProjectPath: (dir: string) => Promise<void>
}

const HISTORY_LIMIT = 50

let tabSeq = 0
const genId = (): string => `tab-${Date.now()}-${++tabSeq}`

const dirOf = (pdfPath: string): string => pdfPath.replace(/\/paper\.pdf$/, '')

/** Join a paper's blocks into a single plain-text document for LLM context. */
const blocksToText = (blocks: Block[]): string => blocks.map((b) => b.text).join('\n\n')

/** If a project's `source` is a re-fetchable direct-PDF URL (arXiv or a `.pdf`
 * link), return the normalized re-download URL; else null. Used to migrate old
 * URL projects to the lean (PDF-out-of-git) format. */
function directPdfUrl(source: string): string | null {
  try {
    const u = new URL(source)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    const abs = u.pathname.match(/\/abs\/([^/]+)$/)
    if (u.hostname.includes('arxiv.org') && abs) {
      u.pathname = `/pdf/${abs[1]}`
      return u.toString()
    }
    if (u.hostname.includes('arxiv.org') && u.pathname.includes('/pdf/')) return source
    if (/\.pdf($|\?)/i.test(u.pathname)) return source
    return null
  } catch {
    return null
  }
}

function makeTab(
  project: Project,
  savedPath: string | null,
  restore: { pdf: number; trans: number } | null = null
): TabState {
  return {
    id: genId(),
    project,
    savedPath,
    activeBlockId: null,
    hoverBlockId: null,
    selectedBlockIds: [],
    showNotes: false,
    showRefs: false,
    autoTranslate: false,
    past: [],
    future: [],
    lastNoteEditTs: 0,
    originalText: blocksToText(project.blocks),
    searchOpen: false,
    searchMatchId: null,
    searchQuery: '',
    restore
  }
}

function recordRecent(path: string, title: string): void {
  window.api.recents.add({ path, title, openedAt: Date.now() })
}

export const useStore = create<AppState>((set, get) => {
  /** Immutably patch one tab's slice. */
  const updateTab = (tabId: string, fn: (t: TabState) => Partial<TabState>): void =>
    set((s) => {
      const t = s.tabs[tabId]
      if (!t) return {}
      return { tabs: { ...s.tabs, [tabId]: { ...t, ...fn(t) } } }
    })

  /** Migrate an opened project to the lean format: if its PDF is re-fetchable
   * but not yet marked, write its per-project .gitignore + record `pdfUrl`, so
   * the next sync drops the PDF from git. Best-effort, fire-and-forget. */
  const backfillRefetch = (tabId: string): void => {
    const t = get().tabs[tabId]
    if (!t?.savedPath || t.project.meta.pdfUrl) return
    const url = directPdfUrl(t.project.meta.source)
    if (!url) return
    void window.api.intake
      .markRefetchable(t.project.pdfPath)
      .then(async () => {
        updateTab(tabId, (tt) => ({
          project: { ...tt.project, meta: { ...tt.project.meta, pdfUrl: url } }
        }))
        const proj = get().tabs[tabId]?.project
        if (proj) await window.api.project.save(proj)
      })
      .catch(() => {})
  }

  return {
    view: 'welcome',
    settings: null,
    runningLlm: 0,
    scholarOpen: false,
    tabs: {},
    tabOrder: [],
    activeTabId: null,

    setView: (view) => set({ view }),
    setSettings: (settings) => set({ settings }),
    openScholar: () => set({ scholarOpen: true }),
    closeScholar: () => set({ scholarOpen: false }),

    patchSettings: async (patch) => {
      const cur = get().settings
      if (!cur) return
      const next = { ...cur, ...patch }
      set({ settings: next })
      await window.api.settings.set(next)
    },

    init: async () => {
      const settings = await window.api.settings.get()
      set({ settings })
    },

    // ---- tab management ----
    openTab: (project, savedPath, restore) => {
      const tab = makeTab(project, savedPath, restore ?? null)
      set((s) => ({
        tabs: { ...s.tabs, [tab.id]: tab },
        tabOrder: [...s.tabOrder, tab.id],
        activeTabId: tab.id,
        view: 'reader'
      }))
      return tab.id
    },

    closeTab: (id) =>
      set((s) => {
        if (!s.tabs[id]) return {}
        const order = s.tabOrder.filter((x) => x !== id)
        const tabs = { ...s.tabs }
        delete tabs[id]
        let activeTabId = s.activeTabId
        let view = s.view
        if (s.activeTabId === id) {
          if (order.length) {
            const idx = Math.min(s.tabOrder.indexOf(id), order.length - 1)
            activeTabId = order[Math.max(0, idx)]
          } else {
            activeTabId = null
            view = 'welcome'
          }
        }
        return { tabs, tabOrder: order, activeTabId, view }
      }),

    switchTab: (id) => set((s) => (s.tabs[id] ? { activeTabId: id, view: 'reader' } : {})),

    // ---- per-tab ----
    setBlocks: (tabId, blocks) =>
      updateTab(tabId, (t) => ({
        project: { ...t.project, blocks },
        originalText: blocksToText(blocks)
      })),

    updateBlock: (tabId, id, patch, record = false) =>
      updateTab(tabId, (t) => {
        const history = record
          ? { past: [...t.past, t.project].slice(-HISTORY_LIMIT), future: [] }
          : {}
        return {
          ...history,
          project: {
            ...t.project,
            blocks: t.project.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b))
          }
        }
      }),

    setActiveBlock: (tabId, activeBlockId) =>
      updateTab(tabId, () => ({
        activeBlockId,
        selectedBlockIds: activeBlockId ? [activeBlockId] : []
      })),

    setHoverBlock: (tabId, hoverBlockId) => updateTab(tabId, () => ({ hoverBlockId })),

    selectBlock: (tabId, id, additive, range) =>
      updateTab(tabId, (t) => {
        const blocks = t.project.blocks
        if (range && t.activeBlockId) {
          const a = blocks.findIndex((b) => b.id === t.activeBlockId)
          const b = blocks.findIndex((x) => x.id === id)
          if (a !== -1 && b !== -1) {
            const [lo, hi] = a <= b ? [a, b] : [b, a]
            return {
              activeBlockId: id,
              selectedBlockIds: blocks.slice(lo, hi + 1).map((x) => x.id)
            }
          }
        }
        if (additive) {
          const has = t.selectedBlockIds.includes(id)
          return {
            activeBlockId: id,
            selectedBlockIds: has
              ? t.selectedBlockIds.filter((x) => x !== id)
              : [...t.selectedBlockIds, id]
          }
        }
        return { activeBlockId: id, selectedBlockIds: [id] }
      }),

    clearSelection: (tabId) =>
      updateTab(tabId, () => ({ selectedBlockIds: [], activeBlockId: null })),

    toggleNotes: (tabId) => updateTab(tabId, (t) => ({ showNotes: !t.showNotes })),
    toggleRefs: (tabId) => updateTab(tabId, (t) => ({ showRefs: !t.showRefs })),
    toggleAutoTranslate: (tabId) =>
      updateTab(tabId, (t) => ({ autoTranslate: !t.autoTranslate })),

    openSearch: (tabId) => updateTab(tabId, () => ({ searchOpen: true })),
    closeSearch: (tabId) =>
      updateTab(tabId, () => ({ searchOpen: false, searchMatchId: null, searchQuery: '' })),
    setSearchMatch: (tabId, id) => updateTab(tabId, () => ({ searchMatchId: id })),
    setSearchQuery: (tabId, query) => updateTab(tabId, () => ({ searchQuery: query })),

    setNote: (tabId, doc, images) =>
      updateTab(tabId, (t) => {
        const note = {
          id: 'main',
          doc,
          images,
          createdAt: t.project.notes[0]?.createdAt ?? Date.now()
        }
        const now = Date.now()
        const coalesce = now - t.lastNoteEditTs < 700
        const history = coalesce
          ? {}
          : { past: [...t.past, t.project].slice(-HISTORY_LIMIT), future: [] }
        return { ...history, lastNoteEditTs: now, project: { ...t.project, notes: [note] } }
      }),

    undo: (tabId) =>
      updateTab(tabId, (t) => {
        const prev = t.past[t.past.length - 1]
        if (!prev) return {}
        return {
          past: t.past.slice(0, -1),
          future: [t.project, ...t.future].slice(0, HISTORY_LIMIT),
          project: prev
        }
      }),

    redo: (tabId) =>
      updateTab(tabId, (t) => {
        const next = t.future[0]
        if (!next) return {}
        return {
          past: [...t.past, t.project].slice(-HISTORY_LIMIT),
          future: t.future.slice(1),
          project: next
        }
      }),

    save: async (tabId) => {
      const t = get().tabs[tabId]
      if (!t) return
      if (!t.savedPath) return get().saveAs(tabId)
      await window.api.project.save(t.project)
      recordRecent(t.savedPath, t.project.meta.title)
    },

    saveAs: async (tabId) => {
      const t = get().tabs[tabId]
      if (!t) return
      const res = await window.api.project.saveAs(t.project)
      if (res) {
        updateTab(tabId, () => ({ project: res.project, savedPath: res.dir }))
        recordRecent(res.dir, res.project.meta.title)
      }
    },

    renameProject: async (tabId, title) => {
      const name = title.trim()
      if (!name || get().tabs[tabId]?.project.meta.title === name) return
      updateTab(tabId, (t) => ({
        project: { ...t.project, meta: { ...t.project.meta, title: name } }
      }))
      const t = get().tabs[tabId]
      if (t?.savedPath) {
        await window.api.project.save(t.project)
        recordRecent(t.savedPath, name)
        // Keep the library bookmark's name in sync so it stays searchable.
        const lib = await window.api.library.get()
        const bm = lib.find((b) => b.projectPath === t.savedPath)
        if (bm && bm.title !== name) await window.api.library.upsert({ ...bm, title: name })
      }
    },

    // ---- open paths ----
    openIntake: (r) => {
      const project: Project = {
        meta: {
          title: r.title,
          source: r.source,
          createdAt: Date.now(),
          lang: get().settings?.targetLang ?? 'Chinese',
          pdfUrl: r.pdfUrl,
          pdfSha256: r.pdfSha256,
          pdfSize: r.pdfSize
        },
        pdfPath: r.pdfPath,
        blocks: [],
        notes: []
      }
      // Intake projects already live in the vault → located, so Save/bookmark
      // write in place rather than prompting.
      get().openTab(project, dirOf(r.pdfPath))
    },

    openExisting: async () => {
      const project = await window.api.project.open()
      if (!project) return
      const dir = dirOf(project.pdfPath)
      const open = get().tabOrder.find((id) => get().tabs[id].savedPath === dir)
      if (open) return get().switchTab(open)
      const id = get().openTab(project, dir)
      recordRecent(dir, project.meta.title)
      backfillRefetch(id)
    },

    openProjectPath: async (dir) => {
      const open = get().tabOrder.find((id) => get().tabs[id].savedPath === dir)
      if (open) return get().switchTab(open)
      const project = await window.api.project.openPath(dir)
      const id = get().openTab(project, dir)
      recordRecent(dir, project.meta.title)
      backfillRefetch(id)
    }
  }
})
