import { useEffect, useState } from 'react'
import { Check, KeyRound, Loader2, Plug } from 'lucide-react'
import { useStore } from '@renderer/store'
import { Button, Input, Select } from './ui'
import { PROVIDERS } from '@renderer/lib/constants'
import type { ProviderId } from '@shared/types'

const BASE_URL_PLACEHOLDER: Record<ProviderId, string> = {
  claude: 'https://api.anthropic.com (optional)',
  openai: 'https://api.openai.com/v1 (optional)',
  openrouter: 'https://openrouter.ai/api/v1 (optional)',
  ollama: 'http://localhost:11434'
}

/**
 * Reusable provider configuration card: provider, model, optional base-URL
 * override, API key (saved to the OS keychain), and a connection test. Used by
 * both the Welcome screen and the Settings view.
 */
export default function ProviderConfig(): JSX.Element | null {
  const settings = useStore((s) => s.settings)
  const patchSettings = useStore((s) => s.patchSettings)

  const [keyInput, setKeyInput] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [test, setTest] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')
  const [testMsg, setTestMsg] = useState('')

  const provider = settings?.activeProvider ?? 'claude'
  const cfg = settings?.providers[provider]

  // Reset transient state and refresh key presence when the provider changes.
  useEffect(() => {
    setKeyInput('')
    setTest('idle')
    setTestMsg('')
    let active = true
    window.api.secret.has(provider).then((h) => active && setHasKey(h))
    return () => {
      active = false
    }
  }, [provider])

  if (!settings || !cfg) return null

  const updateProvider = (patch: Partial<typeof cfg>): void => {
    patchSettings({
      providers: { ...settings.providers, [provider]: { ...cfg, ...patch } }
    })
  }

  const saveKey = async (): Promise<void> => {
    if (!keyInput.trim()) return
    await window.api.secret.set(provider, keyInput.trim())
    setHasKey(true)
    setKeyInput('')
  }

  const runTest = async (): Promise<void> => {
    setTest('testing')
    setTestMsg('')
    const r = await window.api.llm.test(provider)
    setTest(r.ok ? 'ok' : 'fail')
    setTestMsg(r.ok ? 'Connection OK' : r.error || 'Failed')
  }

  const needsKey = provider !== 'ollama'

  return (
    <div className="space-y-4">
      <Field label="Provider">
        <Select
          value={provider}
          onChange={(e) => patchSettings({ activeProvider: e.target.value as ProviderId })}
          className="w-full"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Model">
        <Input
          value={cfg.model}
          onChange={(e) => updateProvider({ model: e.target.value })}
          spellCheck={false}
        />
      </Field>

      <Field label={provider === 'ollama' ? 'Server URL' : 'Base URL'}>
        <Input
          value={cfg.baseUrl ?? ''}
          onChange={(e) => updateProvider({ baseUrl: e.target.value })}
          placeholder={BASE_URL_PLACEHOLDER[provider]}
          spellCheck={false}
        />
      </Field>

      {needsKey && (
        <Field label="API key">
          <div className="flex gap-2">
            <Input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder={hasKey ? '•••••• saved — enter to replace' : 'sk-…'}
              spellCheck={false}
            />
            <Button onClick={saveKey} disabled={!keyInput.trim()}>
              <KeyRound className="h-4 w-4" />
              Save
            </Button>
          </div>
        </Field>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button variant="primary" onClick={runTest} disabled={test === 'testing'}>
          {test === 'testing' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plug className="h-4 w-4" />
          )}
          Test connection
        </Button>
        {test === 'ok' && (
          <span className="flex items-center gap-1 text-sm text-green-500">
            <Check className="h-4 w-4" /> {testMsg}
          </span>
        )}
        {test === 'fail' && (
          <span className="truncate text-sm text-red-400">{testMsg}</span>
        )}
      </div>
    </div>
  )
}

export function Field({
  label,
  children
}: {
  label: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted">{label}</span>
      {children}
    </label>
  )
}
