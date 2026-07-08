import { useEffect } from 'react'
import { useStore } from './store'
import Welcome from './views/Welcome'
import Workspace from './components/Workspace'
import Settings from './views/Settings'
import Library from './views/Library'

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
      // A PDF the app was launched with (file manager / CLI)…
      const pending = await window.api.getPendingOpen()
      if (pending) return openFilePath(pending)
      // …or auto-open a PDF if PR_OPEN was set in the main process.
      const r = await window.api.devAutoOpen()
      if (r) openIntake(r)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [init, openIntake])

  // A PDF opened via the file manager while the app is already running.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => window.api.onOpenFile(openFilePath), [])

  // Global shortcuts: save / undo / redo (skip undo inside the notes editor).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      const s = useStore.getState()
      if (s.view !== 'reader') return
      const id = s.activeTabId
      if (!id) return
      const inEditor = (e.target as HTMLElement)?.closest?.('.ProseMirror')
      const key = e.key.toLowerCase()
      if (key === 's') {
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
