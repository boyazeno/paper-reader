/** A saved login link must be an https URL on scholar-inbox.com (mirrors the
 * desktop keychain guard — prevents storing/opening anything else). */
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
