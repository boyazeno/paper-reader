// The exact `window.api` surface the reused renderer code depends on. This
// mirrors the Electron preload bridge (src/preload/index.ts `Api`) but is
// declared explicitly here so the mobile implementation can `satisfies Api`
// without importing anything from Electron. Keep it in sync with the preload.
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

export interface Api {
  settings: {
    get(): Promise<AppSettings>
    set(s: AppSettings): Promise<AppSettings>
  }
  intake: {
    pick(): Promise<IntakeResult | null>
    fromUrl(url: string): Promise<IntakeResult>
    fromPath(path: string): Promise<IntakeResult>
    fromData(data: Uint8Array, title: string, source: string): Promise<IntakeResult>
    refetch(pdfPath: string, url: string): Promise<void>
    markRefetchable(pdfPath: string): Promise<void>
  }
  project: {
    readPdf(pdfPath: string): Promise<Uint8Array>
    save(project: Project): Promise<{ dir: string }>
    saveAs(project: Project): Promise<{ project: Project; dir: string } | null>
    open(): Promise<Project | null>
    openPath(dir: string): Promise<Project>
    saveImage(
      pdfPath: string,
      bytes: Uint8Array,
      seq: number
    ): Promise<{ relPath: string; absPath: string }>
    exportMarkdown(
      defaultName: string,
      markdown: string,
      images: { abs: string; name: string }[]
    ): Promise<{ path: string } | null>
  }
  capture: {
    screen(): Promise<{ dataUrl: string; width: number; height: number }>
  }
  clipboard: {
    write(text: string): Promise<void>
  }
  recents: {
    get(): Promise<RecentEntry[]>
    add(entry: RecentEntry): Promise<RecentEntry[]>
  }
  library: {
    get(): Promise<Bookmark[]>
    upsert(bm: Bookmark): Promise<Bookmark[]>
    remove(id: string): Promise<Bookmark[]>
  }
  vault: {
    get(): Promise<string>
    choose(): Promise<string>
    reveal(): Promise<void>
  }
  git: {
    info(): Promise<GitInfo>
    setRemote(url: string): Promise<void>
    sync(): Promise<GitSyncResult>
  }
  getPendingOpen(): Promise<string | null>
  onOpenFile(cb: (path: string) => void): () => void
  session: {
    load(): Promise<SessionData | null>
    save(data: SessionData): Promise<void>
  }
  onPersistSession(cb: () => void): () => void
  sessionPersisted(): void
  devAutoOpen(): Promise<IntakeResult | null>
  devOpenProject(): Promise<Project | null>
  secret: {
    set(p: ProviderId, key: string): Promise<void>
    has(p: ProviderId): Promise<boolean>
    delete(p: ProviderId): Promise<void>
  }
  scholar: {
    setLink(link: string): Promise<void>
    getLink(): Promise<string | null>
    clearLink(): Promise<void>
    onOpenUrl(cb: (url: string) => void): () => void
  }
  llm: {
    start(req: LlmRequest): Promise<{ ok: boolean; error?: string }>
    cancel(streamId: string): Promise<void>
    test(p: ProviderId): Promise<{ ok: boolean; error?: string }>
    onChunk(cb: (e: LlmChunkEvent) => void): () => void
    onDone(cb: (e: LlmDoneEvent) => void): () => void
  }
}
