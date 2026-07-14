import './polyfills' // Buffer/global for isomorphic-git — must load first
import React from 'react'
import ReactDOM from 'react-dom/client'
import 'katex/dist/katex.min.css'
import { installMobileApi } from '@mobile/api/mobileApi'
import AppShell from '@mobile/ui/AppShell'
// Reuse the desktop stylesheet (color vars, .textLayer, prose, KaTeX, scrollbars)
// so the reused components render correctly; then layer mobile-only tweaks.
import '@renderer/styles/index.css'
import './styles/mobile-extras.css'

// Install the Capacitor-backed window.api before any reused renderer code runs.
installMobileApi()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
)
