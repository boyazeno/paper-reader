// isomorphic-git (and some of its deps) reference Node's `Buffer`/`global`,
// which don't exist in the Android WebView. Provide them before any git code
// runs. Imported first in main.tsx.
import { Buffer } from 'buffer'

const g = globalThis as unknown as { Buffer?: unknown; global?: unknown }
if (!g.Buffer) g.Buffer = Buffer
if (!g.global) g.global = globalThis
