import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  RotateCw,
  X,
  FilePlus2,
  FileText,
  KeyRound,
  Check
} from 'lucide-react'
import { useStore } from '@renderer/store'
import { Button, Input, Spinner } from './ui'

/** Minimal subset of Electron's <webview> API we use. */
type Webview = HTMLElement & {
  getURL(): string
  getTitle(): string
  loadURL(url: string): void
  goBack(): void
  goForward(): void
  reload(): void
  printToPDF(options?: Record<string, unknown>): Promise<Uint8Array>
}

const HOME = 'https://www.scholar-inbox.com/'

/**
 * Embedded Scholar Inbox browser. Uses a persistent session partition so the
 * login survives restarts, and opens the user's saved personal login link (from
 * the keychain) when present. Finding a PDF → "Open in a tab" adds a reader tab
 * without closing this browser, so the user can keep browsing.
 */
export default function ScholarBrowser(): JSX.Element {
  const openIntake = useStore((s) => s.openIntake)
  const closeScholar = useStore((s) => s.closeScholar)

  const wvRef = useRef<Webview | null>(null)
  // null while we resolve the saved login link → home vs. digest (single load).
  const [initialSrc, setInitialSrc] = useState<string | null>(null)
  const [url, setUrl] = useState(HOME)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [offerConvert, setOfferConvert] = useState(false)
  const [imported, setImported] = useState<string | null>(null)
  const [hasLink, setHasLink] = useState(false)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkDraft, setLinkDraft] = useState('')
  const [linkError, setLinkError] = useState<string | null>(null)

  // Resolve the saved login link once, then mount the webview at the right URL.
  useEffect(() => {
    window.api.scholar.getLink().then((link) => {
      setHasLink(!!link)
      setInitialSrc(link || HOME)
    })
  }, [])

  // Wire loading events once the webview is mounted.
  useEffect(() => {
    if (initialSrc == null) return
    const wv = wvRef.current
    if (!wv) return
    const onStart = (): void => setLoading(true)
    const onStop = (): void => {
      setLoading(false)
      setUrl(wv.getURL())
      setError(null)
      setOfferConvert(false)
    }
    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    return () => {
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
    }
  }, [initialSrc])

  const go = (u: string): void => {
    const full = /^https?:\/\//.test(u) ? u : `https://${u}`
    wvRef.current?.loadURL(full)
  }

  // A link in the page tried to open a new window (main denies the popup). If
  // it's a PDF, import it into a new tab; otherwise navigate the embedded
  // browser there — either way, no separate window appears.
  useEffect(() => {
    return window.api.scholar.onOpenUrl(async (target) => {
      setBusy(true)
      setError(null)
      setOfferConvert(false)
      setImported(null)
      try {
        const r = await window.api.intake.fromUrl(target)
        openIntake(r)
        setImported(r.title)
      } catch {
        wvRef.current?.loadURL(target)
      } finally {
        setBusy(false)
      }
    })
  }, [openIntake])

  // Import the current page as a PDF into a NEW tab, leaving this browser open.
  const openInTab = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setOfferConvert(false)
    setImported(null)
    try {
      const r = await window.api.intake.fromUrl(wvRef.current?.getURL() ?? url)
      openIntake(r)
      setImported(r.title)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import this page as a PDF.')
      setOfferConvert(true)
    } finally {
      setBusy(false)
    }
  }

  // Fallback: render the (possibly authenticated) page itself to a PDF.
  const convertPage = async (): Promise<void> => {
    const wv = wvRef.current
    if (!wv) return
    setBusy(true)
    setError(null)
    try {
      const data = await wv.printToPDF({ printBackground: true })
      const r = await window.api.intake.fromData(data, wv.getTitle(), wv.getURL())
      openIntake(r)
      setImported(r.title)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not convert this page to a PDF.')
    } finally {
      setBusy(false)
    }
  }

  const saveLink = async (): Promise<void> => {
    const link = linkDraft.trim()
    if (!link) return
    try {
      await window.api.scholar.setLink(link)
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'Could not save this link.')
      return
    }
    setLinkError(null)
    setHasLink(true)
    setLinkOpen(false)
    setLinkDraft('')
    wvRef.current?.loadURL(link)
  }
  const clearLink = async (): Promise<void> => {
    await window.api.scholar.clearLink()
    setHasLink(false)
    setLinkOpen(false)
  }

  return (
    <div className="flex h-full w-full flex-col bg-bg">
      <div className="flex items-center gap-2 border-b border-border bg-surface px-3 py-2">
        <Button size="icon" variant="ghost" onClick={() => wvRef.current?.goBack()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => wvRef.current?.goForward()}>
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => wvRef.current?.reload()}>
          {loading ? <Spinner /> : <RotateCw className="h-4 w-4" />}
        </Button>
        <span className="px-1 text-sm font-medium text-muted">Scholar Inbox</span>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go(url)}
          className="h-9 flex-1"
          spellCheck={false}
        />
        <Button variant="primary" onClick={openInTab} disabled={busy} title="Open this PDF in a new tab">
          {busy ? <Spinner /> : <FilePlus2 className="h-4 w-4" />}
          Open in a tab
        </Button>
        <Button
          size="icon"
          variant={hasLink ? 'outline' : 'ghost'}
          onClick={() => setLinkOpen((v) => !v)}
          title="Save your Scholar Inbox login link"
        >
          <KeyRound className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={closeScholar} title="Close (keeps browsing)">
          <X className="h-4 w-4" />
        </Button>
      </div>

      {linkOpen && (
        <div className="border-b border-border bg-surface px-3 py-2">
          <div className="flex items-center gap-2">
            <Input
              value={linkDraft}
              onChange={(e) => {
                setLinkDraft(e.target.value)
                setLinkError(null)
              }}
              onKeyDown={(e) => e.key === 'Enter' && saveLink()}
              placeholder="Paste your Scholar Inbox personal login link (https://scholar-inbox.com/…)"
              className="h-8 flex-1"
              spellCheck={false}
            />
            <Button size="sm" variant="primary" onClick={saveLink} disabled={!linkDraft.trim()}>
              Save
            </Button>
            {hasLink && (
              <Button size="sm" variant="ghost" onClick={clearLink}>
                Clear
              </Button>
            )}
          </div>
          {linkError && <p className="mt-1 text-xs text-red-400">{linkError}</p>}
          <p className="mt-1 text-xs text-muted">
            Find it on scholar-inbox.com → your account (a bookmarkable link); it opens your
            digest directly. Google sign-in is blocked in this embedded browser — use
            email/password or your login link.
          </p>
        </div>
      )}

      {imported && (
        <div className="flex items-center gap-2 bg-green-500/10 px-4 py-2 text-xs text-green-500">
          <Check className="h-4 w-4" />
          Opened “{imported}” in a new tab — keep browsing, or close to read it.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 px-4 py-2 text-xs text-red-400">
          <span className="flex-1">{error}</span>
          {offerConvert && (
            <Button
              size="sm"
              variant="outline"
              onClick={convertPage}
              disabled={busy}
              title="Render the current page to a text-extractable PDF"
            >
              {busy ? <Spinner /> : <FileText className="h-4 w-4" />}
              Convert this page to PDF
            </Button>
          )}
        </div>
      )}

      {initialSrc == null ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-sm text-muted">
          <Spinner /> Loading Scholar Inbox…
        </div>
      ) : (
        <>
          {/* eslint-disable react/no-unknown-property -- Electron <webview> attrs */}
          <webview
            ref={wvRef as unknown as React.RefObject<HTMLElement>}
            src={initialSrc}
            className="flex-1"
            allowpopups="true"
            partition="persist:scholar-inbox"
          />
          {/* eslint-enable react/no-unknown-property */}
        </>
      )}
    </div>
  )
}
