import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'de.unituebingen.paperreader.mobile',
  appName: 'Paper Reader',
  webDir: 'dist'
  // NOTE: we deliberately do NOT enable the global CapacitorHttp fetch patch —
  // it would break the LLM SSE streaming which relies on the WebView's native
  // (Chromium) fetch + ReadableStream. PDF downloads call CapacitorHttp.get()
  // explicitly instead (see src/api/pdfFetch.ts) to bypass CORS.
}

export default config
