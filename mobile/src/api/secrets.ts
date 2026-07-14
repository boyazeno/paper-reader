import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'
import type { ProviderId } from '@shared/types'
import { isScholarInboxLink } from './scholarLink'

// Android Keystore–backed storage, mirroring the desktop keychain accounts:
// one entry per provider id, plus 'scholar-inbox-link'. Never written to the vault.

const keyFor = (p: ProviderId): string => `secret:${p}`
const SCHOLAR_KEY = 'secret:scholar-inbox-link'

export async function setSecret(provider: ProviderId, key: string): Promise<void> {
  await SecureStoragePlugin.set({ key: keyFor(provider), value: key })
}

export async function getSecret(provider: ProviderId): Promise<string | null> {
  try {
    const { value } = await SecureStoragePlugin.get({ key: keyFor(provider) })
    return value ?? null
  } catch {
    return null // plugin throws when the key is absent
  }
}

export async function hasSecret(provider: ProviderId): Promise<boolean> {
  return (await getSecret(provider)) != null
}

export async function deleteSecret(provider: ProviderId): Promise<void> {
  try {
    await SecureStoragePlugin.remove({ key: keyFor(provider) })
  } catch {
    /* already absent */
  }
}

// ---- Git HTTPS token (Personal Access Token) ----
const GIT_TOKEN_KEY = 'secret:git-token'
export async function setGitToken(token: string): Promise<void> {
  await SecureStoragePlugin.set({ key: GIT_TOKEN_KEY, value: token })
}
export async function getGitToken(): Promise<string | null> {
  try {
    const { value } = await SecureStoragePlugin.get({ key: GIT_TOKEN_KEY })
    return value ?? null
  } catch {
    return null
  }
}
export async function clearGitToken(): Promise<void> {
  try {
    await SecureStoragePlugin.remove({ key: GIT_TOKEN_KEY })
  } catch {
    /* absent */
  }
}

// ---- Scholar Inbox personal login link ----
export async function setScholarLink(link: string): Promise<void> {
  if (!isScholarInboxLink(link)) {
    throw new Error('Not a Scholar Inbox link — it must be an https scholar-inbox.com URL.')
  }
  await SecureStoragePlugin.set({ key: SCHOLAR_KEY, value: link })
}

export async function getScholarLink(): Promise<string | null> {
  try {
    const { value } = await SecureStoragePlugin.get({ key: SCHOLAR_KEY })
    // Self-heal: drop anything that isn't a valid scholar-inbox.com link.
    if (value && !isScholarInboxLink(value)) {
      await clearScholarLink()
      return null
    }
    return value ?? null
  } catch {
    return null
  }
}

export async function clearScholarLink(): Promise<void> {
  try {
    await SecureStoragePlugin.remove({ key: SCHOLAR_KEY })
  } catch {
    /* already absent */
  }
}
