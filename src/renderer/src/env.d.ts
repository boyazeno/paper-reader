/// <reference types="vite/client" />

import type { DetailedHTMLProps, HTMLAttributes } from 'react'

// Electron's <webview> tag, used by the title-search browser.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      webview: DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src?: string
          allowpopups?: string
          partition?: string
          useragent?: string
        },
        HTMLElement
      >
    }
  }
}
