import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, RotateCw, X, Download, FileText } from 'lucide-react'
import { Button, Input, Spinner } from './ui'
import type { IntakeResult } from '@shared/types'

interface Props {
  query: string
  onClose: () => void
  onImported: (r: IntakeResult) => void
}

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

/**
 * Embedded browser for the "search by title" intake path. Starts on Google
 * Scholar for the query; the user navigates to a PDF and clicks "Use this PDF",
 * which downloads the current URL through the main process.
 */
export default function SearchBrowser({ query, onClose, onImported }: Props): JSX.Element {
  const wvRef = useRef<Webview | null>(null)
  const start = `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`
  const [url, setUrl] = useState(start)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Offer "convert this page to PDF" after a direct download fails (e.g. the
  // page is HTML, not a PDF file).
  const [offerConvert, setOfferConvert] = useState(false)

  useEffect(() => {
    const wv = wvRef.current
    if (!wv) return
    const onStart = (): void => setLoading(true)
    const onStop = (): void => {
      setLoading(false)
      setUrl(wv.getURL())
      // A new page may well be a PDF — clear any stale fallback offer.
      setError(null)
      setOfferConvert(false)
    }
    wv.addEventListener('did-start-loading', onStart)
    wv.addEventListener('did-stop-loading', onStop)
    return () => {
      wv.removeEventListener('did-start-loading', onStart)
      wv.removeEventListener('did-stop-loading', onStop)
    }
  }, [])

  const go = (u: string): void => {
    const full = /^https?:\/\//.test(u) ? u : `https://${u}`
    wvRef.current?.loadURL(full)
  }

  const useThisPdf = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setOfferConvert(false)
    try {
      const current = wvRef.current?.getURL() ?? url
      const r = await window.api.intake.fromUrl(current)
      onImported(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not import this page as a PDF.')
      // The current page isn't a downloadable PDF — offer to render it to one.
      setOfferConvert(true)
    } finally {
      setBusy(false)
    }
  }

  // Print the page currently shown in the embedded browser to a PDF. Electron
  // renders the live DOM, so the resulting PDF keeps a selectable text layer.
  const convertPage = async (): Promise<void> => {
    const wv = wvRef.current
    if (!wv) return
    setBusy(true)
    setError(null)
    try {
      const data = await wv.printToPDF({ printBackground: true })
      const r = await window.api.intake.fromData(data, wv.getTitle(), wv.getURL())
      onImported(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not convert this page to a PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
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
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go(url)}
          className="h-9 flex-1"
          spellCheck={false}
        />
        <Button variant="primary" onClick={useThisPdf} disabled={busy}>
          {busy ? <Spinner /> : <Download className="h-4 w-4" />}
          Use this PDF
        </Button>
        <Button size="icon" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

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

      {/* eslint-disable-next-line react/no-unknown-property */}
      <webview ref={wvRef as any} src={start} className="flex-1" allowpopups="true" />
    </div>
  )
}
