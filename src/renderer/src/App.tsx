import { useEffect } from 'react'
import type { SessionTab } from '@shared/types'
import { useStore } from './store'
import Welcome from './views/Welcome'
import Workspace from './components/Workspace'
import Settings from './views/Settings'
import Library from './views/Library'

/** Reopen the tabs saved from the last session. Tabs whose project folder is
 * gone are skipped; returns false if nothing could be restored. */
async function restoreSession(): Promise<boolean> {
  const sess = await window.api.session.load()
  if (!sess?.tabs?.length) return false
  const st = useStore.getState()
  let opened = 0
  for (const tab of sess.tabs) {
    try {
      const project = await window.api.project.openPath(tab.dir)
      st.openTab(project, tab.dir, { pdf: tab.pdfScroll, trans: tab.transScroll })
      opened++
    } catch {
      /* project folder missing → skip this tab */
    }
  }
  if (!opened) return false
  const order = useStore.getState().tabOrder
  const active = order[Math.min(sess.activeIndex, order.length - 1)]
  if (active) useStore.getState().switchTab(active)
  return true
}

/** Save the open tabs (+ their scroll) so the next launch can restore them. */
async function persistSession(): Promise<void> {
  const s = useStore.getState()
  const tabs: SessionTab[] = []
  for (const id of s.tabOrder) {
    const t = s.tabs[id]
    if (!t?.savedPath) continue
    // Ensure project.json exists on disk so it can be reloaded.
    try {
      await window.api.project.save(t.project)
    } catch {
      /* record the tab even if the save fails */
    }
    const panel = document.querySelector(`[data-tab-panel="${id}"]`)
    const scrollOf = (sel: string): number =>
      (panel?.querySelector(sel) as HTMLElement | null)?.scrollTop ?? 0
    tabs.push({
      dir: t.savedPath,
      pdfScroll: scrollOf('[data-scroll="pdf"]'),
      transScroll: scrollOf('[data-scroll="trans"]')
    })
  }
  const activeIndex = Math.max(0, s.tabOrder.indexOf(s.activeTabId ?? ''))
  await window.api.session.save({ tabs, activeIndex })
}

export default function App(): JSX.Element {
  const view = useStore((s) => s.view)
  const init = useStore((s) => s.init)
  const settings = useStore((s) => s.settings)
  const openIntake = useStore((s) => s.openIntake)
  const hasTabs = useStore((s) => s.tabOrder.length > 0)
  const setView = useStore((s) => s.setView)

  // Import a PDF file and open it in the reader (file-manager "Open with").
  const openFilePath = async (path: string): Promise<void> => {
    try {
      openIntake(await window.api.intake.fromPath(path))
    } catch (e) {
      console.error('open file failed', e)
    }
  }

  useEffect(() => {
    init().then(async () => {
      // Dev-only: reopen an existing project (save/load verification)…
      const proj = await window.api.devOpenProject()
      if (proj) {
        const dir = proj.pdfPath.replace(/\/paper\.pdf$/, '')
        useStore.getState().openTab(proj, dir)
        return
      }
      // …or auto-open a PDF if PR_OPEN was set (headless) — bypasses restore.
      const r = await window.api.devAutoOpen()
      if (r) return openIntake(r)
      // Restore the tabs open at last quit (falls back to the welcome page).
      await restoreSession()
      // A PDF the app was launched with (file manager / CLI) → add a tab.
      const pending = await window.api.getPendingOpen()
      if (pending) openFilePath(pending)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init, openIntake])

  // Save the session when the window is closing (main waits for the reply).
  useEffect(
    () =>
      window.api.onPersistSession(async () => {
        try {
          await persistSession()
        } finally {
          window.api.sessionPersisted()
        }
      }),
    []
  )

  // A PDF opened via the file manager while the app is already running.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => window.api.onOpenFile(openFilePath), [])

  // Global shortcuts: save / undo / redo (skip undo inside the notes editor).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      if (s.view !== 'reader') return
      const id = s.activeTabId
      if (!id) return

      // Esc closes the find bar (if open), else clears the block selection.
      if (e.key === 'Escape') {
        if (s.tabs[id]?.searchOpen) {
          e.preventDefault()
          s.closeSearch(id)
        } else if (s.tabs[id]?.selectedBlockIds.length) {
          e.preventDefault()
          s.clearSelection(id)
        }
        return
      }

      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const inEditor = (e.target as HTMLElement)?.closest?.('.ProseMirror')
      const key = e.key.toLowerCase()
      if (key === 'f') {
        e.preventDefault()
        s.openSearch(id)
      } else if (key === 's') {
        e.preventDefault()
        s.save(id)
      } else if (key === 'z' && !inEditor) {
        e.preventDefault()
        if (e.shiftKey) s.redo(id)
        else s.undo(id)
      } else if (key === 'y' && !inEditor) {
        e.preventDefault()
        s.redo(id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Apply theme class to <html>.
  useEffect(() => {
    if (!settings) return
    const root = document.documentElement
    const dark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    root.classList.toggle('dark', dark)
  }, [settings])

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* Base layer: the open papers (or Welcome when nothing is open). The
          Workspace stays mounted under overlays so Readers never reload. */}
      {hasTabs ? <Workspace /> : <Welcome />}

      {/* Full-window overlays. */}
      {view === 'welcome' && hasTabs && (
        <div className="absolute inset-0 z-40">
          <Welcome onClose={() => setView('reader')} />
        </div>
      )}
      {view === 'settings' && (
        <div className="absolute inset-0 z-40">
          <Settings />
        </div>
      )}
      {view === 'library' && (
        <div className="absolute inset-0 z-40">
          <Library />
        </div>
      )}
    </div>
  )
}
