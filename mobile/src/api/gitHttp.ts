import { registerPlugin, Capacitor } from '@capacitor/core'
import webHttp from 'isomorphic-git/http/web'
import { bytesToBase64, base64ToBytes } from './vaultFs'

/**
 * isomorphic-git HTTP client. On Android it routes through the native GitHttp
 * plugin (HttpURLConnection) so git talks straight to the host with no WebView
 * CORS and no third-party proxy. In a desktop browser (dev) it falls back to
 * the standard fetch-based client (subject to CORS — dev only).
 */
interface GitHttpPlugin {
  request(options: {
    url: string
    method: string
    headers: Record<string, string>
    body: string
  }): Promise<{ status: number; statusText: string; headers: Record<string, string>; body: string }>
}

const GitHttp = registerPlugin<GitHttpPlugin>('GitHttp')

// isomorphic-git's GitHttpRequest (subset we implement).
interface HttpRequest {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: AsyncIterableIterator<Uint8Array> | Uint8Array[]
}

/** Wrap bytes as the single-chunk async-iterable body isomorphic-git expects. */
async function* oneChunk(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield bytes
}

// The whole request body (a push packfile) is buffered + base64'd through the
// bridge, so a huge push would exhaust the WebView heap and hard-crash. Cap it
// and fail cleanly instead.
const MAX_BODY = 128 * 1024 * 1024 // 128 MB

async function collectBody(body: HttpRequest['body']): Promise<Uint8Array> {
  if (!body) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const c of body as AsyncIterable<Uint8Array>) {
    total += c.length
    if (total > MAX_BODY) {
      throw new Error(
        `Push too large (>${Math.round(MAX_BODY / 1e6)} MB) to send from the phone. ` +
          `Seed the remote from desktop, then sync incremental changes.`
      )
    }
    chunks.push(c)
  }
  const out = new Uint8Array(total)
  let o = 0
  for (const c of chunks) {
    out.set(c, o)
    o += c.length
  }
  return out
}

export const gitHttpClient = {
  async request(req: HttpRequest) {
    // Browser/dev: use the fetch client (CORS applies).
    if (Capacitor.getPlatform() === 'web') return webHttp.request(req as never)

    const bytes = await collectBody(req.body)
    const res = await GitHttp.request({
      url: req.url,
      method: req.method ?? 'GET',
      headers: req.headers ?? {},
      body: bytesToBase64(bytes)
    })
    return {
      url: req.url,
      method: req.method ?? 'GET',
      statusCode: res.status,
      statusMessage: res.statusText,
      headers: res.headers,
      body: oneChunk(base64ToBytes(res.body))
    }
  }
}
