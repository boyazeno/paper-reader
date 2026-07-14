import git from 'isomorphic-git'
import { Capacitor } from '@capacitor/core'
import type { GitInfo, GitSyncResult } from '@shared/types'
import { gitFs as fs } from './gitFs'
import { gitHttpClient as http } from './gitHttp'
import { exists, writeTextAtomic, VaultFs } from './vaultFs'
import { getGitToken } from './secrets'
import { getGitConfig, setGitConfig } from './gitConfig'
import { setProgress } from './gitProgress'
import { GitNative, isGitNativeAvailable } from './gitNative'

/**
 * Vault ↔ Git sync with isomorphic-git over the VaultFs fs adapter. The vault
 * folder is the repo (its `.git` lives in the vault). Mirrors the desktop flow:
 * stage all → commit → fetch → merge → push. Auth is HTTPS + a Personal Access
 * Token (the mobile analogue of the desktop's SSH/credential-helper).
 *
 * Note: git smart-HTTP from a WebView is subject to CORS. Hosts that don't send
 * permissive CORS (e.g. github.com) need the optional `corsProxy` set in
 * settings, or a self-hosted/CORS-enabled remote.
 */

const dir = '' // vault root
const author = { name: 'Paper Reader', email: 'paper-reader@localhost' }

function isRepo(): Promise<boolean> {
  return exists('.git')
}

async function auth() {
  const token = await getGitToken()
  const { username, corsProxy } = await getGitConfig()
  const onAuth = token ? () => ({ username, password: token }) : undefined
  // The native HTTP transport bypasses CORS, so a proxy is only relevant in a
  // desktop browser (dev). On device we never route through a proxy.
  const proxy = Capacitor.getPlatform() === 'web' ? corsProxy || undefined : undefined
  return { onAuth, corsProxy: proxy }
}

async function fetchDepth(): Promise<number | undefined> {
  // Shallow (latest snapshot only) unless the user opted into full history —
  // downloads far less, which is what makes fetching a history-heavy repo
  // feasible on-device.
  const { fullHistory } = await getGitConfig()
  return fullHistory ? undefined : 1
}

export async function gitInfo(): Promise<GitInfo> {
  // Native engine: the repo is a hidden clone; report from stored config.
  if (isGitNativeAvailable()) {
    const { remoteUrl } = await getGitConfig()
    return {
      isRepo: !!remoteUrl,
      hasRemote: !!remoteUrl,
      remoteUrl: remoteUrl || null,
      branch: 'main',
      mergeInProgress: false
    }
  }
  if (!(await isRepo())) {
    return { isRepo: false, hasRemote: false, remoteUrl: null, branch: 'main', mergeInProgress: false }
  }
  let remoteUrl: string | null = null
  try {
    remoteUrl = (await git.getConfig({ fs, dir, path: 'remote.origin.url' })) ?? null
  } catch {
    /* no remote */
  }
  let branch = 'main'
  try {
    branch = (await git.currentBranch({ fs, dir, fullname: false })) || 'main'
  } catch {
    /* detached / unborn */
  }
  return { isRepo: true, hasRemote: !!remoteUrl, remoteUrl, branch, mergeInProgress: false }
}

export async function gitSetRemote(url: string): Promise<void> {
  await setGitConfig({ remoteUrl: url.trim() })
  if (isGitNativeAvailable()) return // native engine reads the URL from config
  if (!(await isRepo())) await git.init({ fs, dir, defaultBranch: 'main' })
  await git.deleteRemote({ fs, dir, remote: 'origin' }).catch(() => {})
  await git.addRemote({ fs, dir, remote: 'origin', url: url.trim() })
}

/** Full sync via the native JGit engine (handles arbitrarily large repos). */
async function nativeSync(): Promise<GitSyncResult> {
  const cfg = await getGitConfig()
  if (!cfg.remoteUrl) return { status: 'no-remote' }
  const token = (await getGitToken()) ?? ''
  await setProgress('running', 'starting (native git)…')
  const sub = await GitNative.addListener('progress', (e) => void setProgress('running', e.line))
  try {
    const res = await GitNative.sync({
      remoteUrl: cfg.remoteUrl,
      branch: 'main',
      username: cfg.username,
      token,
      shallow: !cfg.fullHistory,
      message: `Sync ${new Date().toISOString()}`
    })
    await setProgress('ok', 'synced (native)')
    return { status: 'ok', message: `Synced via native git\n${res.log}` }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await setProgress('error', msg)
    if (/conflict/i.test(msg)) return { status: 'conflict', files: [msg] }
    const lines = ['✗ Native git failed', msg]
    if (/auth|401|403|unauthor|permission/i.test(msg)) {
      lines.push('', 'Check the username and Access token (a GitHub PAT needs "repo" scope).')
    } else if (/404|not found/i.test(msg)) {
      lines.push('', 'Check the remote URL / that the repo exists.')
    }
    return { status: 'error', message: lines.join('\n') }
  } finally {
    await sub.remove()
  }
}

export async function gitSync(): Promise<GitSyncResult> {
  // On device, use native JGit (memory-safe at any repo size). The
  // isomorphic-git path below is the web/dev fallback.
  if (isGitNativeAvailable()) return nativeSync()

  // Step-by-step diagnostics surfaced in the UI when a sync fails (or succeeds).
  // Also mirrored to persistent storage (setProgress) so a hard OOM crash on a
  // huge repo still leaves a trace of how far it got.
  const diag: string[] = []
  const t0 = Date.now()
  const log = (m: string): void => {
    diag.push(`+${((Date.now() - t0) / 1000).toFixed(1)}s  ${m}`)
    void setProgress('running', m)
  }
  // Throttled progress reporter for fetch/push object counts.
  let lastWrite = 0
  const onProgress = (e: { phase: string; loaded: number; total?: number }): void => {
    const now = Date.now()
    if (now - lastWrite < 400) return
    lastWrite = now
    const pct = e.total ? ` ${Math.round((100 * e.loaded) / e.total)}% (${e.loaded}/${e.total})` : ` ${e.loaded}`
    void setProgress('running', `${e.phase}${pct}`)
  }
  const onMessage = (m: string): void => void setProgress('running', `server: ${m.trim()}`)

  let step = 'open repo'
  await setProgress('running', 'starting…')
  try {
    if (!(await isRepo())) {
      await git.init({ fs, dir, defaultBranch: 'main' })
      log('init: created a new repo in the vault')
    } else {
      log('open: existing repo')
    }

    // Ensure the repo always has at least one committable file, so a fresh /
    // empty vault still produces a first commit (and thus a `main` ref to push).
    // Mirrors the desktop app's .gitignore-on-init.
    if (!(await exists('.gitignore'))) {
      await writeTextAtomic('.gitignore', '*.tmp\n.DS_Store\n')
      log('init: wrote .gitignore')
    }

    step = 'read remote'
    let remoteUrl: string | null = null
    try {
      remoteUrl = (await git.getConfig({ fs, dir, path: 'remote.origin.url' })) ?? null
    } catch {
      /* none */
    }
    if (!remoteUrl) return { status: 'no-remote' }
    const host = safeHost(remoteUrl)
    log(`remote: ${remoteUrl}`)

    const token = await getGitToken()
    const { onAuth, corsProxy } = await auth()
    const transport = Capacitor.getPlatform() === 'web' ? 'fetch (browser)' : 'native http'
    log(`auth: token ${token ? 'set' : 'MISSING'} · transport ${transport}${corsProxy ? ` · proxy ${corsProxy}` : ''}`)

    const branch = (await git.currentBranch({ fs, dir, fullname: false })) || 'main'
    log(`branch: ${branch}`)

    // 1) Stage changes and commit them in SIZE-BOUNDED BATCHES, so a big vault
    //    becomes many small commits — each of which pushes as a small packfile
    //    (bounded memory) instead of one giant push that OOM-crashes.
    step = 'stage changes'
    const matrix = await git.statusMatrix({ fs, dir })
    // Untrack any tracked-but-now-ignored files (e.g. re-fetchable PDFs), so they
    // stop syncing. Working copies stay on disk.
    for (const r of matrix) {
      const fp = r[0] as string
      if (r[1] === 1 && (await git.isIgnored({ fs, dir, filepath: fp }))) {
        await git.remove({ fs, dir, filepath: fp })
      }
    }
    const matrix2 = await git.statusMatrix({ fs, dir })
    // Stage changed files, but never re-stage an ignored one.
    const candidate = matrix2.filter((r) => r[2] !== 1 || r[3] !== r[1])
    const changed: typeof candidate = []
    for (const r of candidate) {
      if (await git.isIgnored({ fs, dir, filepath: r[0] as string })) continue
      changed.push(r)
    }
    const withSize: { fp: string; del: boolean; size: number }[] = []
    for (const r of changed) {
      const fp = r[0] as string
      const wd = r[2]
      let size = 0
      if (wd !== 0) {
        try {
          size = (await VaultFs.stat({ path: fp })).size
        } catch {
          size = 0
        }
      }
      withSize.push({ fp, del: wd === 0, size })
    }
    const BATCH_BYTES = 16 * 1024 * 1024 // keep each commit/push well under the memory cap
    const BATCH_COUNT = 40
    const batches: { fp: string; del: boolean; size: number }[][] = []
    let cur: { fp: string; del: boolean; size: number }[] = []
    let curBytes = 0
    for (const f of withSize) {
      cur.push(f)
      curBytes += f.size
      if (curBytes >= BATCH_BYTES || cur.length >= BATCH_COUNT) {
        batches.push(cur)
        cur = []
        curBytes = 0
      }
    }
    if (cur.length) batches.push(cur)

    // Is there a commit yet? A fresh repo has an "unborn" branch (no HEAD).
    const hasHead = await git
      .resolveRef({ fs, dir, ref: 'HEAD' })
      .then(() => true)
      .catch(() => false)

    step = 'commit'
    if (batches.length) {
      for (let i = 0; i < batches.length; i++) {
        await setProgress('running', `committing batch ${i + 1}/${batches.length} (${changed.length} files)`)
        for (const f of batches[i]) {
          if (f.del) await git.remove({ fs, dir, filepath: f.fp })
          else await git.add({ fs, dir, filepath: f.fp })
        }
        const suffix = batches.length > 1 ? ` (${i + 1}/${batches.length})` : ''
        await git.commit({ fs, dir, message: `Sync ${new Date().toISOString()}${suffix}`, author })
      }
      log(`commit: ${batches.length} commit(s) for ${changed.length} changed files`)
    } else if (!hasHead) {
      await git.commit({ fs, dir, message: 'Initial commit', author })
      log('commit: initial commit')
    } else {
      log('commit: nothing to commit')
    }

    // 2) Fetch + fast-forward merge (skip if the remote branch doesn't exist yet).
    step = 'fetch'
    const depth = await fetchDepth()
    await git.fetch({ fs, http, dir, remote: 'origin', ref: branch, singleBranch: true, depth, onAuth, corsProxy, onProgress, onMessage })
    log(`fetch: ok${depth ? ' (shallow, latest only)' : ' (full history)'}`)

    step = 'merge'
    let remoteRef: string | null = null
    try {
      remoteRef = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branch}` })
    } catch {
      /* first push: no remote branch yet */
    }
    if (remoteRef) {
      try {
        await git.merge({ fs, dir, ours: branch, theirs: `refs/remotes/origin/${branch}`, author, fastForwardOnly: false })
        await git.checkout({ fs, dir, ref: branch })
        log('merge: merged origin')
      } catch (e) {
        return {
          status: 'conflict',
          files: [`Merge failed: ${(e as Error).message}`, ...diag]
        }
      }
    } else {
      log('merge: no remote branch yet (first push)')
    }

    // 3) Push COMMIT-BY-COMMIT (oldest first). Each push advances the remote
    //    branch one commit, so its packfile only carries that commit's objects
    //    (≈ one batch) — the "part by part" upload that avoids a huge push.
    step = 'push'
    const remoteSet = new Set<string>()
    try {
      const rt = await git.resolveRef({ fs, dir, ref: `refs/remotes/origin/${branch}` })
      for (const c of await git.log({ fs, dir, ref: rt })) remoteSet.add(c.oid)
    } catch {
      /* remote branch doesn't exist yet */
    }
    const localLog = await git.log({ fs, dir, ref: branch })
    const toPush = localLog.filter((c) => !remoteSet.has(c.oid)).reverse() // oldest → newest
    if (toPush.length === 0) {
      log('push: already up to date')
    } else {
      for (let i = 0; i < toPush.length; i++) {
        await setProgress('running', `pushing ${i + 1}/${toPush.length} commits`)
        await git.push({
          fs,
          http,
          dir,
          ref: toPush[i].oid,
          remoteRef: `refs/heads/${branch}`,
          onAuth,
          corsProxy,
          onProgress,
          onMessage
        })
      }
      log(`push: ${toPush.length} commit(s), one packfile each`)
    }
    await setProgress('ok', `synced ${host}`)
    return { status: 'ok', message: `Synced ${host}\n${diag.join('\n')}` }
  } catch (e) {
    const err = e as Error & { data?: unknown; caller?: string }
    await setProgress('error', `failed at ${step}: ${err.message}`)
    const lines = [
      `✗ Failed at: ${step}`,
      `${err.name || 'Error'}: ${err.message}`,
      err.caller ? `caller: ${err.caller}` : '',
      '',
      'Steps:',
      ...diag.map((d) => `  ${d}`)
    ].filter(Boolean)
    // Turn the most common failures into actionable guidance.
    if (/too large|out of memory|oom/i.test(err.message)) {
      lines.push(
        '',
        'Likely cause: the repo is too big for on-device memory. Seed the remote',
        'from your desktop once (real git has no such limit), then the phone only',
        'pushes/pulls small incremental changes. Keeping the vault trimmed helps.'
      )
    } else if (/failed to fetch|networkerror|load failed|cors/i.test(err.message)) {
      lines.push(
        '',
        'Likely cause: the git host blocks browser (WebView) requests with',
        'CORS — GitHub/GitLab don’t send the headers a WebView needs. Fix:',
        'set a CORS proxy above (tap "Use public proxy"), or use a',
        'CORS-enabled/self-hosted remote.'
      )
    } else if (/401|403|authentication|unauthor|permission/i.test(err.message)) {
      lines.push(
        '',
        'Likely cause: auth. Check the username and Access token (a GitHub',
        'PAT needs "repo" scope; username can be x-access-token).'
      )
    } else if (/404|not found|repository not found/i.test(err.message)) {
      lines.push('', 'Likely cause: the remote URL is wrong or the repo doesn’t exist.')
    }
    return { status: 'error', message: lines.join('\n') }
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
