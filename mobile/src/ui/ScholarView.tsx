import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X, KeyRound } from 'lucide-react'
import { ScholarWebView } from '@mobile/api/scholarWebView'
import { isScholarInboxLink } from '@mobile/api/scholarLink'

const HOME = 'https://www.scholar-inbox.com/'
const TOOLBAR_PX = 52

/**
 * Scholar Inbox. A thin React toolbar sits at the top; the actual site renders
 * in a native WebView overlaid below it (persistent cookies → login survives).
 * PDF links are intercepted natively and imported as a paper (handled in
 * AppShell via scholar.onOpenUrl). The login-link editor closes the native
 * WebView (which is always on top) so the React form is visible.
 */
export default function ScholarView({ onClose }: { onClose: () => void }): JSX.Element {
  const [linkEditing, setLinkEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [hasLink, setHasLink] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Open the native WebView at the saved login link (or home).
  useEffect(() => {
    let closed = false
    ;(async () => {
      const link = await window.api.scholar.getLink()
      setHasLink(!!link)
      if (!closed) await ScholarWebView.open({ url: link || HOME, top: TOOLBAR_PX })
    })()
    return () => {
      closed = true
      void ScholarWebView.close()
    }
  }, [])

  const startEdit = async (): Promise<void> => {
    await ScholarWebView.close() // native WebView is always on top; hide it to edit
    setError(null)
    setLinkEditing(true)
  }
  const cancelEdit = async (): Promise<void> => {
    setLinkEditing(false)
    const link = await window.api.scholar.getLink()
    await ScholarWebView.open({ url: link || HOME, top: TOOLBAR_PX })
  }
  const saveLink = async (): Promise<void> => {
    const link = draft.trim()
    if (!isScholarInboxLink(link)) {
      setError('Must be an https scholar-inbox.com URL.')
      return
    }
    await window.api.scholar.setLink(link)
    setHasLink(true)
    setDraft('')
    setLinkEditing(false)
    await ScholarWebView.open({ url: link, top: TOOLBAR_PX })
  }
  const clearLink = async (): Promise<void> => {
    await window.api.scholar.clearLink()
    setHasLink(false)
  }

  const iconBtn = 'grid h-9 w-9 place-items-center rounded-lg text-muted'

  return (
    <div className="flex h-full w-full flex-col bg-bg">
      <header className="flex shrink-0 items-center gap-1 border-b border-border bg-surface px-2" style={{ height: TOOLBAR_PX }}>
        <button onClick={() => void ScholarWebView.goBack()} className={iconBtn} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button onClick={() => void ScholarWebView.goForward()} className={iconBtn} aria-label="Forward">
          <ArrowRight className="h-5 w-5" />
        </button>
        <button onClick={() => void ScholarWebView.reload()} className={iconBtn} aria-label="Reload">
          <RotateCw className="h-5 w-5" />
        </button>
        <span className="flex-1 px-1 text-sm font-medium">Scholar Inbox</span>
        <button onClick={startEdit} className={'grid h-9 w-9 place-items-center rounded-lg ' + (hasLink ? 'text-accent' : 'text-muted')} aria-label="Login link">
          <KeyRound className="h-5 w-5" />
        </button>
        <button onClick={onClose} className={iconBtn} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </header>

      {/* The area below is covered by the native WebView, except while editing
          the login link (native WebView is closed, so this form shows). */}
      {linkEditing && (
        <div className="flex-1 overflow-auto p-5">
          <div className="text-sm font-medium">Personal login link</div>
          <p className="mt-1 text-xs text-muted">
            On scholar-inbox.com → your account, copy the bookmarkable login link. Google
            sign-in is blocked in embedded browsers — use email/password or this link.
          </p>
          <input
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
            placeholder="https://www.scholar-inbox.com/…"
            className="mt-3 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm"
            spellCheck={false}
          />
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
          <div className="mt-3 flex items-center gap-2">
            <button onClick={saveLink} disabled={!draft.trim()} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-50">
              Save
            </button>
            <button onClick={cancelEdit} className="rounded-lg px-3 py-2 text-sm text-muted">
              Cancel
            </button>
            {hasLink && (
              <button onClick={clearLink} className="rounded-lg px-3 py-2 text-sm text-red-400">
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
