/** Smoothly center `el` within its scroll `container` using rect math —
 * deterministic even for absolutely-positioned elements and post-layout changes
 * where Element.scrollIntoView is unreliable. */
export function centerInScroll(container: HTMLElement, el: Element): void {
  const cRect = container.getBoundingClientRect()
  const eRect = el.getBoundingClientRect()
  const delta = eRect.top - cRect.top - (container.clientHeight - eRect.height) / 2
  container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' })
}
