import { app, shell, BrowserWindow, protocol, net, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { pathToFileURL, fileURLToPath } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpc } from './ipc'
import { ensureVault } from './vault'
import { IPC } from '@shared/ipc'

/** Pull a PDF path out of process args (file-manager "Open with"). Handles
 * file:// URIs and ignores flags like --no-sandbox. */
function pdfFromArgv(argv: string[]): string | null {
  for (const a of argv.slice(1)) {
    if (!a || a.startsWith('-')) continue
    let p = a
    if (a.startsWith('file://')) {
      try {
        p = fileURLToPath(a)
      } catch {
        continue
      }
    }
    if (/\.pdf$/i.test(p)) return resolve(p)
  }
  return null
}

// Note: the Linux desktop launcher passes --no-sandbox (see electron-builder.yml
// `linux.executableArgs`). Chromium initializes its setuid sandbox before this
// main script runs, so it must be a real CLI arg — appending the switch here is
// too late. This sidesteps distros where chrome-sandbox can't initialize
// (e.g. Ubuntu 23.10+ unprivileged-userns lockdown).

// Serve project-local images (note screenshots) to the renderer under CSP.
protocol.registerSchemesAsPrivileged([
  { scheme: 'prfile', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0b0e',
    title: 'Paper Reader',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      // The title-search browser uses a <webview> tag.
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.on('ready-to-show', () => win.show())

  if (process.env['PR_CAPTURE']) {
    win.webContents.on('console-message', (_e, _l, message) =>
      console.log('[renderer]', message)
    )
  }

  // Dev-only: simulate a file-manager "Open with" of a second PDF while running,
  // to verify that opening adds a tab rather than replacing the current one.
  if (process.env['PR_OPEN2']) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        win.webContents.send(IPC.appOpenFile, process.env['PR_OPEN2'] as string)
      }, 600)
    })
  }

  // Dev-only: capture the window to a PNG and quit, for headless visual checks.
  if (process.env['PR_CAPTURE']) {
    win.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        // Optionally click the Nth tab first (verifies switch + preservation).
        if (process.env['PR_CLICK_TAB']) {
          const n = Number(process.env['PR_CLICK_TAB'])
          await win.webContents.executeJavaScript(
            `document.querySelectorAll('[data-tab]')[${n}]?.click()`
          )
          await new Promise((r) => setTimeout(r, 400))
        }
        // Optionally close the Nth tab (verifies neighbor activation).
        if (process.env['PR_CLOSE_TAB']) {
          const n = Number(process.env['PR_CLOSE_TAB'])
          await win.webContents.executeJavaScript(
            `document.querySelectorAll('[data-tab] button')[${n}]?.click()`
          )
          await new Promise((r) => setTimeout(r, 400))
        }
        // Optionally click a button by its title attribute (e.g. open a panel).
        if (process.env['PR_CLICK_TITLE']) {
          const t = process.env['PR_CLICK_TITLE'] as string
          await win.webContents.executeJavaScript(
            `document.querySelector('button[title=' + JSON.stringify(${JSON.stringify(t)}) + ']')?.click()`
          )
          await new Promise((r) => setTimeout(r, 500))
        }
        const img = await win.webContents.capturePage()
        const { writeFileSync } = await import('fs')
        writeFileSync(process.env['PR_CAPTURE'] as string, img.toPNG())
        app.quit()
      }, Number(process.env['PR_CAPTURE_DELAY'] ?? 1500))
    })
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

// Single-instance: a "Open with" launch while running forwards the PDF to the
// existing window instead of starting a second copy.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let mainWindow: BrowserWindow | null = null
  // PDF passed on the very first launch, delivered to the renderer once ready.
  let pendingOpen = pdfFromArgv(process.argv)

  app.on('second-instance', (_e, argv) => {
    const pdf = pdfFromArgv(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      if (pdf) mainWindow.webContents.send(IPC.appOpenFile, pdf)
    } else if (pdf) {
      pendingOpen = pdf
    }
  })

  app.whenReady().then(() => {
    electronApp.setAppUserModelId('de.unituebingen.paperreader')

    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // prfile://local/<uri-encoded-absolute-path> -> file on disk.
    protocol.handle('prfile', (request) => {
      const abs = decodeURIComponent(new URL(request.url).pathname.slice(1))
      return net.fetch(pathToFileURL(abs).toString())
    })

    // The renderer pulls (and clears) any PDF the app was launched with.
    ipcMain.handle(IPC.appGetPendingOpen, () => {
      const p = pendingOpen
      pendingOpen = null
      return p
    })

    ensureVault().catch((e) => console.error('vault init failed', e))
    registerIpc()
    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
