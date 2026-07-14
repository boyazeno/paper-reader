// Canonical IPC channel names — the single source of truth shared by the
// preload bridge (main side) and the renderer client.

export const IPC = {
  // settings
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  // secrets (keychain) — never expose the raw key to the renderer
  secretSet: 'secret:set',
  secretHas: 'secret:has',
  secretDelete: 'secret:delete',
  // Scholar Inbox personal login link (stored in the keychain)
  scholarSetLink: 'scholar:set-link',
  scholarGetLink: 'scholar:get-link',
  scholarClearLink: 'scholar:clear-link',
  // main → renderer: a link in the Scholar Inbox webview tried to open a new
  // window (usually a PDF); the renderer imports it into a tab instead.
  scholarOpenUrl: 'scholar:open-url',
  // paper intake
  intakePick: 'intake:pick',
  intakeFromUrl: 'intake:from-url',
  intakeFromPath: 'intake:from-path',
  intakeFromData: 'intake:from-data',
  intakeRefetch: 'intake:refetch',
  intakeMarkRefetchable: 'intake:mark-refetchable',
  // projects
  projectSave: 'project:save',
  projectSaveAs: 'project:save-as',
  projectOpen: 'project:open',
  projectOpenPath: 'project:open-path',
  // window session (restore open tabs)
  sessionLoad: 'session:load',
  sessionSave: 'session:save',
  appPersistSession: 'app:persist-session',
  appSessionPersisted: 'app:session-persisted',
  // recents + bookmark library
  recentsGet: 'recents:get',
  recentAdd: 'recents:add',
  libraryGet: 'library:get',
  libraryUpsert: 'library:upsert',
  libraryRemove: 'library:remove',
  // vault
  vaultGet: 'vault:get',
  vaultChoose: 'vault:choose',
  vaultReveal: 'vault:reveal',
  // git sync
  gitInfo: 'git:info',
  gitSetRemote: 'git:set-remote',
  gitSync: 'git:sync',
  // open a PDF passed on the command line (file-manager "Open with")
  appGetPendingOpen: 'app:get-pending-open',
  appOpenFile: 'app:open-file',
  projectReadPdf: 'project:read-pdf',
  projectSaveImage: 'project:save-image',
  noteExportMd: 'note:export-md',
  // llm (request/response is fire-and-stream)
  llmStart: 'llm:start',
  llmCancel: 'llm:cancel',
  llmTest: 'llm:test',
  // llm streaming events (main -> renderer)
  llmChunk: 'llm:chunk',
  llmDone: 'llm:done',
  // screenshot
  captureScreen: 'capture:screen',
  // clipboard
  clipboardWrite: 'clipboard:write'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
