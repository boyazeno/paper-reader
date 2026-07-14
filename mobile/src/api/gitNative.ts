import { registerPlugin, Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

/**
 * Native git engine (JGit) for large repos — see GitNativePlugin.kt. Runs the
 * whole sync natively on a real-path clone and mirrors files to/from the SAF
 * vault, so memory stays bounded at any repo size. Available only on device;
 * `isGitNativeAvailable()` gates its use.
 */
export interface GitNativePlugin {
  sync(options: {
    remoteUrl: string
    branch: string
    username: string
    token: string
    shallow: boolean
    message: string
  }): Promise<{ status: string; log: string }>
  addListener(
    event: 'progress',
    cb: (e: { line: string }) => void
  ): Promise<PluginListenerHandle>
}

export const GitNative = registerPlugin<GitNativePlugin>('GitNative')

export function isGitNativeAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('GitNative')
}
