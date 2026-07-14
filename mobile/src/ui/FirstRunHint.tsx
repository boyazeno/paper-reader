import { FileText, Hand, Sparkles, Camera } from 'lucide-react'
import { useStore } from '@renderer/store'

/**
 * One-time getting-started card (mobile replacement for the desktop spotlight
 * tour). Explains the touch model — toggle, long-press select, LLM actions —
 * then records tourCompleted in settings.
 */
export default function FirstRunHint(): JSX.Element {
  const patchSettings = useStore((s) => s.patchSettings)

  const row = (Icon: typeof FileText, text: string): JSX.Element => (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
      <p className="text-sm text-fg">{text}</p>
    </div>
  )

  return (
    <div className="absolute inset-0 z-[70] flex items-end bg-black/50 p-4">
      <div className="w-full rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-lg font-semibold">Reading on mobile</h2>
        <div className="flex flex-col gap-3">
          {row(FileText, 'Use the PDF ⇄ Translation toggle to switch views — the paragraph you tap stays in sync across both.')}
          {row(Hand, 'Long-press a paragraph to start multi-selecting; tap more to add them.')}
          {row(Sparkles, 'Explain, summarize, or find inspirations from your selection — or the whole paper.')}
          {row(Camera, 'In Notes, tap the camera to snip a region of the PDF into your note.')}
        </div>
        <button
          onClick={() => patchSettings({ tourCompleted: true })}
          className="mt-5 w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-fg"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
