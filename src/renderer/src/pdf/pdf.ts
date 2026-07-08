import * as pdfjs from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

/** Load a PDF document from raw bytes. */
export async function loadPdf(data: Uint8Array): Promise<PDFDocumentProxy> {
  // pdfjs transfers (and detaches) the buffer; hand it a copy so callers keep theirs.
  return pdfjs.getDocument({ data: data.slice() }).promise
}

export type { PDFDocumentProxy }
export { pdfjs }
