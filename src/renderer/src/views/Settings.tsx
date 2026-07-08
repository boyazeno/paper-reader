import { useEffect, useState } from 'react'
import { ArrowLeft, RotateCcw, FolderOpen } from 'lucide-react'
import { useStore } from '@renderer/store'
import { Button, Select, Textarea } from '@renderer/components/ui'
import ProviderConfig from '@renderer/components/ProviderConfig'
import { LANGUAGES } from '@renderer/lib/constants'
import { DEFAULT_INSPIRE_PROMPT } from '@shared/prompts'

export default function Settings(): JSX.Element {
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)
  const setView = useStore((s) => s.setView)
  const hasTabs = useStore((s) => s.tabOrder.length > 0)

  // Local draft of the inspire prompt; persisted on blur so we don't write
  // settings.json on every keystroke.
  const inspireSetting = settings?.inspirePrompt
  const [inspire, setInspire] = useState(inspireSetting ?? DEFAULT_INSPIRE_PROMPT)
  useEffect(() => {
    if (inspireSetting != null) setInspire(inspireSetting)
  }, [inspireSetting])

  const [vault, setVault] = useState('')
  useEffect(() => {
    window.api.vault.get().then(setVault)
  }, [])
  const chooseVault = async (): Promise<void> => {
    setVault(await window.api.vault.choose())
  }

  if (!settings) return <div />

  return (
    <div className="h-full overflow-auto bg-bg">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setView(hasTabs ? 'reader' : 'welcome')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        </div>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted">Model provider</h2>
          <div className="rounded-xl border border-border bg-surface p-5">
            <ProviderConfig />
          </div>
        </section>

        <section className="mb-8 grid grid-cols-2 gap-4">
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-medium text-muted">Translate to</h2>
            <Select
              value={settings.targetLang}
              onChange={(e) => patchSettings({ targetLang: e.target.value })}
              className="w-full"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5">
            <h2 className="mb-3 text-sm font-medium text-muted">Appearance</h2>
            <Select
              value={settings.theme}
              onChange={(e) =>
                patchSettings({ theme: e.target.value as typeof settings.theme })
              }
              className="w-full"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </Select>
          </div>
        </section>

        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted">Inspiration prompt</h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setInspire(DEFAULT_INSPIRE_PROMPT)
                patchSettings({ inspirePrompt: DEFAULT_INSPIRE_PROMPT })
              }}
              title="Reset to default"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5">
            <Textarea
              value={inspire}
              onChange={(e) => setInspire(e.target.value)}
              onBlur={() => {
                if (inspire !== settings.inspirePrompt)
                  patchSettings({ inspirePrompt: inspire })
              }}
              rows={5}
              spellCheck={false}
            />
            <p className="mt-2 text-xs text-muted">
              System prompt for “Find inspirations”. Use{' '}
              <code className="rounded bg-bg px-1">{'{lang}'}</code> for the target
              language. Saved automatically.
            </p>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-muted">Vault</h2>
          <div className="rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-bg px-3 py-2 text-xs text-fg">
                {vault}
              </code>
              <Button onClick={chooseVault} title="Choose vault folder">
                <FolderOpen className="h-4 w-4" />
                Change…
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted">
              All papers and your bookmark library are stored here. Point this at a
              synced folder (or copy it) to move everything between machines.
            </p>
          </div>
        </section>

        <p className="text-xs text-muted">
          API keys are stored in your OS keychain and never leave this machine.
        </p>
      </div>
    </div>
  )
}
