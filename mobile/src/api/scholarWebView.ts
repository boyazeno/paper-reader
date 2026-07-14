import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

/**
 * Native Scholar Inbox WebView (see android-plugins/ScholarWebViewPlugin.kt).
 * Overlaid below a `top`-px React toolbar; emits intercepted PDF URLs via the
 * `openUrl` event. The web fallback is a no-op so the app still builds/runs in
 * a desktop browser (Scholar just isn't available there).
 */
export interface ScholarWebViewPlugin {
  open(options: { url: string; top: number }): Promise<void>
  loadUrl(options: { url: string }): Promise<void>
  close(): Promise<void>
  goBack(): Promise<void>
  goForward(): Promise<void>
  reload(): Promise<void>
  addListener(
    event: 'openUrl',
    cb: (e: { url: string }) => void
  ): Promise<PluginListenerHandle>
}

const noop = async (): Promise<void> => {}

export const ScholarWebView = registerPlugin<ScholarWebViewPlugin>('ScholarWebView', {
  web: () => ({
    open: noop,
    loadUrl: noop,
    close: noop,
    goBack: noop,
    goForward: noop,
    reload: noop,
    async addListener() {
      return { remove: async () => {} } as PluginListenerHandle
    }
  })
})
