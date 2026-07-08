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
}

interface AppState {
  view: View
  settings: AppSettings | null
  /** Number of in-flight LLM runs (maintained by lib/llm). */
  runningLlm: number

  // ---- tabs (one per open paper) ----
  tabs: Record<string, TabState>
  tabOrder: string[]
  activeTabId: string | null

  // ---- global ----
  setView: (v: View) => void
  setSettings: (s: AppSettings) => void
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>
  init: () => Promise<void>

  // ---- tab management ----
  openTab: (project: Project, savedPath: string | null) => string
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
  /** Replace the project's note document (rich-text JSON + referenced images). */
  setNote: (tabId: string, doc: unknown, images: string[]) => void
  undo: (tabId: string) => void
  redo: (tabId: string) => void
  save: (tabId: string) => Promise<void>
  saveAs: (tabId: string) => Promise<void>

  // ---- open paths (create / activate tabs) ----
  openIntake: (r: IntakeResult) => void
  openExisting: () => Promise<void>
  openProjectPath: (dir: string) => Promise<void>
}

const HISTORY_LIMIT = 50

let tabSeq = 0
const genId = (): string => `tab-${Date.now()}-${++tabSeq}`

const dirOf = (pdfPath: string): string => pdfPath.replace(/\/paper\.pdf$/, '')

function makeTab(project: Project, savedPath: string | null): TabState {
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
    lastNoteEditTs: 0
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

  return {
    view: 'welcome',
    settings: null,
    runningLlm: 0,
    tabs: {},
    tabOrder: [],
    activeTabId: null,

    setView: (view) => set({ view }),
    setSettings: (settings) => set({ settings }),

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
    openTab: (project, savedPath) => {
      const tab = makeTab(project, savedPath)
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
      updateTab(tabId, (t) => ({ project: { ...t.project, blocks } })),

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

    // ---- open paths ----
    openIntake: (r) => {
      const project: Project = {
        meta: {
          title: r.title,
          source: r.source,
          createdAt: Date.now(),
          lang: get().settings?.targetLang ?? 'Chinese'
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
      get().openTab(project, dir)
      recordRecent(dir, project.meta.title)
    },

    openProjectPath: async (dir) => {
      const open = get().tabOrder.find((id) => get().tabs[id].savedPath === dir)
      if (open) return get().switchTab(open)
      const project = await window.api.project.openPath(dir)
      get().openTab(project, dir)
      recordRecent(dir, project.meta.title)
    }
  }
})
