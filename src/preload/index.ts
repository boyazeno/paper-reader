import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc'
import type {
  AppSettings,
  Bookmark,
  GitInfo,
  GitSyncResult,
  IntakeResult,
  LlmChunkEvent,
  LlmDoneEvent,
  LlmRequest,
  Project,
  ProviderId,
  RecentEntry,
  SessionData
} from '@shared/types'

/**
 * The single, typed surface the renderer is allowed to touch. No Node, no
 * ipcRenderer leakage — everything privileged stays in the main process.
 */
const api = {
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsGet),
    set: (s: AppSettings): Promise<AppSettings> => ipcRenderer.invoke(IPC.settingsSet, s)
  },
  intake: {
    pick: (): Promise<IntakeResult | null> => ipcRenderer.invoke(IPC.intakePick),
    fromUrl: (url: string): Promise<IntakeResult> =>
      ipcRenderer.invoke(IPC.intakeFromUrl, url),
    fromPath: (path: string): Promise<IntakeResult> =>
      ipcRenderer.invoke(IPC.intakeFromPath, path),
    fromData: (data: Uint8Array, title: string, source: string): Promise<IntakeResult> =>
      ipcRenderer.invoke(IPC.intakeFromData, data, title, source)
  },
  project: {
    readPdf: (pdfPath: string): Promise<Uint8Array> =>
      ipcRenderer.invoke(IPC.projectReadPdf, pdfPath),
    save: (project: Project): Promise<{ dir: string }> =>
      ipcRenderer.invoke(IPC.projectSave, project),
    saveAs: (project: Project): Promise<{ project: Project; dir: string } | null> =>
      ipcRenderer.invoke(IPC.projectSaveAs, project),
    open: (): Promise<Project | null> => ipcRenderer.invoke(IPC.projectOpen),
    openPath: (dir: string): Promise<Project> =>
      ipcRenderer.invoke(IPC.projectOpenPath, dir),
    saveImage: (
      pdfPath: string,
      bytes: Uint8Array,
      seq: number
    ): Promise<{ relPath: string; absPath: string }> =>
      ipcRenderer.invoke(IPC.projectSaveImage, pdfPath, bytes, seq),
    exportMarkdown: (
      defaultName: string,
      markdown: string,
      images: { abs: string; name: string }[]
    ): Promise<{ path: string } | null> =>
      ipcRenderer.invoke(IPC.noteExportMd, defaultName, markdown, images)
  },
  capture: {
    screen: (): Promise<{ dataUrl: string; width: number; height: number }> =>
      ipcRenderer.invoke(IPC.captureScreen)
  },
  clipboard: {
    write: (text: string): Promise<void> => ipcRenderer.invoke(IPC.clipboardWrite, text)
  },
  recents: {
    get: (): Promise<RecentEntry[]> => ipcRenderer.invoke(IPC.recentsGet),
    add: (entry: RecentEntry): Promise<RecentEntry[]> =>
      ipcRenderer.invoke(IPC.recentAdd, entry)
  },
  library: {
    get: (): Promise<Bookmark[]> => ipcRenderer.invoke(IPC.libraryGet),
    upsert: (bm: Bookmark): Promise<Bookmark[]> =>
      ipcRenderer.invoke(IPC.libraryUpsert, bm),
    remove: (id: string): Promise<Bookmark[]> => ipcRenderer.invoke(IPC.libraryRemove, id)
  },
  vault: {
    get: (): Promise<string> => ipcRenderer.invoke(IPC.vaultGet),
    choose: (): Promise<string> => ipcRenderer.invoke(IPC.vaultChoose),
    reveal: (): Promise<void> => ipcRenderer.invoke(IPC.vaultReveal)
  },
  git: {
    info: (): Promise<GitInfo> => ipcRenderer.invoke(IPC.gitInfo),
    setRemote: (url: string): Promise<void> => ipcRenderer.invoke(IPC.gitSetRemote, url),
    sync: (): Promise<GitSyncResult> => ipcRenderer.invoke(IPC.gitSync)
  },
  // PDF passed via the file manager ("Open with"): pending one at startup,
  // and a live event when the app is already running.
  getPendingOpen: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.appGetPendingOpen),
  onOpenFile(cb: (path: string) => void): () => void {
    const h = (_: unknown, path: string): void => cb(path)
    ipcRenderer.on(IPC.appOpenFile, h)
    return () => ipcRenderer.removeListener(IPC.appOpenFile, h)
  },
  // Window session: restore open tabs next launch. `onPersistSession` fires when
  // the window is closing so the renderer can save; it must reply `persisted()`.
  session: {
    load: (): Promise<SessionData | null> => ipcRenderer.invoke(IPC.sessionLoad),
    save: (data: SessionData): Promise<void> => ipcRenderer.invoke(IPC.sessionSave, data)
  },
  onPersistSession(cb: () => void): () => void {
    const h = (): void => cb()
    ipcRenderer.on(IPC.appPersistSession, h)
    return () => ipcRenderer.removeListener(IPC.appPersistSession, h)
  },
  sessionPersisted: (): void => ipcRenderer.send(IPC.appSessionPersisted),
  // Dev-only helpers; resolve to null unless the matching env var is set.
  devAutoOpen: (): Promise<IntakeResult | null> => ipcRenderer.invoke('dev:auto-open'),
  devOpenProject: (): Promise<Project | null> => ipcRenderer.invoke('dev:open-project'),
  secret: {
    set: (p: ProviderId, key: string): Promise<void> =>
      ipcRenderer.invoke(IPC.secretSet, p, key),
    has: (p: ProviderId): Promise<boolean> => ipcRenderer.invoke(IPC.secretHas, p),
    delete: (p: ProviderId): Promise<void> => ipcRenderer.invoke(IPC.secretDelete, p)
  },
  // Streaming LLM events. Returns an unsubscribe function.
  llm: {
    start: (req: LlmRequest): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.llmStart, req),
    cancel: (streamId: string): Promise<void> =>
      ipcRenderer.invoke(IPC.llmCancel, streamId),
    test: (p: ProviderId): Promise<{ ok: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.llmTest, p),
    onChunk(cb: (e: LlmChunkEvent) => void): () => void {
      const h = (_: unknown, e: LlmChunkEvent): void => cb(e)
      ipcRenderer.on(IPC.llmChunk, h)
      return () => ipcRenderer.removeListener(IPC.llmChunk, h)
    },
    onDone(cb: (e: LlmDoneEvent) => void): () => void {
      const h = (_: unknown, e: LlmDoneEvent): void => cb(e)
      ipcRenderer.on(IPC.llmDone, h)
      return () => ipcRenderer.removeListener(IPC.llmDone, h)
    }
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  // @ts-ignore — fallback when contextIsolation is disabled (should not happen)
  window.api = api
}
