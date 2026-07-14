import { useEffect, useState } from 'react'
import { GitBranch, RefreshCw, AlertTriangle, CheckCircle2, Copy } from 'lucide-react'
import type { GitInfo, GitSyncResult } from '@shared/types'
import { Button, Input, Spinner } from '@renderer/components/ui'
import { getGitConfig, setGitConfig } from '@mobile/api/gitConfig'
import { getGitToken, setGitToken } from '@mobile/api/secrets'
import { getProgress, type GitProgress } from '@mobile/api/gitProgress'

/** Git vault sync config + a Sync button (isomorphic-git, HTTPS + PAT). */
export default function GitSettings(): JSX.Element {
  const [info, setInfo] = useState<GitInfo | null>(null)
  const [remote, setRemote] = useState('')
  const [username, setUsername] = useState('x-access-token')
  const [corsProxy, setCorsProxy] = useState('')
  const [fullHistory, setFullHistory] = useState(false)
  const [token, setToken] = useState('')
  const [hasToken, setHasToken] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GitSyncResult | null>(null)
  const [live, setLive] = useState<string | null>(null)
  const [crash, setCrash] = useState<GitProgress | null>(null)

  const refresh = async (): Promise<void> => {
    const gi = await window.api.git.info()
    setInfo(gi)
    setRemote(gi.remoteUrl ?? '')
    const cfg = await getGitConfig()
    setUsername(cfg.username)
    setCorsProxy(cfg.corsProxy)
    setFullHistory(cfg.fullHistory)
    setHasToken((await getGitToken()) != null)
    // A previous run still marked 'running' → it was killed mid-sync (OOM crash).
    const gp = await getProgress()
    setCrash(gp?.status === 'running' ? gp : null)
  }
  useEffect(() => {
    void refresh()
  }, [])

  // Live progress while syncing (also persisted, so it survives a crash).
  useEffect(() => {
    if (!busy) {
      setLive(null)
      return
    }
    setCrash(null)
    const id = setInterval(async () => {
      const gp = await getProgress()
      if (gp) setLive(gp.line)
    }, 500)
    return () => clearInterval(id)
  }, [busy])

  const saveConfig = async (): Promise<void> => {
    await setGitConfig({ username, corsProxy, fullHistory })
    if (token.trim()) {
      await setGitToken(token.trim())
      setToken('')
      setHasToken(true)
    }
    if (remote.trim() && remote.trim() !== info?.remoteUrl) {
      await window.api.git.setRemote(remote.trim())
    }
    await refresh()
  }

  const sync = async (): Promise<void> => {
    setBusy(true)
    setResult(null)
    try {
      await saveConfig()
      setResult(await window.api.git.sync())
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const label = 'mb-1 block text-xs font-medium text-muted'

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <GitBranch className="h-4 w-4 text-accent" /> Git sync
        {info?.branch && <span className="text-xs font-normal text-muted">({info.branch})</span>}
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <span className={label}>Remote URL (HTTPS)</span>
          <Input value={remote} onChange={(e) => setRemote(e.target.value)} placeholder="https://github.com/you/vault.git" spellCheck={false} />
        </div>
        <div>
          <span className={label}>Username</span>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} spellCheck={false} />
        </div>
        <div>
          <span className={label}>
            Access token {hasToken && <span className="text-green-500">· saved</span>}
          </span>
          <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={hasToken ? '•••••••• (replace)' : 'Personal Access Token'} spellCheck={false} />
        </div>
        <div>
          <span className={label}>CORS proxy (optional — for hosts without CORS)</span>
          <Input value={corsProxy} onChange={(e) => setCorsProxy(e.target.value)} placeholder="https://cors.example.com" spellCheck={false} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={fullHistory}
            onChange={(e) => setFullHistory(e.target.checked)}
            className="h-4 w-4"
          />
          <span>
            Download full history
            <span className="block text-xs text-muted">
              Off = latest snapshot only (much smaller — recommended for large repos).
            </span>
          </span>
        </label>

        {crash && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-500">
            <div className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> Last sync didn’t finish (likely a crash)
            </div>
            <div className="mt-1 break-words text-amber-500/90">Last activity: {crash.line}</div>
            <div className="mt-1 text-muted">
              A large repo can exceed on-device memory. Seed the remote from desktop, then sync
              incremental changes.
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={sync} disabled={busy}>
            {busy ? <Spinner /> : <RefreshCw className="h-4 w-4" />} Sync now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setCorsProxy('https://cors.isomorphic-git.org')}>
            Use public proxy
          </Button>
        </div>

        {busy && live && (
          <div className="flex items-center gap-1.5 text-xs text-muted">
            <Spinner /> <span className="break-words">{live}</span>
          </div>
        )}

        {result && <SyncResult result={result} />}
      </div>
    </div>
  )
}

/** Detailed sync outcome: status line + a scrollable step-by-step log, with a
 * copy button so the whole diagnostic can be shared. */
function SyncResult({ result }: { result: GitSyncResult }): JSX.Element {
  const [copied, setCopied] = useState(false)

  const details =
    result.status === 'ok' || result.status === 'error'
      ? result.message ?? ''
      : result.status === 'conflict'
        ? result.files.join('\n')
        : ''

  const copy = async (): Promise<void> => {
    await window.api.clipboard.write(details)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }

  if (result.status === 'no-remote') {
    return <p className="mt-2 text-xs text-muted">Set a remote URL first, then Sync.</p>
  }

  const ok = result.status === 'ok'
  return (
    <div className="mt-2">
      <div className={'flex items-center gap-1.5 text-xs font-medium ' + (ok ? 'text-green-500' : 'text-red-400')}>
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {ok ? 'Synced' : result.status === 'conflict' ? 'Merge conflict' : 'Sync failed'}
        {details && (
          <button onClick={copy} className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-muted hover:bg-border/40">
            <Copy className="h-3.5 w-3.5" /> {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
      {details && (
        <pre className="mt-1.5 max-h-56 overflow-auto overscroll-contain whitespace-pre-wrap rounded-lg border border-border bg-bg p-2 text-[11px] leading-relaxed text-fg">
          {details}
        </pre>
      )}
    </div>
  )
}
