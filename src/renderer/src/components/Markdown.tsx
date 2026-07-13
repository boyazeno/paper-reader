import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { cn } from '@renderer/lib/cn'

/** Normalize the `\(…\)` / `\[…\]` LaTeX delimiters some models emit into the
 * `$…$` / `$$…$$` that remark-math understands. */
function normalizeMath(src: string): string {
  return src
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`)
}

/** Renders markdown (lists, code, tables, emphasis, links) plus LaTeX math via
 * KaTeX (`$…$` inline, `$$…$$` block). Links open in the system browser via the
 * main-process window-open handler. */
export default function Markdown({
  children,
  className
}: {
  children: string
  className?: string
}): JSX.Element {
  return (
    <div className={cn('md-body', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" />
          )
        }}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  )
}
