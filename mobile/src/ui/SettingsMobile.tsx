import { useEffect, useState } from 'react'
import { ChevronLeft, Check, X, KeyRound } from 'lucide-react'
import { useStore } from '@renderer/store'
import { PROVIDERS, LANGUAGES } from '@renderer/lib/constants'
import { Button, Input, Select, Spinner, Textarea } from '@renderer/components/ui'
import type { ProviderId } from '@shared/types'
import GitSettings from './GitSettings'

/** Provider / key / language / theme settings. Keys go to the Keystore. */
export default function SettingsMobile({ onClose }: { onClose: () => void }): JSX.Element {
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)

  const [keyInput, setKeyInput] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [test, setTest] = useState<{ ok: boolean; error?: string } | null>(null)

  const provider = settings?.activeProvider ?? 'claude'
  const cfg = settings?.providers[provider]

  useEffect(() => {
    setKeyInput('')
    setTest(null)
    window.api.secret.has(provider).then(setHasKey)
  }, [provider])

  if (!settings) return <div />

  const setProvider = (id: ProviderId): void => void patchSettings({ activeProvider: id })
  const setModel = (model: string): void =>
    void patchSettings({
      providers: { ...settings.providers, [provider]: { ...cfg!, model } }
    })
  const setBaseUrl = (baseUrl: string): void =>
    void patchSettings({
      providers: { ...settings.providers, [provider]: { ...cfg!, baseUrl } }
    })

  const saveKey = async (): Promise<void> => {
    const k = keyInput.trim()
    if (!k) return
    await window.api.secret.set(provider, k)
    setKeyInput('')
    setHasKey(true)
    setTest(null)
  }
  const clearKey = async (): Promise<void> => {
    await window.api.secret.delete(provider)
    setHasKey(false)
    setTest(null)
  }
  const runTest = async (): Promise<void> => {
    setTesting(true)
    setTest(null)
    try {
      setTest(await window.api.llm.test(provider))
    } finally {
      setTesting(false)
    }
  }

  const label = 'mb-1 block text-xs font-medium text-muted'

  return (
    <div className="flex h-full w-full flex-col bg-bg">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-2">
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-muted">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-sm font-medium">Settings</div>
      </header>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 overflow-auto p-5">
        <div>
          <span className={label}>Model provider</span>
          <Select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <span className={label}>Model</span>
          <Input value={cfg?.model ?? ''} onChange={(e) => setModel(e.target.value)} spellCheck={false} />
        </div>

        {(provider === 'ollama' || provider === 'openrouter' || provider === 'openai') && (
          <div>
            <span className={label}>Base URL (optional)</span>
            <Input
              value={cfg?.baseUrl ?? ''}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="Override the default endpoint"
              spellCheck={false}
            />
          </div>
        )}

        <div>
          <span className={label}>
            API key {hasKey && <span className="text-green-500">· saved</span>}
          </span>
          <div className="flex gap-2">
            <Input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={hasKey ? '•••••••• (replace)' : 'Paste your API key'}
              spellCheck={false}
              className="flex-1"
            />
            <Button variant="primary" onClick={saveKey} disabled={!keyInput.trim()}>
              <KeyRound className="h-4 w-4" />
              Save
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={runTest} disabled={testing}>
              {testing ? <Spinner /> : 'Test connection'}
            </Button>
            {hasKey && (
              <Button size="sm" variant="ghost" onClick={clearKey}>
                Clear key
              </Button>
            )}
            {test && (
              <span className={test.ok ? 'text-xs text-green-500' : 'text-xs text-red-400'}>
                {test.ok ? (
                  <span className="flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> OK
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <X className="h-3.5 w-3.5" /> {test.error?.slice(0, 60)}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        <div>
          <span className={label}>Translate to</span>
          <Select
            value={settings.targetLang}
            onChange={(e) => patchSettings({ targetLang: e.target.value })}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <span className={label}>Theme</span>
          <Select
            value={settings.theme}
            onChange={(e) => patchSettings({ theme: e.target.value as typeof settings.theme })}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </Select>
        </div>

        <div>
          <span className={label}>“Find inspirations” prompt ({'{lang}'} is substituted)</span>
          <Textarea
            value={settings.inspirePrompt}
            onChange={(e) => patchSettings({ inspirePrompt: e.target.value })}
            rows={4}
          />
        </div>

        <GitSettings />
      </div>
    </div>
  )
}
