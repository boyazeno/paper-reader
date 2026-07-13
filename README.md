# Paper Reader

An elegant, minimalist desktop app for reading academic papers — with a
side‑by‑side original / translated view, click‑to‑sync highlighting, on‑demand
LLM translation, paragraph‑level summaries and "find inspirations", and a
hideable rich‑notes column with embedded, croppable screenshots.

Built with **Electron + React + TypeScript**. PDF rendering and text extraction
use **PDF.js**; rich notes use **TipTap**; API keys live in the **OS keychain**.

## Features

- **Three ways to open a paper** — drag & drop a PDF, paste a URL (arXiv links
  are normalised to the PDF), or search by title in an embedded browser.
- **Two‑column reader** — original PDF on the left, translation on the right.
  Click any paragraph on either side to highlight + scroll to its counterpart.
- **On‑demand translation** — paragraphs translate lazily as they scroll into
  view, streamed live; every paragraph has a *Regenerate* button.
- **Summarize & Find inspirations** — select one or more paragraphs and run
  either action; results stream into a panel with *Regenerate*.
- **Notes** — a hideable rich‑text column (text colour, bold/italic, highlight)
  with embedded screenshots: capture the screen, crop a region, drop it in.
- **Save / open / undo** — projects are self‑contained `*.paperproj` folders
  (PDF + `project.json` + `images/`) that round‑trip losslessly.
- **Multiple LLM backends** — Claude, OpenAI, OpenRouter, and local Ollama.

## Architecture

```
Electron main (Node)                 Renderer (React + TS)
  • window / file dialogs              • Welcome · Reader · Settings
  • downloads · keychain (keytar)      • PDF.js canvas + text layer
  • LLM proxy (streaming)              • paragraph block ↔ bbox model
  • project save/load · prfile://      • Zustand store + undo/redo
        └────────── typed contextBridge IPC ──────────┘
```

API keys never reach the renderer: all LLM calls are proxied through the main
process, which reads keys from the OS keychain.

## Develop

```bash
npm install
npm run dev          # launch with hot reload
npm run typecheck    # tsc for main + renderer
npm run lint
```

## Build & package (Linux)

```bash
npm run build:linux  # → dist/Paper Reader-<v>.AppImage and paper-reader_<v>_amd64.deb
```

`npm run build` produces the unpacked `out/` bundle without installers.

## Configuration

Open **Settings** (gear icon) to choose a provider + model, paste an API key
(stored in the OS keychain), set the translation target language, and test the
connection. Ollama needs no key — just a running local server.

## License

Paper Reader is licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.
You may use, modify, and share it for any **noncommercial** purpose — personal
use, research, education, and nonprofit/government work all qualify. **Commercial
use requires a separate license** from the authors. Bundled third‑party
dependencies remain under their own (permissive) licenses; see
`THIRD_PARTY_LICENSES.txt` in a packaged build.
