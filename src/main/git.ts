import { execFile } from 'child_process'
import { join } from 'path'
import { promises as fs } from 'fs'
import { getVaultPath } from './vault'
import type { GitInfo, GitSyncResult } from '@shared/types'

/**
 * Vault ↔ Git sync using the system `git`. The vault folder is the repo; Sync
 * commits local changes, merges the remote (pull), and pushes. Auth relies on
 * the user's git setup (SSH agent / credential helper / token in the URL);
 * GIT_TERMINAL_PROMPT=0 makes missing credentials fail fast instead of hanging.
 */

interface Run {
  code: number | string
  stdout: string
  stderr: string
}

function git(args: string[], cwd: string): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) =>
        resolve({
          code: err ? ((err as NodeJS.ErrnoException).code ?? 1) : 0,
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? ''
        })
    )
  })
}

const ok = (r: Run): boolean => r.code === 0

async function isRepo(cwd: string): Promise<boolean> {
  return ok(await git(['rev-parse', '--is-inside-work-tree'], cwd))
}

async function currentBranch(cwd: string): Promise<string> {
  const b = (await git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).stdout.trim()
  return b && b !== 'HEAD' ? b : 'main'
}

async function mergeInProgress(cwd: string): Promise<boolean> {
  return ok(await git(['rev-parse', '-q', '--verify', 'MERGE_HEAD'], cwd))
}

async function conflictedFiles(cwd: string): Promise<string[]> {
  const r = await git(['diff', '--name-only', '--diff-filter=U'], cwd)
  return r.stdout.split('\n').map((s) => s.trim()).filter(Boolean)
}

async function ensureIdentity(cwd: string): Promise<void> {
  if (!(await git(['config', 'user.email'], cwd)).stdout.trim()) {
    await git(['config', 'user.email', 'paper-reader@localhost'], cwd)
    await git(['config', 'user.name', 'Paper Reader'], cwd)
  }
}

async function ensureRepo(cwd: string): Promise<void> {
  if (await isRepo(cwd)) return
  if (!ok(await git(['init', '-b', 'main'], cwd))) await git(['init'], cwd)
  await ensureIdentity(cwd)
  const gi = join(cwd, '.gitignore')
  await fs.access(gi).catch(() => fs.writeFile(gi, '*.tmp\n.DS_Store\n'))
}

function cleanErr(s: string): string {
  return s.split('\n').filter(Boolean).slice(-4).join('\n').slice(0, 600) || 'Git error.'
}

export async function gitInfo(): Promise<GitInfo> {
  const cwd = await getVaultPath()
  if (!(await isRepo(cwd))) {
    return { isRepo: false, hasRemote: false, remoteUrl: null, branch: 'main', mergeInProgress: false }
  }
  const remote = await git(['remote', 'get-url', 'origin'], cwd)
  const url = ok(remote) ? remote.stdout.trim() : null
  return {
    isRepo: true,
    hasRemote: !!url,
    remoteUrl: url,
    branch: await currentBranch(cwd),
    mergeInProgress: await mergeInProgress(cwd)
  }
}

export async function gitSetRemote(url: string): Promise<void> {
  const cwd = await getVaultPath()
  await ensureRepo(cwd)
  await git(['remote', 'remove', 'origin'], cwd) // ignore if absent
  await git(['remote', 'add', 'origin', url.trim()], cwd)
}

export async function gitSync(): Promise<GitSyncResult> {
  const cwd = await getVaultPath()

  if (!ok(await git(['--version'], cwd))) {
    return { status: 'error', message: 'Git is not installed or not on PATH.' }
  }
  await ensureRepo(cwd)
  await ensureIdentity(cwd)

  // A previous merge left unresolved → user must finish it first.
  if (await mergeInProgress(cwd)) {
    return { status: 'conflict', files: await conflictedFiles(cwd) }
  }

  const remote = await git(['remote', 'get-url', 'origin'], cwd)
  if (!ok(remote) || !remote.stdout.trim()) return { status: 'no-remote' }
  const branch = await currentBranch(cwd)

  // 1) Commit local changes.
  if ((await git(['status', '--porcelain'], cwd)).stdout.trim()) {
    await git(['add', '-A'], cwd)
    const commit = await git(['commit', '-m', `Sync ${new Date().toISOString()}`], cwd)
    if (!ok(commit) && !/nothing to commit/.test(commit.stdout + commit.stderr)) {
      return { status: 'error', message: cleanErr(commit.stderr || commit.stdout) }
    }
  }

  // 2) Fetch + merge remote (pull).
  const fetch = await git(['fetch', 'origin'], cwd)
  if (!ok(fetch)) return { status: 'error', message: cleanErr(fetch.stderr) }

  if (ok(await git(['rev-parse', '--verify', `origin/${branch}`], cwd))) {
    let merge = await git(['merge', '--no-edit', `origin/${branch}`], cwd)
    if (!ok(merge) && /unrelated histories/.test(merge.stderr)) {
      merge = await git(['merge', '--no-edit', '--allow-unrelated-histories', `origin/${branch}`], cwd)
    }
    if (!ok(merge)) {
      const conflicts = await conflictedFiles(cwd)
      if (conflicts.length) return { status: 'conflict', files: conflicts }
      return { status: 'error', message: cleanErr(merge.stderr || merge.stdout) }
    }
  }

  // 3) Push.
  const push = await git(['push', '-u', 'origin', branch], cwd)
  if (!ok(push)) return { status: 'error', message: cleanErr(push.stderr) }

  return { status: 'ok', message: 'Vault synced.' }
}
