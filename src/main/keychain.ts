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
