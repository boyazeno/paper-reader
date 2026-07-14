import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { Mathematics } from '@tiptap/extension-mathematics'
import { Bold, Italic, Highlighter, Heading1, Heading2, Camera, FileDown, X } from 'lucide-react'
import { useTab, useTabActions } from '@renderer/lib/tab'
import { docToMarkdown } from '@renderer/lib/markdown'
import { toDiskImageSrc } from '@mobile/api/noteImages'

/** Walk the doc and collect referenced image relative paths (blob → images/<name>). */
function collectImages(doc: unknown): string[] {
  const out: string[] = []
  const visit = (n: unknown): void => {
    const node = n as { type?: string; attrs?: { src?: string }; content?: unknown[] }
    if (node?.type === 'image' && typeof node.attrs?.src === 'string') {
      const rel = toDiskImageSrc(node.attrs.src)
      if (rel.startsWith('images/')) out.push(rel)
    }
    node?.content?.forEach(visit)
  }
  visit(doc)
  return out
}

/** Rewrite image srcs to their on-disk form for a self-contained markdown export. */
function toDiskDoc(doc: unknown): unknown {
  if (!doc || typeof doc !== 'object') return doc
  const node = doc as { type?: string; attrs?: { src?: string }; content?: unknown[] }
  const next = { ...node } as typeof node
  if (node.type === 'image' && typeof node.attrs?.src === 'string') {
    next.attrs = { ...node.attrs, src: toDiskImageSrc(node.attrs.src) }
  }
  if (Array.isArray(node.content)) next.content = node.content.map(toDiskDoc)
  return next
}

/**
 * Bottom-sheet notes editor — the same reused TipTap stack as desktop (rich
 * text + KaTeX). Screenshots are captured by cropping the PDF canvas (handled
 * by the parent, which hands back a blob URL to insert).
 */
export default function NotesSheet({
  onClose,
  onScreenshot
}: {
  onClose: () => void
  onScreenshot: () => Promise<string | null>
}): JSX.Element {
  const project = useTab((t) => t?.project)
  const { setNote } = useTabActions()

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: false }),
      Mathematics.configure({ katexOptions: { throwOnError: false } })
    ],
    content: (project?.notes[0]?.doc as object) ?? '<p></p>',
    editorProps: {
      attributes: { class: 'prose-sm max-w-none focus:outline-none min-h-[40vh] text-[15px]' }
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      setNote(json, collectImages(json))
    }
  })

  const insertShot = async (): Promise<void> => {
    const url = await onScreenshot()
    if (url) editor?.chain().focus().setImage({ src: url }).run()
  }

  const exportMd = async (): Promise<void> => {
    if (!editor) return
    const { markdown, images } = docToMarkdown(toDiskDoc(editor.getJSON()))
    await window.api.project.exportMarkdown(project?.meta.title || 'note', markdown, images)
  }

  const tbtn = (active: boolean): string =>
    'grid h-9 w-9 place-items-center rounded-md ' + (active ? 'bg-accent/20 text-accent' : 'text-fg')

  return (
    <div className="absolute inset-x-0 bottom-0 z-40 flex h-[70%] flex-col rounded-t-2xl border-t border-border bg-surface shadow-2xl">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <button className={tbtn(!!editor?.isActive('bold'))} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </button>
        <button className={tbtn(!!editor?.isActive('italic'))} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </button>
        <button className={tbtn(!!editor?.isActive('highlight'))} onClick={() => editor?.chain().focus().toggleHighlight({ color: '#fde047' }).run()}>
          <Highlighter className="h-4 w-4" />
        </button>
        <button className={tbtn(!!editor?.isActive('heading', { level: 1 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </button>
        <button className={tbtn(!!editor?.isActive('heading', { level: 2 }))} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </button>
        <div className="flex-1" />
        <button className={tbtn(false)} title="Insert screenshot" onClick={insertShot}>
          <Camera className="h-4 w-4" />
        </button>
        <button className={tbtn(false)} title="Export markdown" onClick={exportMd}>
          <FileDown className="h-4 w-4" />
        </button>
        <button className={tbtn(false)} title="Close" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-auto overscroll-contain px-4 py-3">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
