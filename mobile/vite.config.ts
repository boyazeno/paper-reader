import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The mobile app reuses the desktop renderer's platform-agnostic logic and the
// shared domain modules by aliasing straight into ../src. The Electron-specific
// window.api is replaced by mobile/src/api/mobileApi (installed in main.tsx).
export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, '../src/renderer/src'),
      '@shared': resolve(__dirname, '../src/shared'),
      '@mobile': resolve(__dirname, 'src')
    }
  },
  plugins: [react()],
  optimizeDeps: {
    include: ['pdfjs-dist']
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
