/**
 * Providers & credentials. Reads the live config status over the session RPC
 * (capability "providerControl") and lets you add a provider, set or change an
 * API key, sign in with OAuth (Codex / Copilot), or import a managed key —
 * without dropping to the init wizard. Credentials are written to disk; a note
 * makes clear they apply to the NEXT session (the running session's model set
 * is fixed at bootstrap). Falls back to the read-only settings.json view when
 * no live session is available.
 */

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ExternalLink, KeyRound, LogIn, RefreshCw, Server, Check, Loader2 } from 'lucide-react'
import { api } from '@/lib/api.js'
import { useSessionStore } from '@/state/sessionStore.js'
import type { ConfigStatus, ProviderPresetInfo, SessionTab, SettingsSnapshot } from '@shared/rpc.js'
import { cn } from '@/lib/cn.js'
import { providerBrandLabel, stripProviderPrefix, compactModelLabel } from '@/lib/modelDisplay.js'
import { EmptyHint, PageHeader, SettingsGroup, SettingsRow } from '@/components/settings/primitives.js'

const THINKING_LEVELS = [
  { value: '', label: 'Model default' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra-high' },
  { value: 'max', label: 'Max' },
] as const

const PERMISSION_MODES = [
  { value: '', label: 'Default' },
  { value: 'read_only', label: 'Read only' },
  { value: 'reversible', label: 'Reversible' },
  { value: 'yolo', label: 'YOLO' },
] as const

export function ProvidersSection({ tab }: { tab: SessionTab | null }): JSX.Element {
  const request = useSessionStore((s) => s.request)
  const refreshModelCatalog = useSessionStore((s) => s.refreshModelCatalog)
  const capabilities = useSessionStore((s) => (tab ? s.perTab[tab.tabId]?.meta?.capabilities : undefined) ?? [])
  const globalModels = useSessionStore((s) => s.globalModels)

  const live = !!tab && tab.status === 'ready' && capabilities.includes('providerControl')

  const [settings, setSettings] = useState<SettingsSnapshot | null>(null)
  const [config, setConfig] = useState<ConfigStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setSettings(await api.settings.get())
      if (live && tab) setConfig(await request<ConfigStatus>(tab.tabId, 'provider.getConfigStatus'))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [live, tab, request])

  useEffect(() => {
    void load()
  }, [load])

  const updateDefault = async (patch: {
    defaultModel?: string | null
    thinkingLevel?: string | null
    permissionMode?: string | null
  }): Promise<void> => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      setSettings(await api.settings.updateDefaults(patch))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const afterCredentialChange = async (message: string): Promise<void> => {
    setNotice(message)
    if (tab) void refreshModelCatalog(tab.tabId)
    await load()
  }

  const configureKey = async (p: ProviderPresetInfo, apiKey: string): Promise<void> => {
    if (!tab || !apiKey.trim()) return
    setError(null)
    const method = p.isManaged ? 'provider.configureManaged' : 'provider.configureApiKey'
    try {
      await request(tab.tabId, method, { providerId: p.id, apiKey: apiKey.trim() })
      await afterCredentialChange(`Saved ${p.name} key — start a new session to use it.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const signIn = async (p: ProviderPresetInfo): Promise<void> => {
    if (!tab) return
    setError(null)
    try {
      const r = await request<{ status: string }>(tab.tabId, 'provider.startOAuth', { providerId: p.id })
      await afterCredentialChange(
        r.status === 'already_authenticated' ? `${p.name} is already signed in.` : `Signed in to ${p.name} — start a new session to use it.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const presets = config?.providers ?? []

  return (
    <div>
      <PageHeader
        title="Providers & credentials"
        subtitle={
          live
            ? 'Add a provider, set or change an API key, or sign in with OAuth. New credentials apply to the next session you start.'
            : 'Read-only — open a session to manage credentials from here.'
        }
        action={
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void load()}
              className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition hover:bg-line-soft hover:text-ink disabled:opacity-45"
              title="Reload"
              aria-label="Reload providers"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => void api.settings.openFile()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-soft bg-pane px-3 text-[12.5px] font-medium text-ink-2 transition hover:border-line hover:bg-line-soft hover:text-ink"
            >
              <ExternalLink className="h-3 w-3" strokeWidth={2} />
              Open settings.json
            </button>
          </div>
        }
      />

      {error && (
        <div className="mb-4 rounded-lg border border-error/25 bg-error/5 px-3 py-2 text-[13px] text-error">{error}</div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-[13px] text-ink-2">{notice}</div>
      )}

      <SettingsGroup label="Defaults">
        <SettingsRow
          title="Default model"
          subtitle="Used when a session opens without explicit selection."
          control={
            <DefaultModelPicker
              models={globalModels}
              value={settings?.defaultModel ?? ''}
              saving={saving}
              onPick={(value) => void updateDefault({ defaultModel: value || null })}
            />
          }
        />
        <SettingsRow
          title="Thinking level"
          subtitle="Applied to thinking-capable models."
          control={
            <NativeSelect
              value={settings?.thinkingLevel ?? ''}
              options={THINKING_LEVELS as unknown as ReadonlyArray<{ value: string; label: string }>}
              disabled={saving}
              onChange={(v) => void updateDefault({ thinkingLevel: v || null })}
            />
          }
        />
        <SettingsRow
          title="Permission mode"
          subtitle="Controls whether tools ask before destructive actions."
          isLast
          control={
            <NativeSelect
              value={settings?.permissionMode ?? ''}
              options={PERMISSION_MODES as unknown as ReadonlyArray<{ value: string; label: string }>}
              disabled={saving}
              onChange={(v) => void updateDefault({ permissionMode: v || null })}
            />
          }
        />
      </SettingsGroup>

      {live ? (
        presets.length === 0 ? (
          <SettingsGroup label="Providers">
            <EmptyHint text="No provider presets available." />
          </SettingsGroup>
        ) : (
          <SettingsGroup label="Providers">
            {presets.map((p, i) => (
              <ProviderRow
                key={p.id}
                provider={p}
                isLast={i === presets.length - 1}
                onConfigureKey={(key) => configureKey(p, key)}
                onSignIn={() => signIn(p)}
              />
            ))}
          </SettingsGroup>
        )
      ) : (
        <SettingsGroup label={`Configured providers (${settings?.providers.length ?? 0})`}>
          {(settings?.providers ?? []).length === 0 ? (
            <EmptyHint text="No providers configured in settings.json." />
          ) : (
            (settings?.providers ?? []).map((p, i) => (
              <div key={p.id} className={cn('px-4 py-3', i < (settings?.providers.length ?? 0) - 1 && 'border-b border-line-soft')}>
                <div className="flex items-center gap-2.5">
                  <span className="mono min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{p.id}</span>
                  <span
                    className={cn(
                      'rounded-md px-2 py-0.5 text-[11.5px] font-medium',
                      p.hasEnvValue || p.hasInlineKey ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning',
                    )}
                  >
                    {p.hasEnvValue || p.hasInlineKey ? 'key found' : 'key missing'}
                  </span>
                </div>
              </div>
            ))
          )}
        </SettingsGroup>
      )}

      <div className="mono mt-4 truncate px-1 text-[11.5px] text-ink-4">{settings?.settingsPath ?? 'settings.json'}</div>
    </div>
  )
}

function ProviderRow({
  provider,
  isLast,
  onConfigureKey,
  onSignIn,
}: {
  provider: ProviderPresetInfo
  isLast?: boolean
  onConfigureKey: (key: string) => void | Promise<void>
  onSignIn: () => void | Promise<void>
}): JSX.Element {
  const [editing, setEditing] = useState(false)
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)

  const Icon = provider.isOAuth ? LogIn : provider.isLocal ? Server : KeyRound

  const submitKey = async (): Promise<void> => {
    if (!key.trim() || busy) return
    setBusy(true)
    try {
      await onConfigureKey(key)
      setKey('')
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  const doSignIn = async (): Promise<void> => {
    setBusy(true)
    try {
      await onSignIn()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={cn('px-4 py-3', !isLast && 'border-b border-line-soft')}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-line-soft text-ink-3">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink">{provider.name}</span>
          <span className="mono block truncate text-[11.5px] text-ink-4">{provider.envVar}</span>
        </span>
        {provider.configured && (
          <span className="inline-flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-[11.5px] font-medium text-success">
            <Check className="h-3 w-3" strokeWidth={2.4} /> configured
          </span>
        )}
        {provider.isOAuth ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void doSignIn()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12.5px] font-medium text-pane transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
            {provider.configured ? 'Re-authenticate' : 'Sign in'}
          </button>
        ) : provider.isLocal ? (
          <button
            type="button"
            onClick={() => void api.settings.openFile()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-soft bg-pane px-3 text-[12.5px] font-medium text-ink-2 transition hover:border-line hover:text-ink"
          >
            Configure
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line-soft bg-pane px-3 text-[12.5px] font-medium text-ink-2 transition hover:border-line hover:text-ink"
          >
            {provider.configured ? 'Change key' : 'Add key'}
          </button>
        )}
      </div>
      {editing && !provider.isOAuth && !provider.isLocal && (
        <div className="mt-2.5 flex gap-2 pl-9">
          <input
            type="password"
            autoFocus
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitKey()
              if (e.key === 'Escape') setEditing(false)
            }}
            placeholder={`Paste ${provider.envVar}`}
            className="mono h-8 flex-1 rounded-lg border border-line-soft bg-pane px-3 text-[13px] text-ink outline-none focus:border-line"
          />
          <button
            type="button"
            disabled={busy || !key.trim()}
            onClick={() => void submitKey()}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[12.5px] font-medium text-pane transition hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </button>
        </div>
      )}
    </div>
  )
}

function NativeSelect({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string
  options: ReadonlyArray<{ value: string; label: string }>
  disabled?: boolean
  onChange: (next: string) => void
}): JSX.Element {
  return (
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 min-w-[140px] cursor-pointer appearance-none rounded-lg border border-line-soft bg-pane pl-3 pr-8 text-[13px] text-ink outline-none transition hover:border-line disabled:cursor-default disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-ink-4" strokeWidth={2} />
    </div>
  )
}

function DefaultModelPicker({
  value,
  models,
  saving,
  onPick,
}: {
  value: string
  models: readonly { name: string; provider: string; model: string }[]
  saving: boolean
  onPick: (next: string) => void
}): JSX.Element {
  const options = [
    { value: '', label: 'Not set' },
    ...models.map((m) => {
      const raw = compactModelLabel(m.name, m.model) || m.name
      const clean = stripProviderPrefix(raw, m.provider)
      return { value: m.name, label: `${providerBrandLabel(m.provider)} · ${clean}` }
    }),
  ]
  return <NativeSelect value={value} options={options} disabled={saving} onChange={onPick} />
}
