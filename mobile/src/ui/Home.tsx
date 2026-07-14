import { useEffect, useState } from 'react'
import { BookOpenText, FolderOpen, Link2, Clock, FolderCog, Settings2, Library as LibraryIcon, Inbox, ChevronLeft } from 'lucide-react'
import { useStore } from '@renderer/store'
import type { RecentEntry } from '@shared/types'

/** Landing screen: pick/confirm the vault, import a paper, or reopen a recent.
 * `onClose` is provided when Home is an "open another paper" overlay above open
 * tabs — it shows a back button and closes after a paper opens. */
export default function Home({
  onOpenSettings,
  onOpenLibrary,
  onOpenScholar,
  onClose
}: {
  onOpenSettings: () => void
  onOpenLibrary: () => void
  onOpenScholar: () => void
  onClose?: () => void
}): JSX.Element {
  const openIntake = useStore((s) => s.openIntake)
  const openProjectPath = useStore((s) => s.openProjectPath)
  const [vault, setVault] = useState('')
  const [recents, setRecents] = useState<RecentEntry[]>([])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    setVault(await window.api.vault.get())
    setRecents(await window.api.recents.get())
  }
  useEffect(() => {
    void refresh()
  }, [])

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const chooseVault = (): Promise<void> =>
    run(async () => {
      await window.api.vault.choose()
      await refresh()
    })

  const importUrl = (): Promise<void> =>
    run(async () => {
      openIntake(await window.api.intake.fromUrl(url.trim()))
      onClose?.()
    })

  const pickFile = (): Promise<void> =>
    run(async () => {
      const r = await window.api.intake.pick()
      if (r) {
        openIntake(r)
        onClose?.()
      }
    })

  const openRecent = (path: string): Promise<void> =>
    run(async () => {
      await openProjectPath(path)
      onClose?.()
    })

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col gap-5 overflow-auto p-5">
      <div className="relative flex flex-col items-center gap-2 pt-4 text-center">
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Back"
            className="absolute left-0 top-2 grid h-9 w-9 place-items-center rounded-lg text-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <button
          onClick={onOpenSettings}
          aria-label="Settings"
          className="absolute right-0 top-2 grid h-9 w-9 place-items-center rounded-lg text-muted"
        >
          <Settings2 className="h-5 w-5" />
        </button>
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface ring-1 ring-border">
          <BookOpenText className="h-7 w-7 text-accent" />
        </div>
        <h1 className="text-xl font-semibold">Paper Reader</h1>
      </div>

      {/* vault */}
      <button
        onClick={chooseVault}
        className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left"
      >
        <FolderCog className="h-5 w-5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Vault folder</div>
          <div className="truncate text-xs text-muted">{vault || 'Tap to choose a folder…'}</div>
        </div>
      </button>

      {/* import by URL */}
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="h-4 w-4 text-muted" /> Import from URL
        </div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://arxiv.org/abs/…"
          inputMode="url"
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
          spellCheck={false}
        />
        <button
          onClick={importUrl}
          disabled={!url.trim() || busy}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Import'}
        </button>
      </div>

      {/* pick a file */}
      <button
        onClick={pickFile}
        disabled={busy}
        className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left disabled:opacity-50"
      >
        <FolderOpen className="h-5 w-5 shrink-0 text-muted" />
        <div className="text-sm font-medium">Open a PDF file…</div>
      </button>

      {/* scholar inbox */}
      <button
        onClick={onOpenScholar}
        className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left"
      >
        <Inbox className="h-5 w-5 shrink-0 text-muted" />
        <div className="text-sm font-medium">Scholar Inbox</div>
      </button>

      {/* library */}
      <button
        onClick={onOpenLibrary}
        className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left"
      >
        <LibraryIcon className="h-5 w-5 shrink-0 text-muted" />
        <div className="text-sm font-medium">Library</div>
      </button>

      {error && <div className="text-sm text-red-400">{error}</div>}

      {/* recents */}
      {recents.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Clock className="h-3.5 w-3.5" /> Recent
          </div>
          {recents.map((r) => (
            <button
              key={r.path}
              onClick={() => openRecent(r.path)}
              className="truncate rounded-lg border border-border bg-surface px-3 py-2 text-left text-sm"
            >
              {r.title}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
