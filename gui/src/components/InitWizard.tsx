/**
 * First-run init wizard, shown when the subprocess reports `needs_init` (no
 * providers configured). Drives the init.* RPC surface: pick a provider, add a
 * key or sign in via OAuth, then finish (which boots the real session).
 *
 * Stage 4 expands this into the full credential experience (managed candidate
 * import, local discovery, search API keys, model/thinking selection). For now
 * it covers the common path plus an escape hatch to edit settings.json.
 */

import { useEffect, useState } from 'react'
import { KeyRound, LogIn, Server, Settings, Loader2 } from 'lucide-react'
import { cn } from '@/lib/cn.js'
import { api } from '@/lib/api.js'
import { useSessionStore } from '@/state/sessionStore.js'
import type { ProviderPresetInfo, ModelPickerNode, SessionTab } from '@shared/rpc.js'

export function InitWizard({ tab }: { tab: SessionTab }): JSX.Element {
  const request = useSessionStore((s) => s.request)
  const [providers, setProviders] = useState<ProviderPresetInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({})

  const load = (): void => {
    request<ProviderPresetInfo[]>(tab.tabId, 'init.listProviders')
      .then((list) => setProviders(Array.isArray(list) ? list : []))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(load, [tab.tabId, request])

  /** Choose a sane default model on the just-configured provider and boot. */
  const finish = async (): Promise<void> => {
    const tree = await request<ModelPickerNode[]>(tab.tabId, 'init.buildModelPickerTree', {})
    const firstValue = findFirstModelValue(tree ?? [])
    if (!firstValue) throw new Error('No models available for the configured provider.')
    const modelSelection = await request<unknown>(tab.tabId, 'init.resolveModelSelection', { target: firstValue })
    await request(tab.tabId, 'init.finish', { modelSelection })
    // The server re-runs and emits `ready`; the store flips the tab into chat.
  }

  const configureKey = async (provider: ProviderPresetInfo): Promise<void> => {
    const apiKey = (keyInputs[provider.id] ?? '').trim()
    if (!apiKey) return
    setBusy(provider.id)
    setError(null)
    try {
      const method = provider.isManaged ? 'init.configureManagedProvider' : 'init.configureApiKeyProvider'
      await request(tab.tabId, method, { providerId: provider.id, apiKey })
      await finish()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  const signIn = async (provider: ProviderPresetInfo): Promise<void> => {
    setBusy(provider.id)
    setError(null)
    try {
      await request(tab.tabId, 'init.startOAuthFlow', { providerId: provider.id })
      await finish()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(null)
    }
  }

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-xl">
        <h1 className="text-[22px] font-semibold text-ink">Set up Fermi</h1>
        <p className="mt-1.5 text-[14px] leading-[1.5] text-ink-3">
          Fermi needs at least one model provider. Add a key or sign in to get started.
        </p>

        {error && (
          <div className="mt-4 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-[13px] text-error">
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2">
          {providers === null ? (
            <div className="flex items-center gap-2 text-[14px] text-ink-3">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading providers…
            </div>
          ) : (
            providers.map((p) => (
              <div key={p.id} className="rounded-xl border border-line-soft bg-pane-2 p-3.5">
                <div className="flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-line-soft text-ink-3">
                    {p.isOAuth ? <LogIn className="h-4 w-4" /> : p.isLocal ? <Server className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
                  </span>
                  <span className="text-[14.5px] font-medium text-ink">{p.name}</span>
                  {p.configured && <span className="text-[12px] text-success">configured</span>}
                  <span className="mono ml-auto text-[11.5px] text-ink-4">{p.envVar}</span>
                </div>

                {p.isOAuth ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void signIn(p)}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-1.5 text-[13.5px] font-medium text-pane transition hover:opacity-90 disabled:opacity-50"
                  >
                    {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogIn className="h-3.5 w-3.5" />}
                    Sign in
                  </button>
                ) : p.isLocal ? (
                  <p className="mt-2 text-[12.5px] text-ink-4">
                    Local providers are configured from settings.json for now — use “Edit settings.json” below.
                  </p>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <input
                      type="password"
                      value={keyInputs[p.id] ?? ''}
                      onChange={(e) => setKeyInputs((s) => ({ ...s, [p.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void configureKey(p)
                      }}
                      placeholder={`Paste ${p.envVar}`}
                      className="mono h-9 flex-1 rounded-lg border border-line-soft bg-pane px-3 text-[13px] text-ink outline-none focus:border-line"
                    />
                    <button
                      type="button"
                      disabled={busy !== null || !(keyInputs[p.id] ?? '').trim()}
                      onClick={() => void configureKey(p)}
                      className="inline-flex items-center gap-2 rounded-lg bg-ink px-3 py-1.5 text-[13.5px] font-medium text-pane transition hover:opacity-90 disabled:opacity-40"
                    >
                      {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      Save
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => void api.settings.openFile()}
          className={cn(
            'mt-5 inline-flex items-center gap-2 rounded-lg border border-line-soft px-3 py-1.5',
            'text-[13px] text-ink-3 transition hover:border-line hover:text-ink',
          )}
        >
          <Settings className="h-3.5 w-3.5" />
          Edit settings.json
        </button>
      </div>
    </div>
  )
}

function findFirstModelValue(nodes: readonly ModelPickerNode[]): string | null {
  for (const node of nodes) {
    if (node.value) return node.value
    if (node.children) {
      const hit = findFirstModelValue(node.children)
      if (hit) return hit
    }
  }
  return null
}
