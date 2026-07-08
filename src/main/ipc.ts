import { ipcMain, desktopCapturer, screen, clipboard, dialog, shell } from 'electron'
import { promises as fs } from 'fs'
import { join, dirname } from 'path'
import { IPC } from '@shared/ipc'
import type { AppSettings, LlmRequest, ProviderId } from '@shared/types'
import { loadSettings, saveSettings } from './settings'
import { importFromData, importFromPath, importFromUrl, pickAndImport } from './intake'
import { setSecret, hasSecret, deleteSecret } from './keychain'
import {
  saveProject,
  saveProjectAs,
  openProject,
  loadProjectDir,
  exportNoteMarkdown
} from './projectFile'
import {
  getRecents,
  addRecent,
  getLibrary,
  upsertBookmark,
  removeBookmark
} from './library'
import { getVaultPath, setVaultPath } from './vault'
import { gitInfo, gitSetRemote, gitSync } from './git'
import type { Bookmark, RecentEntry } from '@shared/types'
import { runLlm } from './llm'
import type { Project } from '@shared/types'

/** Active LLM streams, keyed by streamId, for cancellation. */
const streams = new Map<string, AbortController>()

/**
 * Register all main-process IPC handlers. Handlers are added incrementally as
 * build units land; channels are namespaced and defined in @shared/ipc.
 */
export function registerIpc(): void {
  // ---- settings ----
  ipcMain.handle(IPC.settingsGet, async () => loadSettings())
  ipcMain.handle(IPC.settingsSet, async (_e, settings: AppSettings) => {
    await saveSettings(settings)
    return settings
  })

  // ---- dev: auto-open a PDF given by the PR_OPEN env var (for headless checks) ----
  ipcMain.handle('dev:auto-open', async () => {
    const p = process.env['PR_OPEN']
    return p ? importFromPath(p) : null
  })
  // ---- dev: open an existing project dir from PR_OPEN_PROJECT (headless) ----
  ipcMain.handle('dev:open-project', async () => {
    const d = process.env['PR_OPEN_PROJECT']
    return d ? loadProjectDir(d) : null
  })

  // ---- paper intake ----
  ipcMain.handle(IPC.intakePick, async () => pickAndImport())
  ipcMain.handle(IPC.intakeFromUrl, async (_e, url: string) => importFromUrl(url))
  ipcMain.handle(IPC.intakeFromPath, async (_e, path: string) => importFromPath(path))
  ipcMain.handle(
    IPC.intakeFromData,
    async (_e, data: Uint8Array, title: string, source: string) =>
      importFromData(data, title, source)
  )

  // ---- pdf bytes for the renderer (pdfjs) ----
  ipcMain.handle(IPC.projectReadPdf, async (_e, pdfPath: string) => {
    const buf = await fs.readFile(pdfPath)
    // Transfer as a Uint8Array; structured clone handles it efficiently.
    return new Uint8Array(buf)
  })

  // ---- project save / open ----
  ipcMain.handle(IPC.projectSave, async (_e, project: Project) => saveProject(project))
  ipcMain.handle(IPC.projectSaveAs, async (_e, project: Project) =>
    saveProjectAs(project)
  )
  ipcMain.handle(IPC.projectOpen, async () => openProject())
  ipcMain.handle(IPC.projectOpenPath, async (_e, dir: string) => loadProjectDir(dir))

  // ---- recents + bookmark library ----
  ipcMain.handle(IPC.recentsGet, async () => getRecents())
  ipcMain.handle(IPC.recentAdd, async (_e, entry: RecentEntry) => addRecent(entry))
  ipcMain.handle(IPC.libraryGet, async () => getLibrary())
  ipcMain.handle(IPC.libraryUpsert, async (_e, bm: Bookmark) => upsertBookmark(bm))
  ipcMain.handle(IPC.libraryRemove, async (_e, id: string) => removeBookmark(id))

  // ---- vault ----
  ipcMain.handle(IPC.vaultGet, async () => getVaultPath())
  ipcMain.handle(IPC.vaultChoose, async () => {
    const r = await dialog.showOpenDialog({
      title: 'Choose vault folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (r.canceled || r.filePaths.length === 0) return getVaultPath()
    return setVaultPath(r.filePaths[0])
  })
  ipcMain.handle(IPC.vaultReveal, async () => {
    await shell.openPath(await getVaultPath())
  })

  // ---- git vault sync ----
  ipcMain.handle(IPC.gitInfo, async () => gitInfo())
  ipcMain.handle(IPC.gitSetRemote, async (_e, url: string) => gitSetRemote(url))
  ipcMain.handle(IPC.gitSync, async () => gitSync())
  ipcMain.handle(
    IPC.noteExportMd,
    async (
      _e,
      defaultName: string,
      markdown: string,
      images: { abs: string; name: string }[]
    ) => exportNoteMarkdown(defaultName, markdown, images)
  )

  // ---- clipboard ----
  ipcMain.handle(IPC.clipboardWrite, (_e, text: string) => clipboard.writeText(text))

  // ---- screenshot capture (full primary screen, native resolution) ----
  ipcMain.handle(IPC.captureScreen, async () => {
    const display = screen.getPrimaryDisplay()
    const sf = display.scaleFactor || 1
    const width = Math.round(display.size.width * sf)
    const height = Math.round(display.size.height * sf)
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    })
    const src = sources[0]
    return { dataUrl: src.thumbnail.toDataURL(), width, height }
  })

  // ---- save a cropped note image into the project's images/ dir ----
  ipcMain.handle(
    IPC.projectSaveImage,
    async (_e, pdfPath: string, bytes: Uint8Array, seq: number) => {
      const dir = join(dirname(pdfPath), 'images')
      await fs.mkdir(dir, { recursive: true })
      const name = `shot-${seq}.png`
      const abs = join(dir, name)
      await fs.writeFile(abs, Buffer.from(bytes))
      return { relPath: `images/${name}`, absPath: abs }
    }
  )

  // ---- secrets (keychain) ----
  ipcMain.handle(IPC.secretSet, async (_e, p: ProviderId, key: string) =>
    setSecret(p, key)
  )
  ipcMain.handle(IPC.secretHas, async (_e, p: ProviderId) => hasSecret(p))
  ipcMain.handle(IPC.secretDelete, async (_e, p: ProviderId) => deleteSecret(p))

  // ---- llm streaming ----
  ipcMain.handle(IPC.llmStart, async (event, req: LlmRequest) => {
    const controller = new AbortController()
    streams.set(req.streamId, controller)
    const settings = await loadSettings()
    try {
      await runLlm({
        provider: req.provider,
        settings,
        messages: req.messages,
        signal: controller.signal,
        onDelta: (delta) =>
          event.sender.send(IPC.llmChunk, { streamId: req.streamId, delta })
      })
      event.sender.send(IPC.llmDone, { streamId: req.streamId })
      return { ok: true }
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      event.sender.send(IPC.llmDone, { streamId: req.streamId, error })
      return { ok: false, error }
    } finally {
      streams.delete(req.streamId)
    }
  })

  ipcMain.handle(IPC.llmCancel, async (_e, streamId: string) => {
    streams.get(streamId)?.abort()
    streams.delete(streamId)
  })

  // ---- llm connection test ----
  ipcMain.handle(IPC.llmTest, async (_e, provider: ProviderId) => {
    const controller = new AbortController()
    const settings = await loadSettings()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      let got = ''
      await runLlm({
        provider,
        settings,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        signal: controller.signal,
        onDelta: (d) => {
          got += d
          if (got.length > 0) controller.abort() // first token is enough
        }
      })
      return { ok: true }
    } catch (e) {
      // An abort after receiving a token still counts as success.
      const msg = e instanceof Error ? e.message : String(e)
      if (/abort/i.test(msg)) return { ok: true }
      return { ok: false, error: msg }
    } finally {
      clearTimeout(timer)
    }
  })
}
