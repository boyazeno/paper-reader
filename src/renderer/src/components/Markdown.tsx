import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@renderer/lib/cn'

/** Renders LLM markdown output (lists, code, tables, emphasis, links).
 * Links open in the system browser via the main-process window-open handler. */
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
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer" />
          )
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
