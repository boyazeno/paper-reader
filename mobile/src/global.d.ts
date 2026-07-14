import type { Api } from './api/apiTypes'

// The reused renderer code calls window.api.* — on mobile it's the Capacitor
// implementation installed in main.tsx (mobileApi), typed by the same surface.
declare global {
  interface Window {
    api: Api
  }
}

export {}
