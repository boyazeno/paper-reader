import { useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import {
  Bold,
  Italic,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  Camera,
  FileDown,
  X
} from 'lucide-react'
import { useTab, useTabActions } from '@renderer/lib/tab'
import { cn } from '@renderer/lib/cn'
import { docToMarkdown } from '@renderer/lib/markdown'
import ScreenshotCropper from './ScreenshotCropper'

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#a855f7']

/** Build a CSP-safe URL for a project-local image absolute path. */
export function prfileUrl(absPath: string): string {
  return `prfile://local/${encodeURIComponent(absPath)}`
}

/** Walk the TipTap doc and collect referenced image relative paths. */
function collectImages(doc: any): string[] {
  const out: string[] = []
  const visit = (n: any): void => {
    if (n?.type === 'image' && typeof n.attrs?.src === 'string') {
      // src is prfile://local/<uri-encoded-abs-path>; recover the file name.
      const abs = decodeURIComponent(n.attrs.src.replace(/^prfile:\/\/local\//, ''))
      const name = abs.split('/').pop()
      if (name) out.push(`images/${name}`)
    }
    n?.content?.forEach(visit)
  }
  visit(doc)
  return out
}

export default function NotesPanel(): JSX.Element {
  const project = useTab((t) => t?.project)
  const { setNote, toggleNotes } = useTabActions()
  const [cropping, setCropping] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: false })
    ],
    content: (project?.notes[0]?.doc as object) ?? '<p></p>',
    editorProps: {
      attributes: {
        class:
          'prose-sm max-w-none focus:outline-none min-h-[200px] text-[15px] leading-relaxed'
      }
    },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      setNote(json, collectImages(json))
    }
  })

  const exportMarkdown = async (): Promise<void> => {
    if (!editor) return
    const { markdown, images } = docToMarkdown(editor.getJSON())
    const name = project?.meta.title || 'note'
    await window.api.project.exportMarkdown(name, markdown, images)
  }

  const insertShot = async (bytes: Uint8Array): Promise<void> => {
    setCropping(false)
    if (!project) return
    const { absPath } = await window.api.project.saveImage(
      project.pdfPath,
      bytes,
      Date.now()
    )
    editor?.chain().focus().setImage({ src: prfileUrl(absPath) }).run()
  }

  const btn = (active: boolean): string =>
    cn(
      'grid h-8 w-8 place-items-center rounded-md text-fg transition-colors',
      active ? 'bg-accent/20 text-accent' : 'hover:bg-border/50'
    )

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-border bg-surface">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <button className={btn(!!editor?.isActive('bold'))} title="Bold"
          onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </button>
        <button className={btn(!!editor?.isActive('italic'))} title="Italic"
          onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </button>
        <button className={btn(!!editor?.isActive('highlight'))} title="Highlight"
          onClick={() => editor?.chain().focus().toggleHighlight({ color: '#fde047' }).run()}>
          <Highlighter className="h-4 w-4" />
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        <button className={btn(!!editor?.isActive('heading', { level: 1 }))} title="Heading 1"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="h-4 w-4" />
        </button>
        <button className={btn(!!editor?.isActive('heading', { level: 2 }))} title="Heading 2"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-4 w-4" />
        </button>
        <button className={btn(!!editor?.isActive('heading', { level: 3 }))} title="Heading 3"
          onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-4 w-4" />
        </button>
        <div className="mx-1 h-5 w-px bg-border" />
        {COLORS.map((c) => (
          <button
            key={c}
            title={`Text color ${c}`}
            onClick={() => editor?.chain().focus().setColor(c).run()}
            className="h-5 w-5 rounded-full ring-1 ring-border"
            style={{ backgroundColor: c }}
          />
        ))}
        <div className="flex-1" />
        <button className={btn(false)} title="Insert screenshot"
          onClick={() => setCropping(true)}>
          <Camera className="h-4 w-4" />
        </button>
        <button className={btn(false)} title="Export note as Markdown"
          onClick={exportMarkdown}>
          <FileDown className="h-4 w-4" />
        </button>
        <button className={btn(false)} title="Hide notes" onClick={toggleNotes}>
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3">
        <EditorContent editor={editor} />
      </div>

      {cropping && (
        <ScreenshotCropper onDone={insertShot} onCancel={() => setCropping(false)} />
      )}
    </aside>
  )
}
