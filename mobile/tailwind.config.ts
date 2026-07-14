import type { Config } from 'tailwindcss'

// Mirrors the desktop palette (CSS-variable driven) and also scans the reused
// renderer components so their Tailwind classes are emitted.
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    '../src/renderer/src/**/*.{ts,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: 'rgb(var(--bg) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        fg: 'rgb(var(--fg) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--accent-fg) / <alpha-value>)',
        highlight: 'rgb(var(--highlight) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      borderRadius: {
        xl: '0.875rem'
      }
    }
  },
  plugins: []
} satisfies Config
