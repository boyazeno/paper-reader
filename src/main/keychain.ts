import type { ProviderId } from '@shared/types'

const SERVICE = 'paper-reader'

// keytar is a native module backed by libsecret on Linux; it may be unavailable
// in headless environments. Load it lazily and degrade to an in-memory store so
// the app still runs (keys just won't persist across restarts).
type Keytar = typeof import('keytar')
let keytar: Keytar | null = null
let triedLoad = false
const memory = new Map<string, string>()

async function getKeytar(): Promise<Keytar | null> {
  if (triedLoad) return keytar
  triedLoad = true
  try {
    keytar = (await import('keytar')).default ?? (await import('keytar'))
    // Probe — some environments load the module but throw on first call.
    await keytar.findCredentials(SERVICE)
  } catch (e) {
    console.warn('keytar unavailable, falling back to in-memory secrets:', e)
    keytar = null
  }
  return keytar
}

export async function setSecret(provider: ProviderId, key: string): Promise<void> {
  const kt = await getKeytar()
  if (kt) await kt.setPassword(SERVICE, provider, key)
  else memory.set(provider, key)
}

export async function getSecret(provider: ProviderId): Promise<string | null> {
  const kt = await getKeytar()
  if (kt) return kt.getPassword(SERVICE, provider)
  return memory.get(provider) ?? null
}

export async function hasSecret(provider: ProviderId): Promise<boolean> {
  return (await getSecret(provider)) != null
}

export async function deleteSecret(provider: ProviderId): Promise<void> {
  const kt = await getKeytar()
  if (kt) await kt.deletePassword(SERVICE, provider)
  else memory.delete(provider)
}

// ---- Scholar Inbox personal login link (a reusable bearer token) ----

const SCHOLAR_ACCOUNT = 'scholar-inbox-link'

/** A saved login link must be an https URL on scholar-inbox.com — guards
 * against storing/opening anything else (e.g. a stray localhost URL). */
export function isScholarInboxLink(link: string): boolean {
  try {
    const u = new URL(link)
    return (
      u.protocol === 'https:' &&
      (u.hostname === 'scholar-inbox.com' || u.hostname.endsWith('.scholar-inbox.com'))
    )
  } catch {
    return false
  }
}

export async function setScholarLink(link: string): Promise<void> {
  if (!isScholarInboxLink(link)) {
    throw new Error('Not a Scholar Inbox link — it must be an https scholar-inbox.com URL.')
  }
  const kt = await getKeytar()
  if (kt) await kt.setPassword(SERVICE, SCHOLAR_ACCOUNT, link)
  else memory.set(SCHOLAR_ACCOUNT, link)
}

export async function getScholarLink(): Promise<string | null> {
  const kt = await getKeytar()
  const link = kt ? await kt.getPassword(SERVICE, SCHOLAR_ACCOUNT) : memory.get(SCHOLAR_ACCOUNT)
  // Ignore (and drop) anything that isn't a valid scholar-inbox.com link.
  if (!link) return null
  if (!isScholarInboxLink(link)) {
    await clearScholarLink()
    return null
  }
  return link
}

export async function clearScholarLink(): Promise<void> {
  const kt = await getKeytar()
  if (kt) await kt.deletePassword(SERVICE, SCHOLAR_ACCOUNT)
  else memory.delete(SCHOLAR_ACCOUNT)
}
