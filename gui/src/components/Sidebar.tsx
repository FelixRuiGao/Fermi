/**
 * Left rail: search bar + persistent workspace/session tree + settings footer.
 * Follows template: flat surface, project groups with collapse arrows,
 * session dots (spinner for working, accent for notify, gray for idle).
 */

import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  AlertCircle,
  Archive,
  FolderOpen,
  KeyRound,
  Monitor,
  Moon,
  MoreHorizontal,
  Pin,
  Plus,
  PlugZap,
  Puzzle,
  RefreshCw,
  Search,
  Server,
  ScrollText,
  Sun,
  X,
  ChevronDown,
} from 'lucide-react'
import { useSessionStore } from '@/state/sessionStore.js'
import type { ProviderSettingsItem, SessionHistoryItem, SessionTab, SettingsSnapshot } from '@shared/rpc.js'
import { cn } from '@/lib/cn.js'
import { api } from '@/lib/api.js'
import { projectName } from '@/lib/path.js'

const SIDEBAR_GROUP_STATE_KEY = 'fermi:sidebarGroups'
const WORKSPACE_ORDER_KEY = 'fermi:workspaceOrder'
const WORKSPACE_ORDER_VERSION_KEY = 'fermi:workspaceOrderVersion'
const WORKSPACE_ORDER_VERSION = 'created-at-v1'

interface SkillItem {
  readonly name: string
  readonly description: string
  readonly enabled: boolean
}

interface McpStatusPayload {
  readonly configured: boolean
  readonly error: string | null
  readonly toolCount: number
  readonly servers: readonly {
    readonly name: string
    readonly state: string | null
    readonly error: string | null
    readonly tools: readonly string[]
  }[]
}

interface HooksStatusPayload {
  readonly available: boolean
  readonly hooks: readonly {
    readonly name: string
    readonly scope: string
    readonly event: string
    readonly matcher: string | null
    readonly command: string
    readonly failClosed: boolean
  }[]
}

export function Sidebar(): JSX.Element {
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const setActive = useSessionStore((s) => s.setActiveTab)
  const closeTab = useSessionStore((s) => s.closeTab)
  const createDraftTab = useSessionStore((s) => s.createDraftTab)
  const openHistorySession = useSessionStore((s) => s.openHistorySession)
  const archiveHistorySession = useSessionStore((s) => s.archiveHistorySession)
  const setHistorySessionPinned = useSessionStore((s) => s.setHistorySessionPinned)
  const perTab = useSessionStore((s) => s.perTab)
  const history = useSessionStore((s) => s.history)
  const theme = useSessionStore((s) => s.theme)
  const setTheme = useSessionStore((s) => s.setTheme)
  const useSystemTheme = useSessionStore((s) => s.useSystemTheme)
  const autoUpdate = useSessionStore((s) => s.autoUpdate)
  const setAutoUpdate = useSessionStore((s) => s.setAutoUpdate)
  const [creating, setCreating] = useState(false)
  const [query, setQuery] = useState('')
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [runtimeOpen, setRuntimeOpen] = useState(false)
  const [providersOpen, setProvidersOpen] = useState(false)
  const trimmedQuery = query.trim()

  const activeTab = tabs.find((t) => t.tabId === activeTabId)
  const activeRuntimeTab = activeTab && activeTab.status !== 'draft' ? activeTab : null
  useEffect(() => {
    rememberWorkspaceOrder([
      ...history.map((group) => group.workDir),
      ...tabs.map((tab) => tab.workDir),
    ])
  }, [history, tabs])

  const groups = buildWorkspaceGroups({ tabs, history, perTab, activeTabId, query: trimmedQuery })

  const onNewSession = async (workDir?: string): Promise<void> => {
    if (creating) return
    setCreating(true)
    try {
      const dir = workDir ?? await api.workspace.pickDirectory()
      if (!dir) return
      createDraftTab(dir)
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      <aside
        data-sidebar-root
        className="flex w-[256px] shrink-0 flex-col bg-rail"
        style={{ boxShadow: 'inset -1px 0 0 var(--color-line-soft)' }}
      >
      {/* Search + workspace button */}
      <div className="px-2.5 pb-2.5 pt-2">
        <div className="mb-2 flex h-7 items-center gap-2 px-1">
          <div className="flex-1 text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-4">
            Workspaces
          </div>
          <button
            type="button"
            onClick={() => void onNewSession()}
            disabled={creating}
            title="Open workspace"
            aria-label="Open workspace"
            className={cn(
              'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-3 transition',
              'hover:bg-line-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
              creating && 'opacity-50',
            )}
          >
            <FolderOpen className="h-[13px] w-[13px]" strokeWidth={1.8} />
          </button>
        </div>
        <div className="input-focus-shell flex h-9 items-center gap-2 rounded-[10px] border border-line-soft bg-pane-2 px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-ink-4" strokeWidth={2} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search sessions"
            placeholder="Search sessions"
            className="sidebar-search-input flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-3"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery('')}
              title="Clear search"
              aria-label="Clear search"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-ink-4 transition hover:bg-line-soft hover:text-ink"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Project tree */}
      <div className="flex-1 overflow-y-auto pt-1">
        {groups.length === 0 ? (
          <div className="px-4 py-6 text-[14px] text-ink-3">
            {trimmedQuery ? 'No matches' : 'No sessions'}
          </div>
        ) : (
          groups.map(([workDir, items]) => (
            <ProjectGroup
              key={workDir}
              workDir={workDir}
              items={items}
              activeTabId={activeTabId}
              perTab={perTab}
              onSelect={setActive}
              onClose={closeTab}
              onOpenHistory={openHistorySession}
              onArchiveHistory={archiveHistorySession}
              onPinHistory={setHistorySessionPinned}
              onNewSession={onNewSession}
              creating={creating}
            />
          ))
        )}
      </div>

      {/* Settings footer */}
      <div className="border-t border-line-soft px-3 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void onNewSession()}
            disabled={creating}
            title="Open workspace"
            aria-label="Open workspace"
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-ink-3 transition',
              'hover:bg-line-soft hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent',
              creating && 'opacity-50',
            )}
          >
            <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.8} />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium leading-tight text-ink-2">
              Local workspaces
            </div>
            <div className="truncate text-[12.5px] leading-tight text-ink-4">
              User API keys
            </div>
          </div>
          <FooterMenu
            activeTab={activeTab ?? null}
            theme={theme}
            setTheme={setTheme}
            useSystemTheme={useSystemTheme}
            autoUpdate={autoUpdate}
            setAutoUpdate={setAutoUpdate}
            onNewSession={() => void onNewSession()}
            onOpenProviders={() => setProvidersOpen(true)}
            onOpenSkills={() => setSkillsOpen(true)}
            onOpenRuntime={() => setRuntimeOpen(true)}
          />
        </div>
      </div>
      </aside>
      <SkillsSettingsDialog
        open={skillsOpen}
        onOpenChange={setSkillsOpen}
        tab={activeRuntimeTab}
      />
      <ProviderSettingsDialog
        open={providersOpen}
        onOpenChange={setProvidersOpen}
      />
      <RuntimeSettingsDialog
        open={runtimeOpen}
        onOpenChange={setRuntimeOpen}
        tab={activeRuntimeTab}
      />
    </>
  )
}

function FooterMenu({
  activeTab,
  theme,
  setTheme,
  useSystemTheme,
  autoUpdate,
  setAutoUpdate,
  onNewSession,
  onOpenProviders,
  onOpenSkills,
  onOpenRuntime,
}: {
  activeTab: SessionTab | null
  theme: 'dark' | 'light'
  setTheme: (theme: 'dark' | 'light') => void
  useSystemTheme: () => Promise<void>
  autoUpdate: boolean
  setAutoUpdate: (enabled: boolean) => Promise<void>
  onNewSession: () => void
  onOpenProviders: () => void
  onOpenSkills: () => void
  onOpenRuntime: () => void
}): JSX.Element {
  const canInspectRuntime = !!activeTab && activeTab.status !== 'draft'

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="grid h-7 w-7 place-items-center rounded-[9px] text-ink-3 transition hover:bg-line-soft hover:text-ink"
          title="Settings"
          aria-label="Settings"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          side="top"
          sideOffset={8}
          className="z-50 min-w-[210px] rounded-[14px] border border-line bg-pane-2 p-1.5 shadow-2xl"
        >
          <FooterMenuItem icon={Plus} label="New session" onSelect={onNewSession} />
          {activeTab && (
            <FooterMenuItem
              icon={FolderOpen}
              label="Open workspace"
              onSelect={() => void api.workspace.openPath(activeTab.workDir)}
            />
          )}
          <FooterMenuItem
            icon={KeyRound}
            label="Models & keys"
            onSelect={onOpenProviders}
          />
          <FooterMenuItem
            icon={Puzzle}
            label="Skills"
            disabled={!canInspectRuntime}
            onSelect={onOpenSkills}
          />
          <FooterMenuItem
            icon={PlugZap}
            label="Integrations"
            disabled={!canInspectRuntime}
            onSelect={onOpenRuntime}
          />
          <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
          <FooterMenuItem
            icon={theme === 'dark' ? Sun : Moon}
            label={theme === 'dark' ? 'Light theme' : 'Dark theme'}
            onSelect={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          />
          <FooterMenuItem
            icon={Monitor}
            label="Follow system theme"
            onSelect={() => void useSystemTheme()}
          />
          <DropdownMenu.Separator className="my-1 h-px bg-line-soft" />
          <FooterMenuItem
            icon={Monitor}
            label={autoUpdate ? 'Auto-update off' : 'Auto-update on'}
            onSelect={() => void setAutoUpdate(!autoUpdate)}
          />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

function FooterMenuItem({
  icon: Icon,
  label,
  disabled,
  onSelect,
}: {
  icon: React.FC<{ className?: string }>
  label: string
  disabled?: boolean
  onSelect: () => void
}): JSX.Element {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13.5px] text-ink-2 outline-none transition hover:bg-line-soft hover:text-ink focus:bg-line-soft focus:text-ink data-[disabled]:cursor-default data-[disabled]:opacity-45 data-[disabled]:hover:bg-transparent data-[disabled]:hover:text-ink-2"
    >
      <Icon className="h-3.5 w-3.5 text-ink-4" />
      <span>{label}</span>
    </DropdownMenu.Item>
  )
}

function ProviderSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}): JSX.Element {
  const [settings, setSettings] = useState<SettingsSnapshot | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadSettings = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      setSettings(await api.settings.get())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void loadSettings()
  }, [open])

  const providers = settings?.providers ?? []

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[78vh] w-[620px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] border border-line bg-pane-2 shadow-2xl">
          <div className="flex h-14 items-center gap-3 border-b border-line-soft px-4">
            <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-line-soft text-ink">
              <KeyRound className="h-4 w-4" strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-[16px] font-semibold text-ink">
                Models & keys
              </Dialog.Title>
              <Dialog.Description className="truncate text-[12.5px] text-ink-4">
                Read from user settings; key values stay hidden.
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={() => void loadSettings()}
              className="grid h-8 w-8 place-items-center rounded-[9px] text-ink-3 transition hover:bg-line-soft hover:text-ink"
              title="Refresh model settings"
              aria-label="Refresh model settings"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} strokeWidth={1.8} />
            </button>
            <Dialog.Close asChild>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-[9px] text-ink-3 transition hover:bg-line-soft hover:text-ink"
                title="Close"
                aria-label="Close models and keys"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {error && (
              <div className="mb-3 rounded-lg border border-error/25 bg-error/5 px-3 py-2 text-[13.5px] text-error">
                {error}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2">
              <SettingsInfoCell label="Default model" value={settings?.defaultModel ?? 'Not set'} />
              <SettingsInfoCell label="Thinking" value={settings?.thinkingLevel ?? 'Model default'} />
              <SettingsInfoCell label="Permission" value={settings?.permissionMode ?? 'Default'} />
            </div>

            <div className="mt-4">
              <div className="mb-2 flex items-center gap-2 px-0.5">
                <div className="text-[12px] font-semibold uppercase tracking-[0.16em] text-ink-4">
                  Providers
                </div>
                <div className="h-px flex-1 bg-line-soft" />
                <div className="mono text-[11.5px] text-ink-4">{providers.length}</div>
              </div>

              {providers.length === 0 ? (
                <div className="rounded-lg border border-line-soft px-3 py-3 text-[14px] text-ink-3">
                  No providers are configured in settings.json.
                </div>
              ) : (
                <div className="space-y-2">
                  {providers.map((provider) => (
                    <ProviderSettingsRow key={provider.id} provider={provider} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex h-12 items-center justify-between gap-3 border-t border-line-soft px-4">
            <div className="mono min-w-0 flex-1 truncate text-[11.5px] text-ink-4">
              {settings?.settingsPath ?? 'settings.json'}
            </div>
            <button
              type="button"
              disabled={!settings?.settingsPath}
              onClick={() => void api.settings.openFile()}
              className="rounded-[9px] border border-line-soft bg-pane px-3 py-1.5 text-[13px] font-medium text-ink-2 transition hover:border-line hover:text-ink disabled:cursor-default disabled:opacity-45"
            >
              Open settings.json
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function SettingsInfoCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded-lg border border-line-soft bg-pane px-3 py-2">
      <div className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-4">
        {label}
      </div>
      <div className="mt-1 truncate text-[13.5px] text-ink-2">{value}</div>
    </div>
  )
}

function ProviderSettingsRow({ provider }: { provider: ProviderSettingsItem }): JSX.Element {
  const status = providerStatus(provider)
  return (
    <div className="rounded-lg border border-line-soft bg-pane px-3 py-2.5">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-line-soft text-ink-2">
          <Server className="h-3.5 w-3.5" strokeWidth={1.7} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="mono min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">
              {provider.id}
            </div>
            <span className={cn('rounded-md px-1.5 py-0.5 text-[11.5px] font-medium', status.className)}>
              {status.label}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
            <span>{provider.kind}</span>
            {provider.apiKeyEnv && <span className="mono">{provider.apiKeyEnv}</span>}
            {provider.baseUrl && <span className="mono max-w-[230px] truncate">{provider.baseUrl}</span>}
            {provider.model && <span className="mono">{provider.model}</span>}
            {provider.contextLength && <span className="mono">{formatContext(provider.contextLength)}</span>}
            {provider.hasInlineKey && <span>inline key set</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function providerStatus(provider: ProviderSettingsItem): { label: string; className: string } {
  if (provider.kind === 'invalid') return { label: 'invalid', className: 'bg-error/10 text-error' }
  if (provider.kind === 'local') return { label: 'local', className: 'bg-info/10 text-info' }
  if (provider.hasEnvValue) return { label: 'key found', className: 'bg-success/10 text-success' }
  return { label: 'env missing', className: 'bg-warning/10 text-warning' }
}

function formatContext(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`
  return String(value)
}

function SkillsSettingsDialog({
  open,
  onOpenChange,
  tab,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: SessionTab | null
}): JSX.Element {
  const [skills, setSkills] = useState<readonly SkillItem[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadSkills = async (): Promise<void> => {
    if (!tab) {
      setSkills([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await api.rpc.request<readonly SkillItem[]>(tab.tabId, 'session.listSkills')
      setSkills([...result].sort((a, b) => a.name.localeCompare(b.name)))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void loadSkills()
  }, [open, tab?.tabId])

  const setSkillEnabled = async (skill: SkillItem, enabled: boolean): Promise<void> => {
    if (!tab || saving) return
    setSaving(skill.name)
    setError(null)
    setSkills((items) => items.map((item) => (
      item.name === skill.name ? { ...item, enabled } : item
    )))
    try {
      await api.rpc.request(tab.tabId, 'session.setSkillEnabled', {
        name: skill.name,
        enabled,
      })
    } catch (err) {
      setSkills((items) => items.map((item) => (
        item.name === skill.name ? skill : item
      )))
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(null)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[78vh] w-[560px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] border border-line bg-pane-2 shadow-2xl">
          <div className="flex h-14 items-center gap-3 border-b border-line-soft px-4">
            <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-line-soft text-ink">
              <Puzzle className="h-4 w-4" strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-[16px] font-semibold text-ink">
                Skills
              </Dialog.Title>
              <Dialog.Description className="truncate text-[12.5px] text-ink-4">
                {tab ? projectName(tab.workDir) : 'No active session'}
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={() => void loadSkills()}
              disabled={!tab || loading}
              className="grid h-8 w-8 place-items-center rounded-[10px] text-ink-3 transition hover:bg-line-soft hover:text-ink disabled:opacity-45"
              title="Reload skills"
              aria-label="Reload skills"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} strokeWidth={1.8} />
            </button>
            <Dialog.Close asChild>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-[10px] text-ink-3 transition hover:bg-line-soft hover:text-ink"
                title="Close"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {!tab ? (
              <div className="px-3 py-8 text-center text-[14px] text-ink-4">
                Select a session
              </div>
            ) : loading && skills.length === 0 ? (
              <div className="px-3 py-8 text-center text-[14px] text-ink-4">
                Loading skills
              </div>
            ) : skills.length === 0 ? (
              <div className="px-3 py-8 text-center text-[14px] text-ink-4">
                No skills installed
              </div>
            ) : (
              skills.map((skill) => (
                <button
                  type="button"
                  key={skill.name}
                  onClick={() => void setSkillEnabled(skill, !skill.enabled)}
                  disabled={saving !== null}
                  className="group flex w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left text-ink-2 transition hover:bg-line-soft hover:text-ink disabled:cursor-default disabled:opacity-70"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full border p-0.5 transition',
                      skill.enabled
                        ? 'justify-end border-success/40 bg-success/15'
                        : 'justify-start border-line bg-pane',
                    )}
                    aria-hidden
                  >
                    <span
                      className={cn(
                        'block h-3.5 w-3.5 rounded-full transition',
                        skill.enabled ? 'bg-success' : 'bg-ink-4',
                      )}
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-ink">
                      {skill.name}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-[1.35] text-ink-3">
                      {skill.description || 'No description'}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>

          {error && (
            <div className="border-t border-line-soft px-4 py-2 text-[12.5px] text-error">
              {error}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function RuntimeSettingsDialog({
  open,
  onOpenChange,
  tab,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tab: SessionTab | null
}): JSX.Element {
  const [mcpStatus, setMcpStatus] = useState<McpStatusPayload | null>(null)
  const [hooksStatus, setHooksStatus] = useState<HooksStatusPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadRuntime = async (): Promise<void> => {
    if (!tab) {
      setMcpStatus(null)
      setHooksStatus(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const [mcp, hooks] = await Promise.all([
        api.rpc.request<McpStatusPayload>(tab.tabId, 'session.getMcpStatus'),
        api.rpc.request<HooksStatusPayload>(tab.tabId, 'session.getHooksStatus'),
      ])
      setMcpStatus(mcp)
      setHooksStatus(hooks)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void loadRuntime()
  }, [open, tab?.tabId])

  const serverCount = mcpStatus?.servers.length ?? 0
  const hookCount = hooksStatus?.hooks.length ?? 0

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/35 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[82vh] w-[720px] max-w-[94vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[16px] border border-line bg-pane-2 shadow-2xl">
          <div className="flex h-14 items-center gap-3 border-b border-line-soft px-4">
            <div className="grid h-8 w-8 place-items-center rounded-[10px] bg-line-soft text-ink">
              <PlugZap className="h-4 w-4" strokeWidth={1.8} />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="truncate text-[16px] font-semibold text-ink">
                Integrations
              </Dialog.Title>
              <Dialog.Description className="truncate text-[12.5px] text-ink-4">
                {tab ? projectName(tab.workDir) : 'No active session'}
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={() => void loadRuntime()}
              disabled={!tab || loading}
              className="grid h-8 w-8 place-items-center rounded-[10px] text-ink-3 transition hover:bg-line-soft hover:text-ink disabled:opacity-45"
              title="Reload runtime status"
              aria-label="Reload runtime status"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} strokeWidth={1.8} />
            </button>
            <Dialog.Close asChild>
              <button
                type="button"
                className="grid h-8 w-8 place-items-center rounded-[10px] text-ink-3 transition hover:bg-line-soft hover:text-ink"
                title="Close"
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" strokeWidth={1.8} />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {!tab ? (
              <div className="px-3 py-10 text-center text-[14px] text-ink-4">
                Select a session
              </div>
            ) : loading && !mcpStatus && !hooksStatus ? (
              <div className="px-3 py-10 text-center text-[14px] text-ink-4">
                Loading runtime status
              </div>
            ) : (
              <div className="space-y-3">
                <section className="rounded-[14px] border border-line-soft bg-pane px-3 py-3">
                  <div className="mb-3 flex items-center gap-2">
                    <Server className="h-4 w-4 text-ink-4" strokeWidth={1.8} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-ink">MCP servers</div>
                      <div className="text-[12.5px] text-ink-4">
                        {mcpStatus
                          ? `${serverCount} server${serverCount === 1 ? '' : 's'} · ${mcpStatus.toolCount} tool${mcpStatus.toolCount === 1 ? '' : 's'}`
                          : 'Status unavailable'}
                      </div>
                    </div>
                    {mcpStatus?.configured && (
                      <span className="rounded-md border border-line-soft px-2 py-1 text-[12px] text-ink-3">
                        Configured
                      </span>
                    )}
                  </div>

                  {mcpStatus?.error ? (
                    <RuntimeNotice tone="error" text={mcpStatus.error} />
                  ) : !mcpStatus?.configured ? (
                    <RuntimeNotice text="No MCP servers configured" />
                  ) : serverCount === 0 ? (
                    <RuntimeNotice text="No MCP server status reported" />
                  ) : (
                    <div className="space-y-2">
                      {mcpStatus.servers.map((server) => (
                        <div
                          key={server.name}
                          className="rounded-[12px] border border-line-soft bg-pane-2 px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                              {server.name}
                            </span>
                            <RuntimeBadge
                              label={server.state ?? 'unknown'}
                              tone={server.error ? 'error' : runtimeStateTone(server.state)}
                            />
                          </div>
                          {server.error ? (
                            <div className="mt-2 text-[12.5px] leading-[1.35] text-error">
                              {server.error}
                            </div>
                          ) : server.tools.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {server.tools.slice(0, 16).map((tool) => (
                                <span
                                  key={tool}
                                  className="rounded-md bg-line-soft px-1.5 py-0.5 text-[12px] text-ink-3"
                                >
                                  {tool}
                                </span>
                              ))}
                              {server.tools.length > 16 && (
                                <span className="rounded-md bg-line-soft px-1.5 py-0.5 text-[12px] text-ink-4">
                                  +{server.tools.length - 16}
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="mt-2 text-[12.5px] text-ink-4">
                              No tools registered
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </section>

                <section className="rounded-[14px] border border-line-soft bg-pane px-3 py-3">
                  <div className="mb-3 flex items-center gap-2">
                    <ScrollText className="h-4 w-4 text-ink-4" strokeWidth={1.8} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-ink">Hooks</div>
                      <div className="text-[12.5px] text-ink-4">
                        {hooksStatus
                          ? `${hookCount} hook${hookCount === 1 ? '' : 's'} registered`
                          : 'Status unavailable'}
                      </div>
                    </div>
                    {hooksStatus?.available && (
                      <span className="rounded-md border border-line-soft px-2 py-1 text-[12px] text-ink-3">
                        Available
                      </span>
                    )}
                  </div>

                  {!hooksStatus?.available ? (
                    <RuntimeNotice text="Hooks are not available in this runtime" />
                  ) : hookCount === 0 ? (
                    <RuntimeNotice text="No hooks registered" />
                  ) : (
                    <div className="space-y-2">
                      {hooksStatus.hooks.map((hook, index) => (
                        <div
                          key={`${hook.scope}:${hook.event}:${hook.name}:${index}`}
                          className="rounded-[12px] border border-line-soft bg-pane-2 px-3 py-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                              {hook.name}
                            </span>
                            <RuntimeBadge label={hook.event} tone="neutral" />
                            {hook.failClosed && <RuntimeBadge label="fail closed" tone="warning" />}
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-ink-4">
                            <span>{hook.scope}</span>
                            {hook.matcher && <span>{hook.matcher}</span>}
                          </div>
                          <div className="mt-2 truncate rounded-md bg-line-soft px-2 py-1 text-[12px] text-ink-3">
                            {hook.command}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 border-t border-line-soft px-4 py-2 text-[12.5px] text-error">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.8} />
              <span>{error}</span>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function RuntimeNotice({
  text,
  tone = 'muted',
}: {
  text: string
  tone?: 'muted' | 'error'
}): JSX.Element {
  return (
    <div
      className={cn(
        'rounded-[12px] border px-3 py-3 text-[13.5px]',
        tone === 'error'
          ? 'border-error/25 bg-error/5 text-error'
          : 'border-line-soft bg-pane-2 text-ink-4',
      )}
    >
      {text}
    </div>
  )
}

function RuntimeBadge({
  label,
  tone,
}: {
  label: string
  tone: 'success' | 'warning' | 'error' | 'neutral'
}): JSX.Element {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md border px-1.5 py-0.5 text-[12px]',
        tone === 'success' && 'border-success/30 bg-success/10 text-success',
        tone === 'warning' && 'border-warning/30 bg-warning/10 text-warning',
        tone === 'error' && 'border-error/30 bg-error/10 text-error',
        tone === 'neutral' && 'border-line-soft bg-line-soft text-ink-3',
      )}
    >
      {label}
    </span>
  )
}

function runtimeStateTone(state: string | null): 'success' | 'warning' | 'error' | 'neutral' {
  const normalized = state?.toLowerCase() ?? ''
  if (['ready', 'connected', 'running'].includes(normalized)) return 'success'
  if (['connecting', 'starting', 'loading'].includes(normalized)) return 'warning'
  if (['error', 'failed', 'disconnected'].includes(normalized)) return 'error'
  return 'neutral'
}

function ProjectGroup({
  workDir,
  items,
  activeTabId,
  perTab,
  onSelect,
  onClose,
  onOpenHistory,
  onArchiveHistory,
  onPinHistory,
  onNewSession,
  creating,
}: {
  workDir: string
  items: SidebarSessionItem[]
  activeTabId: string | null
  perTab: ReturnType<typeof useSessionStore.getState>['perTab']
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onOpenHistory: (workDir: string, sessionId: string) => Promise<SessionTab | null>
  onArchiveHistory: (workDir: string, sessionId: string) => Promise<void>
  onPinHistory: (workDir: string, sessionId: string, pinned: boolean) => Promise<void>
  onNewSession: (workDir?: string) => Promise<void>
  creating: boolean
}): JSX.Element {
  const [expanded, setExpanded] = useState(() => readSidebarGroupExpanded(workDir))
  const [showAll, setShowAll] = useState(false)
  const name = projectName(workDir)
  const visibleItems = showAll ? items : items.slice(0, 5)

  useEffect(() => {
    storeSidebarGroupExpanded(workDir, expanded)
  }, [expanded, workDir])

  return (
    <div className="group/workspace mb-1">
      <div className="flex h-7 items-center gap-1.5 px-3.5 text-ink-3">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name} sessions`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left transition hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ChevronDown
            className={cn('h-3 w-3 shrink-0 opacity-80 transition-transform', !expanded && '-rotate-90')}
            strokeWidth={2}
          />
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-ink-2">
            {name}
          </span>
        </button>
        <button
          type="button"
          disabled={creating}
          onClick={() => void onNewSession(workDir)}
          title={`New session in ${name}`}
          aria-label={`New session in ${name}`}
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-3 opacity-0 transition',
            'hover:bg-line-soft hover:text-ink focus-visible:opacity-100 group-hover/workspace:opacity-100',
            creating && 'opacity-40',
          )}
        >
          <Plus className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col">
          {visibleItems.map((item) => {
            const tab = item.kind === 'tab' ? item.tab : null
            const active = tab?.tabId === activeTabId
            const state = tab ? perTab[tab.tabId] : undefined
            const status = state?.status
            const isWorking = status?.currentTurnRunning ?? false
            const hasAsk = !!state?.pendingAsk
            const label = sessionLabel(item)
            const sessionId = item.kind === 'tab'
              ? item.tab.sessionId ?? perTab[item.tab.tabId]?.meta?.sessionId ?? null
              : item.session.sessionId
            const pinned = isPinnedSessionItem(item)
            const canPin = !!sessionId && (item.kind === 'history' || item.tab.status !== 'draft')

            return (
              <div
                key={item.key}
                className="group relative mx-2 my-px h-9"
              >
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  aria-label={`${active ? 'Current session' : 'Switch to session'} ${label}`}
                  onClick={() => {
                    if (item.kind === 'tab') {
                      onSelect(item.tab.tabId)
                    } else {
                      void onOpenHistory(item.workDir, item.session.sessionId)
                    }
                  }}
                  className={cn(
                    'flex h-9 w-full cursor-pointer items-center rounded-[10px] pl-7 pr-[42px] text-left',
                    active ? 'bg-pane-2 text-ink' : 'text-ink-2 hover:bg-line-soft',
                  )}
                >
                  {/* Status dot */}
                  <span className="absolute left-3 top-1/2 -translate-y-1/2">
                    {isWorking ? (
                      <span className="working-spinner" />
                    ) : hasAsk ? (
                      <span className="block h-1.5 w-1.5 rounded-full bg-accent" />
                    ) : (
                      <span
                        className={cn(
                          'block h-1.5 w-1.5 rounded-full',
                          active ? 'bg-ink-3' : 'bg-ink-4',
                        )}
                      />
                    )}
                  </span>

                  <span
                    className={cn(
                      'flex-1 truncate text-[14.5px] leading-tight',
                      active ? 'font-medium' : 'font-normal',
                    )}
                  >
                    {label}
                  </span>
                </button>

                <span
                  className={cn(
                    'pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] tabular-nums text-ink-4 transition-opacity group-hover:opacity-0',
                    active && 'opacity-0',
                  )}
                >
                  {timeAgo(item.lastActiveAt)}
                </span>

                {canPin && sessionId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void onPinHistory(item.workDir, sessionId, !pinned)
                    }}
                    className={cn(
                      'invisible absolute left-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-pane-2 text-ink-3 transition',
                      'hover:bg-line hover:text-ink group-hover:visible',
                      pinned && 'text-accent',
                    )}
                    aria-label={`${pinned ? 'Unpin' : 'Pin'} ${label}`}
                    title={pinned ? 'Unpin session' : 'Pin session'}
                  >
                    <Pin className="h-3 w-3" strokeWidth={1.9} />
                  </button>
                )}
                {tab ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void onClose(tab.tabId)
                    }}
                    className={cn(
                      'invisible absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-pane-2 text-ink-3 transition',
                      'hover:bg-line hover:text-ink group-hover:visible',
                      active && 'visible',
                    )}
                    aria-label={`Close ${label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : item.kind === 'history' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      void onArchiveHistory(item.workDir, item.session.sessionId)
                    }}
                    className="invisible absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg bg-pane-2 text-ink-3 transition hover:bg-line hover:text-ink group-hover:visible"
                    aria-label={`Archive ${label}`}
                    title="Archive session"
                  >
                    <Archive className="h-3 w-3" strokeWidth={1.8} />
                  </button>
                ) : null}
              </div>
            )
          })}
          {items.length > 5 && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="mx-2 mt-1 flex h-8 items-center rounded-[9px] pl-7 pr-3 text-left text-[13.5px] text-ink-3 transition hover:bg-line-soft hover:text-ink"
            >
              {showAll ? 'Show fewer sessions' : `Show all ${items.length} sessions`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

type SidebarSessionItem = SidebarTabItem | SidebarHistoryItem

interface SidebarTabItem {
  readonly key: string
  readonly kind: 'tab'
  readonly workDir: string
  readonly tab: SessionTab
  readonly historyTitle?: string
  readonly historySummary?: string
  readonly historyPinned?: boolean
  readonly lastActiveAt: number
}

interface SidebarHistoryItem {
  readonly key: string
  readonly kind: 'history'
  readonly workDir: string
  readonly session: SessionHistoryItem
  readonly lastActiveAt: number
}

function sessionLabel(item: SidebarSessionItem): string {
  const raw = item.kind === 'tab' && item.tab.status === 'draft'
    ? 'New session'
    : item.kind === 'tab'
    ? item.historyTitle || item.tab?.title || item.tab?.displayName || 'New session'
    : item.session?.title || item.session?.summary || shortSessionId(item.session?.sessionId ?? '') || 'New session'
  return raw.length > 42 ? `${raw.slice(0, 39)}…` : raw
}

function isPinnedSessionItem(item: SidebarSessionItem): boolean {
  return item.kind === 'tab' ? item.historyPinned === true : item.session.pinned
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000)
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function buildWorkspaceGroups({
  tabs,
  history,
  perTab,
  activeTabId,
  query,
}: {
  tabs: readonly SessionTab[]
  history: ReturnType<typeof useSessionStore.getState>['history']
  perTab: ReturnType<typeof useSessionStore.getState>['perTab']
  activeTabId: string | null
  query: string
}): Array<[string, SidebarSessionItem[]]> {
  const map = new Map<string, SidebarSessionItem[]>()
  const historyBySessionId = new Map<string, SessionHistoryItem>()
  const openSessionIds = new Set<string>()
  const lowerQuery = query.toLowerCase()

  for (const group of history) {
    if (!map.has(group.workDir)) map.set(group.workDir, [])
    for (const session of group.sessions) {
      historyBySessionId.set(session.sessionId, session)
    }
  }

  for (const tab of tabs) {
    if (!map.has(tab.workDir)) map.set(tab.workDir, [])

    const sessionId = tab.sessionId ?? perTab[tab.tabId]?.meta?.sessionId ?? null
    if (sessionId) openSessionIds.add(sessionId)
    const linkedHistory = sessionId ? historyBySessionId.get(sessionId) : undefined
    const item: SidebarSessionItem = {
      key: `tab:${tab.tabId}`,
      kind: 'tab',
      workDir: tab.workDir,
      tab,
      historyTitle: linkedHistory?.title,
      historySummary: linkedHistory?.summary,
      historyPinned: linkedHistory?.pinned,
      lastActiveAt: Math.max(tab.lastActiveAt ?? tab.createdAt, parseHistoryTime(linkedHistory?.lastActiveAt)),
    }
    if (matchesSessionItem(item, lowerQuery)) {
      map.get(tab.workDir)?.push(item)
    }
  }

  for (const group of history) {
    const arr = map.get(group.workDir) ?? []
    for (const session of group.sessions) {
      if (openSessionIds.has(session.sessionId)) continue
      const item: SidebarSessionItem = {
        key: `history:${session.sessionId}`,
        kind: 'history',
        workDir: group.workDir,
        session,
        lastActiveAt: parseHistoryTime(session.lastActiveAt) || parseHistoryTime(session.created),
      }
      if (matchesSessionItem(item, lowerQuery)) arr.push(item)
    }
    map.set(group.workDir, arr)
  }

  const groups = [...map.entries()]
    .map(([k, v]) => [k, [...v].sort(compareSidebarSessionItems)] as [string, SidebarSessionItem[]])
    .filter(([workDir, items]) => items.length > 0 || tabs.some((tab) => tab.workDir === workDir && tab.tabId === activeTabId))

  return sortWorkspaceGroups(groups)
}

function compareSidebarSessionItems(a: SidebarSessionItem, b: SidebarSessionItem): number {
  const ap = isPinnedSessionItem(a)
  const bp = isPinnedSessionItem(b)
  if (ap !== bp) return ap ? -1 : 1
  return b.lastActiveAt - a.lastActiveAt
}

function matchesSessionItem(item: SidebarSessionItem, query: string): boolean {
  if (!query) return true
  const hay = item.kind === 'tab'
    ? [
        item.tab?.title,
        item.tab?.displayName,
        item.tab?.workDir,
        item.historyTitle,
        item.historySummary,
        item.tab?.sessionId,
      ]
    : [
        item.session?.title,
        item.session?.summary,
        item.session?.sessionId,
        item.workDir,
      ]
  return hay
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase()
    .includes(query)
}

function parseHistoryTime(value: string | undefined): number {
  if (!value) return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function shortSessionId(sessionId: string): string {
  return sessionId ? sessionId.slice(0, 8) : ''
}

function sortWorkspaceGroups(groups: Array<[string, SidebarSessionItem[]]>): Array<[string, SidebarSessionItem[]]> {
  const order = readWorkspaceOrder()
  return [...groups].sort(([a], [b]) => {
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function rememberWorkspaceOrder(workDirs: readonly string[]): void {
  try {
    const storedVersion = window.localStorage.getItem(WORKSPACE_ORDER_VERSION_KEY)
    const order = storedVersion === WORKSPACE_ORDER_VERSION ? readWorkspaceOrder() : []
    let changed = false
    for (const workDir of workDirs) {
      if (order.includes(workDir)) continue
      order.push(workDir)
      changed = true
    }
    if (changed) {
      window.localStorage.setItem(WORKSPACE_ORDER_KEY, JSON.stringify(order))
    }
    if (storedVersion !== WORKSPACE_ORDER_VERSION) {
      window.localStorage.setItem(WORKSPACE_ORDER_VERSION_KEY, WORKSPACE_ORDER_VERSION)
    }
  } catch {
    /* localStorage can be unavailable in hardened contexts. */
  }
}

function readWorkspaceOrder(): string[] {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_ORDER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function readSidebarGroupExpanded(workDir: string): boolean {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_GROUP_STATE_KEY)
    if (!raw) return true
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return true
    const value = (parsed as Record<string, unknown>)[workDir]
    return typeof value === 'boolean' ? value : true
  } catch {
    return true
  }
}

function storeSidebarGroupExpanded(workDir: string, expanded: boolean): void {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_GROUP_STATE_KEY)
    const parsed = raw ? JSON.parse(raw) as unknown : {}
    const next = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : {}
    next[workDir] = expanded
    window.localStorage.setItem(SIDEBAR_GROUP_STATE_KEY, JSON.stringify(next))
  } catch {
    /* localStorage can be unavailable in hardened contexts. */
  }
}
