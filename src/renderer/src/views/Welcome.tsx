import { useEffect, useState } from 'react'
import {
  BookOpenText,
  FileUp,
  Link2,
  Search,
  AlertCircle,
  Settings2,
  ChevronDown,
  Library as LibraryIcon,
  Clock,
  Inbox,
  X
} from 'lucide-react'
import { useStore } from '@renderer/store'
import { Button, Input, Select, Spinner } from '@renderer/components/ui'
import SearchBrowser from '@renderer/components/SearchBrowser'
import ProviderConfig from '@renderer/components/ProviderConfig'
import SyncButton from '@renderer/components/SyncButton'
import { PROVIDERS, LANGUAGES } from '@renderer/lib/constants'
import { cn } from '@renderer/lib/cn'
import type { IntakeResult, RecentEntry } from '@shared/types'

/** `onClose` is supplied when Welcome is shown as an "open another paper"
 * overlay above existing tabs, giving the user a way to back out. */
export default function Welcome({ onClose }: { onClose?: () => void }): JSX.Element {
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)
  const openIntake = useStore((s) => s.openIntake)
  const openProjectPath = useStore((s) => s.openProjectPath)
  const setView = useStore((s) => s.setView)
  const openScholar = useStore((s) => s.openScholar)

  const [recents, setRecents] = useState<RecentEntry[]>([])
  useEffect(() => {
    window.api.recents.get().then(setRecents)
  }, [])

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState<null | 'url' | 'file'>(null)
  const [dragging, setDragging] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [configuring, setConfiguring] = useState(false)

  const run = async (kind: 'url' | 'file', fn: () => Promise<IntakeResult | null>) => {
    setBusy(kind)
    setError(null)
    try {
      const r = await fn()
      if (r) openIntake(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
  }

  const onDrop = (e: React.DragEvent): void => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0] as (File & { path?: string }) | undefined
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please drop a PDF file.')
      return
    }
    if (file.path) run('file', () => window.api.intake.fromPath(file.path as string))
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-10 bg-bg p-10">
      {onClose && (
        <button
          onClick={onClose}
          title="Back to reader"
          className="absolute left-5 top-5 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-fg"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {/* top-right shortcuts: Scholar Inbox, pull a vault from Git, or the library */}
      <div className="absolute right-5 top-5 flex items-center gap-1 text-muted">
        <Button size="sm" variant="ghost" onClick={openScholar}>
          <Inbox className="h-4 w-4" />
          Scholar Inbox
        </Button>
        <SyncButton label="Sync from Git" />
        <Button size="sm" variant="ghost" onClick={() => setView('library')}>
          <LibraryIcon className="h-4 w-4" />
          Library
        </Button>
      </div>

      {/* header */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-surface ring-1 ring-border">
          <BookOpenText className="h-8 w-8 text-accent" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Paper Reader</h1>
        <p className="max-w-md text-sm text-muted">
          Read, translate and annotate academic papers — side by side, in place.
        </p>
      </div>

      {/* intake methods */}
      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
        {/* drag & drop */}
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface p-6 text-center transition-colors',
            dragging && 'border-accent bg-accent/5'
          )}
        >
          <FileUp className="h-6 w-6 text-muted" />
          <div className="text-sm font-medium">Drop a PDF</div>
          <p className="text-xs text-muted">Drag a file here, or</p>
          <Button
            size="sm"
            onClick={() => run('file', () => window.api.intake.pick())}
            disabled={busy === 'file'}
          >
            {busy === 'file' ? <Spinner /> : 'Browse…'}
          </Button>
        </div>

        {/* url */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6">
          <Link2 className="h-6 w-6 text-muted" />
          <div className="text-sm font-medium">From URL</div>
          <Input
            placeholder="https://arxiv.org/abs/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) =>
              e.key === 'Enter' &&
              url.trim() &&
              run('url', () => window.api.intake.fromUrl(url.trim()))
            }
            spellCheck={false}
          />
          <Button
            size="sm"
            variant="primary"
            disabled={!url.trim() || busy === 'url'}
            onClick={() => run('url', () => window.api.intake.fromUrl(url.trim()))}
          >
            {busy === 'url' ? <Spinner /> : 'Download'}
          </Button>
        </div>

        {/* title search */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-6">
          <Search className="h-6 w-6 text-muted" />
          <div className="text-sm font-medium">Search by title</div>
          <Input
            placeholder="Paper title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && title.trim() && setSearching(true)}
            spellCheck={false}
          />
          <Button
            size="sm"
            disabled={!title.trim()}
            onClick={() => setSearching(true)}
          >
            Search online
          </Button>
        </div>
      </div>

      {/* recent projects */}
      {recents.length > 0 && (
        <div className="flex w-full max-w-3xl flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
            <Clock className="h-3.5 w-3.5" />
            Recent
          </div>
          <div className="flex flex-wrap gap-2">
            {recents.slice(0, 6).map((r) => (
              <button
                key={r.path}
                onClick={() => openProjectPath(r.path)}
                title={r.path}
                className="max-w-[16rem] truncate rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-border/40"
              >
                {r.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* provider + language pickers, with an expandable backend config */}
      {settings && (
        <div className="flex w-full max-w-md flex-col items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>Model</span>
            <Select
              value={settings.activeProvider}
              onChange={(e) =>
                patchSettings({
                  activeProvider: e.target.value as typeof settings.activeProvider
                })
              }
            >
              {PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
            <span className="pl-2">Translate to</span>
            <Select
              value={settings.targetLang}
              onChange={(e) => patchSettings({ targetLang: e.target.value })}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </div>

          <button
            onClick={() => setConfiguring((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configure backend
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', configuring && 'rotate-180')}
            />
          </button>

          {configuring && (
            <div className="w-full rounded-xl border border-border bg-surface p-5 text-left">
              <ProviderConfig />
            </div>
          )}
        </div>
      )}

      {searching && (
        <SearchBrowser
          query={title}
          onClose={() => setSearching(false)}
          onImported={(r) => {
            setSearching(false)
            openIntake(r)
          }}
        />
      )}
    </div>
  )
}
