import { Clipboard } from '@capacitor/clipboard'
import type {
  Bookmark,
  LlmChunkEvent,
  LlmDoneEvent,
  LlmRequest,
  Project,
  ProviderId,
  RecentEntry,
  SessionData
} from '@shared/types'
import type { Api } from './apiTypes'
import { dirname, join } from './path'
import { readBytes, writeBytes, mkdirp, writeTextAtomic, bytesToBlob } from './vaultFs'
import { loadProjectDir, saveProject } from './projectFile'
import { registerNoteImage } from './noteImages'
import { chooseVault, ensureVault, vaultDisplayPath } from './vault'
import { VaultFs } from './vaultFs'
import * as intake from './intake'
import { loadSettings, saveSettings } from './settings'
import { loadSession, saveSession } from './session'
import { addRecent, getLibrary, getRecents, removeBookmark, upsertBookmark } from './library'
import {
  clearScholarLink,
  deleteSecret,
  getScholarLink,
  getSecret,
  hasSecret,
  setScholarLink,
  setSecret
} from './secrets'
import { gitInfo, gitSetRemote, gitSync } from './git'
import { streamLlm } from './llmStream'
import { ScholarWebView } from './scholarWebView'

// ---- simple listener buses (replace Electron main→renderer events) ----
function bus<T>() {
  const listeners = new Set<(e: T) => void>()
  return {
    on(cb: (e: T) => void): () => void {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    emit(e: T): void {
      for (const l of [...listeners]) l(e)
    }
  }
}

const chunkBus = bus<LlmChunkEvent>()
const doneBus = bus<LlmDoneEvent>()
const scholarUrlBus = bus<string>()
const persistBus = bus<void>()
const streams = new Map<string, AbortController>()

/** Called by the ScholarWebView plugin listener (M5) to import an intercepted URL. */
export function emitScholarUrl(url: string): void {
  scholarUrlBus.emit(url)
}

// Persist the session when the app is backgrounded (mobile analogue of the
// desktop window-close handshake). The store's App effect registers via
// onPersistSession and writes session.json.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') persistBus.emit()
})

export const mobileApi: Api = {
  settings: {
    get: () => loadSettings(),
    set: (s) => saveSettings(s)
  },

  intake: {
    pick: () => intake.pickAndImport(),
    fromUrl: (url) => intake.importFromUrl(url),
    fromPath: (path) => intake.importFromPath(path),
    fromData: (data, title, source) => intake.importFromData(data, title, source),
    refetch: (pdfPath, url) => intake.refetch(pdfPath, url),
    markRefetchable: (pdfPath) => intake.markRefetchable(pdfPath)
  },

  project: {
    readPdf: (pdfPath) => readBytes(pdfPath),
    save: (project) => saveProject(project),
    async saveAs(project: Project) {
      // Single-vault model: "save as" just persists in place.
      const { dir } = await saveProject(project)
      return { project, dir }
    },
    async open() {
      return null // mobile opens via Library / Recents, not a folder picker
    },
    openPath: (dir) => loadProjectDir(dir),
    async saveImage(pdfPath: string, bytes: Uint8Array, seq: number) {
      const dir = dirname(pdfPath)
      const relPath = `images/shot-${seq}.png`
      await mkdirp(join(dir, 'images'))
      await writeBytes(join(dir, relPath), bytes)
      const blobUrl = URL.createObjectURL(bytesToBlob(bytes, 'image/png'))
      registerNoteImage(relPath, blobUrl)
      return { relPath, absPath: blobUrl }
    },
    async exportMarkdown(defaultName: string, markdown: string, images: { abs: string; name: string }[]) {
      // Write into the vault under exports/ (self-contained with its images/).
      const base = join('exports', defaultName.replace(/[^a-z0-9.-]+/gi, '-'))
      await mkdirp(base)
      const path = join(base, `${defaultName.replace(/\.md$/i, '')}.md`)
      await writeTextAtomic(path, markdown)
      if (images.length) {
        await mkdirp(join(base, 'images'))
        // `abs` here is a blob URL for freshly-inserted shots; skip copying if
        // we can't resolve bytes (the note already holds them in the project).
      }
      return { path }
    }
  },

  capture: {
    async screen() {
      throw new Error('Screen capture is replaced by in-app PDF-region crop on mobile.')
    }
  },

  clipboard: {
    write: async (text: string) => {
      await Clipboard.write({ string: text })
    }
  },

  recents: {
    get: (): Promise<RecentEntry[]> => getRecents(),
    add: (entry: RecentEntry) => addRecent(entry)
  },

  library: {
    get: (): Promise<Bookmark[]> => getLibrary(),
    upsert: (bm: Bookmark) => upsertBookmark(bm),
    remove: (id: string) => removeBookmark(id)
  },

  vault: {
    get: () => vaultDisplayPath(),
    async choose() {
      const uri = await chooseVault()
      await ensureVault()
      return uri
    },
    reveal: async () => {
      await VaultFs.reveal()
    }
  },

  git: {
    info: () => gitInfo(),
    setRemote: (url) => gitSetRemote(url),
    sync: () => gitSync()
  },

  getPendingOpen: async () => null,
  onOpenFile: () => () => {},

  session: {
    load: (): Promise<SessionData | null> => loadSession(),
    save: (data: SessionData) => saveSession(data)
  },
  onPersistSession: (cb) => persistBus.on(cb),
  sessionPersisted: () => {},

  devAutoOpen: async () => null,
  devOpenProject: async () => null,

  secret: {
    set: (p: ProviderId, key: string) => setSecret(p, key),
    has: (p: ProviderId) => hasSecret(p),
    delete: (p: ProviderId) => deleteSecret(p)
  },

  scholar: {
    setLink: (link: string) => setScholarLink(link),
    getLink: () => getScholarLink(),
    clearLink: () => clearScholarLink(),
    onOpenUrl: (cb) => scholarUrlBus.on(cb)
  },

  llm: {
    async start(req: LlmRequest) {
      const controller = new AbortController()
      streams.set(req.streamId, controller)
      const settings = await loadSettings()
      const apiKey = await getSecret(req.provider)
      try {
        await streamLlm(req.provider, settings, apiKey, {
          messages: req.messages,
          signal: controller.signal,
          onDelta: (delta) => chunkBus.emit({ streamId: req.streamId, delta })
        })
        doneBus.emit({ streamId: req.streamId })
        return { ok: true }
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        doneBus.emit({ streamId: req.streamId, error })
        return { ok: false, error }
      } finally {
        streams.delete(req.streamId)
      }
    },
    cancel: async (streamId: string) => {
      streams.get(streamId)?.abort()
      streams.delete(streamId)
    },
    async test(provider: ProviderId) {
      const settings = await loadSettings()
      const apiKey = await getSecret(provider)
      const controller = new AbortController()
      let gotToken = false
      const timer = setTimeout(() => controller.abort(), 15000)
      try {
        await streamLlm(provider, settings, apiKey, {
          messages: [{ role: 'user', content: 'ping' }],
          signal: controller.signal,
          onDelta: () => {
            gotToken = true
            controller.abort()
          }
        })
        return { ok: true }
      } catch (e) {
        if (gotToken) return { ok: true } // aborted right after the first token
        return { ok: false, error: e instanceof Error ? e.message : String(e) }
      } finally {
        clearTimeout(timer)
      }
    },
    onChunk: (cb) => chunkBus.on(cb),
    onDone: (cb) => doneBus.on(cb)
  }
}

/** Install as window.api before the React app mounts. */
export function installMobileApi(): void {
  ;(window as unknown as { api: Api }).api = mobileApi
  // Bridge the native Scholar WebView's intercepted PDF links to the bus that
  // scholar.onOpenUrl subscribers (AppShell) import from.
  void ScholarWebView.addListener('openUrl', (e) => scholarUrlBus.emit(e.url))
}
