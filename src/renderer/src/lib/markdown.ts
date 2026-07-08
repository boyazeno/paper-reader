// Convert a TipTap/ProseMirror note document to Markdown. The note schema is
// small and known (StarterKit + heading + bold/italic/code/highlight/color +
// images + lists + blockquote), so a focused serializer avoids a dependency.

export interface ExportImage {
  /** Absolute path on disk (decoded from the prfile:// src). */
  abs: string
  /** File name, used for the relative `images/<name>` link. */
  name: string
}

export interface MarkdownExport {
  markdown: string
  images: ExportImage[]
}

function imageFromSrc(src: string): ExportImage | null {
  if (!src) return null
  const abs = decodeURIComponent(src.replace(/^prfile:\/\/local\//, ''))
  const name = abs.split('/').pop()
  return name ? { abs, name } : null
}

export function docToMarkdown(doc: any): MarkdownExport {
  const images: ExportImage[] = []

  const inline = (nodes: any[] | undefined): string =>
    (nodes ?? [])
      .map((n) => {
        if (n.type === 'text') {
          let t: string = n.text ?? ''
          for (const m of n.marks ?? []) {
            if (m.type === 'bold') t = `**${t}**`
            else if (m.type === 'italic') t = `*${t}*`
            else if (m.type === 'code') t = `\`${t}\``
            else if (m.type === 'highlight') t = `==${t}==`
            else if (m.type === 'textStyle' && m.attrs?.color)
              t = `<span style="color:${m.attrs.color}">${t}</span>`
          }
          return t
        }
        if (n.type === 'hardBreak') return '  \n'
        if (n.type === 'image') {
          const img = imageFromSrc(n.attrs?.src ?? '')
          if (img) images.push(img)
          return img ? `![](images/${img.name})` : ''
        }
        return ''
      })
      .join('')

  const block = (node: any, depth = 0): string => {
    switch (node.type) {
      case 'heading':
        return `${'#'.repeat(node.attrs?.level ?? 1)} ${inline(node.content)}`
      case 'paragraph':
        return inline(node.content)
      case 'bulletList':
      case 'orderedList': {
        const ordered = node.type === 'orderedList'
        return (node.content ?? [])
          .map((li: any, i: number) => {
            const marker = ordered ? `${i + 1}.` : '-'
            const body = (li.content ?? [])
              .map((c: any) => block(c, depth + 1))
              .join('\n')
            const indent = '  '.repeat(depth)
            // Indent continuation lines to keep them inside the list item.
            return `${indent}${marker} ${body.replace(/\n/g, `\n${indent}  `)}`
          })
          .join('\n')
      }
      case 'blockquote':
        return (node.content ?? [])
          .map((c: any) => block(c))
          .join('\n\n')
          .replace(/^/gm, '> ')
      case 'codeBlock':
        return `\`\`\`${node.attrs?.language ?? ''}\n${inline(node.content)}\n\`\`\``
      case 'horizontalRule':
        return '---'
      case 'image': {
        const img = imageFromSrc(node.attrs?.src ?? '')
        if (img) images.push(img)
        return img ? `![](images/${img.name})` : ''
      }
      default:
        return inline(node.content)
    }
  }

  const markdown = (doc?.content ?? [])
    .map((n: any) => block(n))
    .filter((s: string) => s.length > 0)
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()

  return { markdown: markdown + '\n', images }
}
