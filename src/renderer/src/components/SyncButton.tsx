import { useState, type ReactNode } from 'react'
import {
  RefreshCw,
  Cloud,
  X,
  AlertTriangle,
  FolderOpen,
  Check,
  ChevronRight,
  ChevronLeft
} from 'lucide-react'
import { Button, Input, Spinner } from './ui'

type Dialog =
  | { kind: 'remote' }
  | { kind: 'conflict'; files: string[] }
  | { kind: 'error'; message: string }
  | null

/** Sync button: commit → pull/merge → push the vault to its Git remote, with a
 * setup wizard when no remote exists and a conflict warning. Usable from the
 * toolbar or the welcome page (it operates on the vault, no open paper needed). */
export default function SyncButton({ label = 'Sync' }: { label?: string }): JSX.Element {
  const [dialog, setDialog] = useState<Dialog>(null)
  const [syncing, setSyncing] = useState(false)
  const [done, setDone] = useState(false)

  const runSync = async (): Promise<void> => {
    setSyncing(true)
    try {
      const r = await window.api.git.sync()
      if (r.status === 'no-remote') setDialog({ kind: 'remote' })
      else if (r.status === 'conflict') setDialog({ kind: 'conflict', files: r.files })
      else if (r.status === 'error') setDialog({ kind: 'error', message: r.message })
      else {
        setDone(true)
        setTimeout(() => setDone(false), 2000)
      }
    } finally {
      setSyncing(false)
    }
  }

  const connect = async (url: string): Promise<void> => {
    setDialog(null)
    await window.api.git.setRemote(url.trim())
    await runSync()
  }

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={runSync}
        disabled={syncing}
        title="Sync vault to Git remote"
      >
        {syncing ? (
          <Spinner />
        ) : done ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <RefreshCw className="h-4 w-4" />
        )}
        {label}
      </Button>

      {dialog?.kind === 'remote' && (
        <RemoteWizard onCancel={() => setDialog(null)} onConnect={connect} />
      )}

      {dialog?.kind === 'conflict' && (
        <Modal
          title="Merge conflict"
          icon={<AlertTriangle className="h-5 w-5 text-amber-500" />}
          onClose={() => setDialog(null)}
        >
          <p className="text-sm text-muted">
            These files changed both here and on the remote and couldn&apos;t be merged
            automatically:
          </p>
          <ul className="my-2 max-h-40 overflow-auto rounded-lg bg-bg p-2 text-xs">
            {dialog.files.map((f) => (
              <li key={f} className="truncate py-0.5 font-mono">
                {f}
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted">
            Open the vault, resolve the conflicts (search for{' '}
            <code className="rounded bg-bg px-1">{'<<<<<<<'}</code> markers), commit, then
            Sync again.
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => window.api.vault.reveal()}>
              <FolderOpen className="h-4 w-4" />
              Open vault
            </Button>
            <Button variant="primary" onClick={() => setDialog(null)}>
              Got it
            </Button>
          </div>
        </Modal>
      )}

      {dialog?.kind === 'error' && (
        <Modal
          title="Sync failed"
          icon={<AlertTriangle className="h-5 w-5 text-red-400" />}
          onClose={() => setDialog(null)}
        >
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-bg p-3 text-xs text-red-400">
            {dialog.message}
          </pre>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog({ kind: 'remote' })}>
              Change remote…
            </Button>
            <Button variant="primary" onClick={() => setDialog(null)}>
              Close
            </Button>
          </div>
        </Modal>
      )}
    </>
  )
}

function RemoteWizard({
  onCancel,
  onConnect
}: {
  onCancel: () => void
  onConnect: (url: string) => void
}): JSX.Element {
  const [step, setStep] = useState(0)
  const [url, setUrl] = useState('')
  return (
    <Modal
      title="Connect a Git remote"
      icon={<Cloud className="h-5 w-5 text-accent" />}
      onClose={onCancel}
    >
      {step === 0 ? (
        <div className="space-y-3 text-sm text-muted">
          <p>
            <b className="text-fg">1.</b> Create an empty repository on GitHub, GitLab,
            Gitea, etc. Leave it empty (no README) for the simplest first sync.
          </p>
          <p>
            <b className="text-fg">2.</b> Copy its clone URL — SSH (
            <code className="rounded bg-bg px-1">git@…:you/repo.git</code>) or HTTPS (
            <code className="rounded bg-bg px-1">https://…/you/repo.git</code>).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              Repository URL
            </span>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="git@github.com:you/vault.git"
              spellCheck={false}
              autoFocus
            />
          </label>
          <p className="text-xs text-muted">
            Authentication uses your existing Git setup: an SSH key (for SSH URLs), a
            credential helper, or a token embedded in an HTTPS URL (
            <code className="rounded bg-bg px-1">https://&lt;token&gt;@github.com/…</code>).
          </p>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-xs text-muted">Step {step + 1} / 2</span>
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          {step === 0 ? (
            <Button variant="primary" onClick={() => setStep(1)}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button variant="primary" disabled={!url.trim()} onClick={() => onConnect(url)}>
              Connect &amp; Sync
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Modal({
  title,
  icon,
  children,
  onClose
}: {
  title: string
  icon: ReactNode
  children: ReactNode
  onClose: () => void
}): JSX.Element {
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-2">
          {icon}
          <h2 className="text-base font-semibold">{title}</h2>
          <div className="flex-1" />
          <button onClick={onClose} className="text-muted hover:text-fg">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
