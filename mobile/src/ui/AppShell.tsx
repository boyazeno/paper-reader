import { useEffect, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import type { SessionData } from '@shared/types'
import { useStore } from '@renderer/store'
import Home from './Home'
import ReaderMobile from './ReaderMobile'
import SettingsMobile from './SettingsMobile'
import LibraryMobile from './LibraryMobile'
import ScholarView from './ScholarView'
import FirstRunHint from './FirstRunHint'

/** Reopen the paper open at last quit (mobile keeps a single active paper). */
async function restoreSession(): Promise<void> {
  const sess = await window.api.session.load()
  const tab = sess?.tabs?.[0]
  if (!tab) return
  try {
    const project = await window.api.project.openPath(tab.dir)
    useStore.getState().openTab(project, tab.dir, { pdf: tab.pdfScroll, trans: tab.transScroll })
  } catch {
    /* project folder missing → skip */
  }
}

/** Persist the active paper + its scroll so the next launch can restore it. */
async function persistSession(): Promise<void> {
  const s = useStore.getState()
  const id = s.activeTabId
  const t = id ? s.tabs[id] : null
  const scrollOf = (sel: string): number =>
    (document.querySelector(`[data-scroll="${sel}"]`) as HTMLElement | null)?.scrollTop ?? 0
  let data: SessionData = { tabs: [], activeIndex: 0 }
  if (t?.savedPath) {
    try {
      await window.api.project.save(t.project)
    } catch {
      /* record the tab even if saving fails */
    }
    data = {
      tabs: [{ dir: t.savedPath, pdfScroll: scrollOf('pdf'), transScroll: scrollOf('trans') }],
      activeIndex: 0
    }
  }
  await window.api.session.save(data)
}

/**
 * Top-level mobile shell. Multiple papers open as tabs (in the store); Home
 * appears as an overlay when adding another. Settings / Library / Scholar are
 * full-screen overlays. The hardware back button closes the top overlay.
 */
export default function AppShell(): JSX.Element {
  const init = useStore((s) => s.init)
  const settings = useStore((s) => s.settings)
  const activeTabId = useStore((s) => s.activeTabId)
  const openIntake = useStore((s) => s.openIntake)
  const [ready, setReady] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [scholarOpen, setScholarOpen] = useState(false)
  const [homeOverlay, setHomeOverlay] = useState(false)

  // Intercepted Scholar PDF link → import as a paper.
  useEffect(() => {
    return window.api.scholar.onOpenUrl(async (url) => {
      try {
        openIntake(await window.api.intake.fromUrl(url))
        setScholarOpen(false)
      } catch {
        /* not a downloadable PDF — leave the browser open */
      }
    })
  }, [openIntake])

  useEffect(() => {
    init().then(restoreSession).finally(() => setReady(true))
  }, [init])

  useEffect(() => window.api.onPersistSession(persistSession), [])

  // Hardware / gesture back closes the topmost overlay (so Scholar and the
  // other full-screen views are never a dead end); otherwise background the app.
  useEffect(() => {
    const handle = CapApp.addListener('backButton', () => {
      if (scholarOpen) setScholarOpen(false)
      else if (settingsOpen) setSettingsOpen(false)
      else if (libraryOpen) setLibraryOpen(false)
      else if (homeOverlay) setHomeOverlay(false)
      else CapApp.minimizeApp()
    })
    return () => {
      void handle.then((h) => h.remove())
    }
  }, [scholarOpen, settingsOpen, libraryOpen, homeOverlay])

  // Apply theme, and follow the OS live while on "system".
  useEffect(() => {
    if (!settings) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && mq.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    if (settings.theme === 'system') {
      mq.addEventListener('change', apply)
      return () => mq.removeEventListener('change', apply)
    }
  }, [settings])

  if (!ready) {
    return <div className="grid h-full place-items-center text-sm text-muted">Loading…</div>
  }

  const homeProps = {
    onOpenSettings: () => setSettingsOpen(true),
    onOpenLibrary: () => setLibraryOpen(true),
    onOpenScholar: () => setScholarOpen(true)
  }

  return (
    <div className="relative h-full w-full">
      {activeTabId ? (
        <ReaderMobile onNewTab={() => setHomeOverlay(true)} onOpenSettings={() => setSettingsOpen(true)} />
      ) : (
        <Home {...homeProps} />
      )}

      {/* "Open another paper" overlay (keeps existing tabs open). */}
      {homeOverlay && activeTabId && (
        <div className="absolute inset-0 z-40 bg-bg">
          <Home {...homeProps} onClose={() => setHomeOverlay(false)} />
        </div>
      )}

      {libraryOpen && (
        <div className="absolute inset-0 z-50">
          <LibraryMobile onClose={() => setLibraryOpen(false)} />
        </div>
      )}
      {scholarOpen && (
        <div className="absolute inset-0 z-[55]">
          <ScholarView onClose={() => setScholarOpen(false)} />
        </div>
      )}
      {settingsOpen && (
        <div className="absolute inset-0 z-[60]">
          <SettingsMobile onClose={() => setSettingsOpen(false)} />
        </div>
      )}

      {activeTabId && settings && !settings.tourCompleted && <FirstRunHint />}
    </div>
  )
}
