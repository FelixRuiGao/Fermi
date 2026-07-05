/**
 * Slash-command registry + interactive picker flows for the GUI composer.
 *
 * Every command that needs a choice opens a picker/input INSIDE the command
 * panel — no typed sub-arguments. Ported from the VSCode webview's commands.tsx
 * and adapted to the GUI's multi-tab store: each command runs against a
 * `CommandCtx` bound to the active tab. Info output renders as a `text` panel
 * view (the GUI has no separate transcript info-card stream).
 */

import { findCatalogNode, modelLeafDescription } from '@/lib/transcriptModel.js'
import type {
  ConversationEntry,
  ModelCatalogNode,
  ModelDescriptor,
  SessionMeta,
  SessionStatus,
  SkillInfo,
  SessionListItem,
  RewindTarget,
  SummarizeTarget,
  ShellSnapshot,
  McpStatusPayload,
  HooksStatusPayload,
  ThinkingLevelsPayload,
  SharedSettingsPayload,
} from '@shared/rpc.js'

// ── Panel view model ──

export interface PickerItem {
  label: string
  description?: string
  detail?: string
  value: string
  active?: boolean
  checked?: boolean
  disabled?: boolean
}

type FlowResult = void | PanelView | Promise<void | PanelView>

export interface PickerSpec {
  title: string
  items: PickerItem[]
  emptyText?: string
  checkbox?: boolean
  onSelect?: (value: string) => FlowResult
  onCommit?: (checkedValues: string[]) => FlowResult
}

export interface InputSpec {
  title: string
  placeholder?: string
  initial?: string
  allowEmpty?: boolean
  onSubmit: (text: string) => FlowResult
}

export interface TextSpec {
  title: string
  body: string
  mono?: boolean
}

export type PanelView =
  | { kind: 'picker'; spec: PickerSpec }
  | { kind: 'input'; spec: InputSpec }
  | { kind: 'text'; spec: TextSpec }

export interface SlashCommand {
  name: string
  description: string
  group: 'Session' | 'Context' | 'Config' | 'Info' | 'Skills'
  run: () => FlowResult
}

export const COMMAND_GROUPS: ReadonlyArray<SlashCommand['group']> = [
  'Session',
  'Context',
  'Config',
  'Skills',
  'Info',
]

const picker = (spec: PickerSpec): PanelView => ({ kind: 'picker', spec })
const input = (spec: InputSpec): PanelView => ({ kind: 'input', spec })
const text = (spec: TextSpec): PanelView => ({ kind: 'text', spec })

// ── Command context (bound to the active tab) ──

export interface CommandCtx {
  workDir: string
  request: <T = unknown>(method: string, params?: unknown) => Promise<T>
  hasCapability: (name: string) => boolean
  submitTurn: (input: string) => Promise<void>
  newDraft: () => void
  refreshMode: () => Promise<void>
  refreshGoal: () => Promise<void>
  refreshSkills: () => Promise<void>
  restoreSession: (sessionId: string) => Promise<void>
  gitBranches: () => Promise<string[]>
  gitCommits: () => Promise<Array<{ sha: string; subject: string }>>
  conversation: readonly ConversationEntry[]
  skills: readonly SkillInfo[]
  models: readonly ModelDescriptor[]
  modelCatalog: readonly ModelCatalogNode[]
  status: SessionStatus | null
  meta: SessionMeta | null
  goal: string | null
  agentMode: string
}

// ── Helpers ──

function truncate(s: string, max: number): string {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > max ? one.slice(0, max - 1) + '…' : one
}

function relativeTime(iso?: string | number): string {
  if (iso === undefined) return ''
  const then = typeof iso === 'number' ? iso : new Date(iso).getTime()
  const mins = Math.floor((Date.now() - then) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

const MODE_DESCRIPTIONS: Record<string, string> = {
  default: 'Balanced everyday collaboration',
  vibe: 'You steer by outcomes; the agent owns the implementation',
  scale: 'Large multi-part work: design first, delegate reading, checkpoint discipline',
  auto: 'Long-running self-directed loops: ledger, verify-then-advance, keep going',
}
const AGENT_MODES = ['default', 'vibe', 'scale', 'auto']

const PERMISSION_MODES = [
  { mode: 'reversible', label: 'Approve edits', desc: 'Ask before file changes' },
  { mode: 'yolo', label: 'Full access', desc: 'No approval needed' },
  { mode: 'read_only', label: 'Read only', desc: 'No file modifications' },
]

// ── /review helpers ──

function buildReviewTarget(kind: string, detail?: string): string {
  switch (kind) {
    case 'uncommitted':
      return [
        'Review all uncommitted changes in the current repository.',
        'Run `git diff` for unstaged changes, `git diff --cached` for staged changes,',
        'and `git status --short` to identify untracked files. Read their contents.',
      ].join('\n')
    case 'base': {
      const branch = detail || 'main'
      return [
        `Review all changes on the current branch compared to \`${branch}\`.`,
        `Run \`git diff ${branch}...HEAD\` to get the diff.`,
        `Also check \`git log --oneline ${branch}..HEAD\` for commit context.`,
      ].join('\n')
    }
    case 'commit': {
      const sha = detail || 'HEAD'
      return [`Review the specific commit \`${sha}\`.`, `Run \`git show ${sha}\` to get the diff and commit message.`].join('\n')
    }
    default:
      return 'Review the changes described in the user instructions below.'
  }
}

function buildReviewPrompt(target: string, notes: string): string {
  return [
    'You are performing a focused code review.',
    '',
    target,
    '',
    'Report correctness bugs first (with concrete failure scenarios and file:line),',
    'then reuse / simplification / efficiency cleanups. Be concrete and specific.',
    notes ? `\nAdditional instructions: ${notes}` : '',
  ].join('\n')
}

function reviewDisplayText(kind: string, detail: string, note: string): string {
  const parts = ['/review']
  if (kind === 'uncommitted') parts.push('uncommitted changes')
  else if (kind === 'base') parts.push(`against ${detail || 'base'}`)
  else if (kind === 'commit') parts.push(`commit ${detail || 'HEAD'}`)
  if (note) parts.push(note)
  return parts.join(' ')
}

async function dispatchReview(ctx: CommandCtx, kind: string, detail: string, note: string): Promise<void> {
  const content = buildReviewPrompt(buildReviewTarget(kind, detail), note)
  const displayText = reviewDisplayText(kind, detail, note)
  if (ctx.hasCapability('injectedTurn')) {
    await ctx.request('session.runInjectedTurn', { displayText, content })
  } else {
    await ctx.submitTurn(content)
  }
}

// ── Model catalog picker ──

async function selectModelThenThinking(ctx: CommandCtx, name: string): Promise<PanelView | void> {
  try {
    await ctx.request('session.selectModel', { name })
  } catch (err) {
    return text({ title: 'Model', body: err instanceof Error ? err.message : String(err) })
  }
  if (!ctx.hasCapability('thinkingLevel')) return
  const t = await ctx.request<ThinkingLevelsPayload>('session.getThinkingLevels')
  if (!t || t.levels.length <= 1) return
  return picker({
    title: 'Thinking level',
    items: t.levels.map((level) => ({ label: level, value: level, active: level === t.current })),
    onSelect: async (level) => {
      await ctx.request('session.setThinkingLevel', { level })
    },
  })
}

function modelCatalogPicker(ctx: CommandCtx, nodes: ModelCatalogNode[], title: string): PanelView {
  return picker({
    title,
    emptyText: 'No models available',
    items: nodes.map((node) => {
      const isBranch = Boolean(node.children && node.children.length > 0)
      if (isBranch) {
        return {
          label: node.label,
          description: node.brandLabel && node.brandLabel !== node.label ? node.brandLabel : undefined,
          detail: `${node.children!.length} ›`,
          value: node.value,
        }
      }
      return { label: node.label, description: modelLeafDescription(node), value: node.value, active: node.isCurrent }
    }),
    onSelect: (value) => {
      const node = findCatalogNode(nodes, value)
      if (node?.children && node.children.length > 0) {
        return modelCatalogPicker(ctx, node.children as ModelCatalogNode[], node.label)
      }
      return selectModelThenThinking(ctx, value)
    },
  })
}

// ── Command list ──

export function buildCommands(ctx: CommandCtx): SlashCommand[] {
  const builtins: SlashCommand[] = [
    // Session
    {
      name: '/new',
      description: 'Start a new session',
      group: 'Session',
      run: () => {
        ctx.newDraft()
      },
    },
    {
      name: '/session',
      description: 'Resume a previous session',
      group: 'Session',
      run: async () => {
        const sessions = await ctx.request<SessionListItem[]>('session.listProjectSessions')
        return picker({
          title: 'Resume session',
          emptyText: 'No saved sessions in this workspace',
          items: (sessions ?? []).map((s) => ({
            label: truncate(s.title || s.summary || s.sessionId, 60),
            description: `${typeof s.turns === 'number' ? `${s.turns} turns · ` : ''}${relativeTime(s.lastActiveAt)}`,
            value: s.sessionId,
          })),
          onSelect: async (sessionId) => {
            await ctx.restoreSession(sessionId)
          },
        })
      },
    },
    {
      name: '/rename',
      description: 'Rename current session',
      group: 'Session',
      run: () =>
        input({
          title: 'Rename session',
          placeholder: 'Session title…',
          initial: ctx.meta?.title ?? '',
          onSubmit: async (title) => {
            await ctx.request('session.setTitle', { title })
          },
        }),
    },
    {
      name: '/fork',
      description: 'Fork this session into a new branch',
      group: 'Session',
      run: async () => {
        if (ctx.status?.currentTurnRunning) return text({ title: 'Fork', body: 'Cannot fork while a turn is running.' })
        try {
          const forked = await ctx.request<{ sessionId: string; title: string }>('session.fork')
          await ctx.restoreSession(forked.sessionId)
          return text({ title: 'Fork', body: `Now on "${forked.title}".` })
        } catch (err) {
          return text({ title: 'Fork', body: err instanceof Error ? err.message : String(err) })
        }
      },
    },
    {
      name: '/rewind',
      description: 'Rewind the conversation to a previous turn',
      group: 'Session',
      run: async () => {
        const targets = await ctx.request<RewindTarget[]>('session.getRewindTargets')
        return picker({
          title: 'Rewind to',
          emptyText: 'Nothing to rewind',
          items: (targets ?? []).map((t) => ({
            label: `Turn ${t.turnIndex} · ${truncate(t.preview, 44)}`,
            description: [
              t.fileCount > 0 ? `${t.fileCount} files` : '',
              t.additions > 0 ? `+${t.additions}` : '',
              t.deletions > 0 ? `−${t.deletions}` : '',
              relativeTime(t.timestamp),
            ]
              .filter(Boolean)
              .join(' · '),
            value: String(t.turnIndex),
          })),
          onSelect: async (v) => {
            await ctx.request('session.rewind', { toTurnIndex: Number(v) })
          },
        })
      },
    },
    {
      name: '/review',
      description: 'Review code changes',
      group: 'Session',
      run: () =>
        picker({
          title: 'Review',
          items: [
            { label: 'Review against a base branch', detail: 'PR style', value: 'base' },
            { label: 'Review uncommitted changes', value: 'uncommitted' },
            { label: 'Review a commit', value: 'commit' },
            { label: 'Custom review instructions', value: 'custom' },
          ],
          onSelect: async (kind) => {
            if (kind === 'uncommitted') return void dispatchReview(ctx, 'uncommitted', '', '')
            if (kind === 'custom') {
              return input({
                title: 'Review instructions',
                placeholder: 'What should be reviewed?',
                onSubmit: (note) => dispatchReview(ctx, 'custom', '', note),
              })
            }
            if (kind === 'base') {
              const branches = await ctx.gitBranches()
              return picker({
                title: 'Base branch',
                emptyText: 'No other branches found',
                items: branches.map((b) => ({ label: b, value: b })),
                onSelect: (branch) => dispatchReview(ctx, 'base', branch, ''),
              })
            }
            const commits = await ctx.gitCommits()
            return picker({
              title: 'Commit',
              emptyText: 'No commits found',
              items: commits.map((c) => ({ label: `${c.sha.slice(0, 7)} ${truncate(c.subject, 54)}`, value: c.sha })),
              onSelect: (sha) => dispatchReview(ctx, 'commit', sha, ''),
            })
          },
        }),
    },
    {
      name: '/copy',
      description: 'Copy the last response',
      group: 'Session',
      run: async () => {
        for (let i = ctx.conversation.length - 1; i >= 0; i--) {
          const e = ctx.conversation[i]!
          if ((e.kind === 'assistant' || e.kind === 'agent_result') && e.text.trim()) {
            try {
              await navigator.clipboard.writeText(e.fullText ?? e.text)
            } catch {
              // ignore
            }
            return
          }
        }
        return text({ title: 'Copy', body: 'No assistant response to copy yet.' })
      },
    },

    // Context
    {
      name: '/compact',
      description: 'Compact the active context',
      group: 'Context',
      run: () =>
        input({
          title: 'Compact context',
          placeholder: 'Optional instruction — Enter to compact',
          allowEmpty: true,
          onSubmit: async (t) => {
            await ctx.request('session.compact', t.trim() ? { instruction: t.trim() } : {})
          },
        }),
    },
    {
      name: '/summarize',
      description: 'Summarize a range of older turns',
      group: 'Context',
      run: async () => {
        const targets = (await ctx.request<SummarizeTarget[]>('session.getSummarizeTargets')) ?? []
        const item = (t: SummarizeTarget): PickerItem => ({
          label: `${t.kind === 'summary' ? 'Summary' : 'Turn'} ${t.turnIndex} · ${truncate(t.preview, 44)}`,
          description: relativeTime(t.timestamp),
          value: String(t.turnIndex),
        })
        return picker({
          title: 'Summarize from',
          emptyText: 'Nothing to summarize yet',
          items: targets.map(item),
          onSelect: (fromStr) => {
            const from = Number(fromStr)
            return picker({
              title: 'Summarize to',
              items: targets.filter((t) => t.turnIndex >= from).map(item),
              onSelect: (toStr) =>
                input({
                  title: 'Focus (optional)',
                  placeholder: 'What should the summary preserve? Enter to skip',
                  allowEmpty: true,
                  onSubmit: async (focus) => {
                    const ids = await ctx.request<string[]>('session.getContextIdsForTurnRange', {
                      startTurn: from,
                      endTurn: Number(toStr),
                    })
                    await ctx.request('session.summarize', {
                      targetContextIds: ids,
                      ...(focus.trim() ? { focusPrompt: focus.trim() } : {}),
                    })
                  },
                }),
            })
          },
        })
      },
    },
    {
      name: '/usage',
      description: 'Show session token usage',
      group: 'Context',
      run: () => {
        const s = ctx.status
        if (!s) return text({ title: 'Usage', body: 'No session data yet.' })
        const pct = s.contextBudget > 0 ? Math.round((s.lastInputTokens / s.contextBudget) * 100) : 0
        const body = [
          `Context:     ${s.lastInputTokens.toLocaleString()} / ${s.contextBudget.toLocaleString()} (${pct}%)`,
          `Last total:  ${s.lastTotalTokens.toLocaleString()} tokens`,
          `Cache read:  ${s.lastCacheReadTokens.toLocaleString()} tokens`,
          `Tool calls:  ${s.lifetimeToolCallCount}`,
        ].join('\n')
        return text({ title: 'Session usage', body, mono: true })
      },
    },

    // Config
    {
      name: '/model',
      description: 'Switch model',
      group: 'Config',
      run: async () => {
        if (ctx.hasCapability('modelCatalog')) {
          const catalog = await ctx.request<ModelCatalogNode[]>('session.getModelCatalog')
          if (Array.isArray(catalog) && catalog.length > 0) return modelCatalogPicker(ctx, catalog, 'Model')
        }
        return picker({
          title: 'Model',
          emptyText: 'No models configured',
          items: ctx.models.map((m) => ({
            label: m.name,
            description: `${m.provider} · ${Math.round(m.contextLength / 1024)}K`,
            value: m.name,
            active: m.name === ctx.meta?.modelConfigName,
          })),
          onSelect: (name) => selectModelThenThinking(ctx, name),
        })
      },
    },
    {
      name: '/permission',
      description: 'Set permission mode',
      group: 'Config',
      run: () =>
        picker({
          title: 'Permissions',
          items: PERMISSION_MODES.map((p) => ({
            label: p.label,
            description: p.desc,
            value: p.mode,
            active: p.mode === ctx.status?.permissionMode,
          })),
          onSelect: async (mode) => {
            await ctx.request('session.setPermissionMode', { mode })
          },
        }),
    },
    {
      name: '/mode',
      description: 'Switch agent mode',
      group: 'Config',
      run: () =>
        picker({
          title: 'Agent mode',
          items: AGENT_MODES.map((m) => ({
            label: m,
            description: MODE_DESCRIPTIONS[m] ?? '',
            value: m,
            active: m === ctx.agentMode,
          })),
          onSelect: async (mode) => {
            await ctx.request('session.setMode', { mode })
            await ctx.refreshMode()
          },
        }),
    },
    {
      name: '/goal',
      description: 'Set a completion goal the agent keeps pursuing',
      group: 'Config',
      run: () => {
        const goal = ctx.goal
        const items: PickerItem[] = []
        if (goal) {
          items.push({ label: `Active: ${truncate(goal, 50)}`, value: '', disabled: true })
          items.push({ label: 'Clear goal', value: 'clear' })
        }
        items.push({ label: goal ? 'Replace goal…' : 'Set goal…', value: 'set' })
        return picker({
          title: 'Goal',
          items,
          onSelect: async (v) => {
            if (v === 'clear') {
              await ctx.request('session.clearGoal')
              await ctx.refreshGoal()
              return
            }
            return input({
              title: 'Goal condition',
              placeholder: 'e.g. all tests pass and the feature works end-to-end',
              initial: goal ?? '',
              onSubmit: async (condition) => {
                await ctx.request('session.setGoal', { condition })
                await ctx.refreshGoal()
              },
            })
          },
        })
      },
    },
    {
      name: '/skills',
      description: 'Enable or disable skills',
      group: 'Config',
      run: async () => {
        await ctx.refreshSkills()
        return picker({
          title: 'Skills — Space to toggle, Enter to apply',
          checkbox: true,
          emptyText: 'No skills found',
          items: ctx.skills.map((s) => ({
            label: s.name,
            description: truncate(s.description, 60),
            value: s.name,
            checked: s.enabled,
          })),
          onCommit: async (checkedValues) => {
            const set = new Set(checkedValues)
            for (const s of ctx.skills) {
              const next = set.has(s.name)
              if (next !== s.enabled) await ctx.request('session.setSkillEnabled', { name: s.name, enabled: next })
            }
            await ctx.refreshSkills()
          },
        })
      },
    },
    {
      name: '/tier',
      description: 'Pin sub-agent model tiers',
      group: 'Config',
      run: async () => {
        const status = await ctx.request<{ tiers: Array<{ level: string; configName: string | null; label: string }> }>(
          'session.getModelTiers',
        )
        return picker({
          title: 'Model tier',
          items: (status?.tiers ?? []).map((t) => ({
            label: t.level,
            description: t.configName ?? t.label,
            value: t.level,
          })),
          onSelect: (level) =>
            picker({
              title: `Model for ${level} tier`,
              items: [
                { label: 'Inherit main model', value: '' },
                ...ctx.models.map((m) => ({
                  label: m.name,
                  description: `${m.provider} · ${Math.round(m.contextLength / 1024)}K`,
                  value: m.name,
                })),
              ],
              onSelect: async (modelName) => {
                await ctx.request('session.setModelTier', { level, modelName: modelName || null })
              },
            }),
        })
      },
    },
    {
      name: '/autoupdate',
      description: 'Background update checks',
      group: 'Config',
      run: async () => {
        if (!ctx.hasCapability('sharedSettings')) return text({ title: 'Auto-update', body: 'Update Fermi to manage this from the app.' })
        const cur = await ctx.request<SharedSettingsPayload>('settings.get')
        const mode = cur?.auto_update ?? true
        return picker({
          title: 'Auto-update',
          items: [
            { label: 'On', description: 'Download and apply updates automatically', value: 'on', active: mode === true },
            { label: 'Notify only', description: "Show a notice, don't install", value: 'notify', active: mode === 'notify' },
            { label: 'Off', description: 'No background update checks', value: 'off', active: mode === false },
          ],
          onSelect: async (v) => {
            await ctx.request('settings.patch', { auto_update: v === 'on' ? true : v === 'notify' ? 'notify' : false })
          },
        })
      },
    },

    // Info
    {
      name: '/shells',
      description: 'View or stop background shells',
      group: 'Info',
      run: async () => {
        const snaps = (await ctx.request<ShellSnapshot[]>('session.getBackgroundShellSnapshots')) ?? []
        return picker({
          title: 'Background shells',
          emptyText: 'No background shells',
          items: snaps.map((sh) => ({
            label: truncate(sh.command, 54),
            description: `${sh.status}${sh.exitCode !== null ? ` (${sh.exitCode})` : ''} · ${Math.round(sh.elapsedSeconds)}s`,
            value: sh.id,
          })),
          onSelect: (id) =>
            picker({
              title: 'Shell',
              items: [
                { label: 'View output', value: 'view' },
                { label: 'Stop shell', value: 'stop' },
              ],
              onSelect: async (action) => {
                if (action === 'view') {
                  const detail = await ctx.request<{ command: string; logTail: string; logTruncated: boolean }>(
                    'session.getBackgroundShellDetail',
                    { id, maxChars: 8000 },
                  )
                  return text({
                    title: `$ ${truncate(detail.command, 60)}`,
                    body: (detail.logTruncated ? '…\n' : '') + (detail.logTail || '(no output)'),
                    mono: true,
                  })
                }
                const res = await ctx.request<{ message: string }>('session.stopBackgroundShell', { id })
                return text({ title: 'Background shell', body: res?.message ?? 'Stopped.' })
              },
            }),
        })
      },
    },
    {
      name: '/mcp',
      description: 'Manage MCP servers',
      group: 'Info',
      run: async () => {
        const data = await ctx.request<McpStatusPayload>('session.getMcpStatus')
        const servers = data?.servers ?? []
        return picker({
          title: 'MCP servers',
          emptyText: 'No MCP servers configured (settings.json → mcpServers)',
          items: [
            ...(servers.length > 0 ? [{ label: 'Reload config', value: '__reload__' }] : []),
            ...servers.map((srv) => ({
              label: srv.name,
              description: srv.disabled
                ? 'disabled'
                : `${srv.state ?? 'not connected'}${srv.tools.length > 0 ? ` · ${srv.tools.length} tools` : ''}${srv.error ? ` · ${srv.error}` : ''}`,
              value: srv.name,
            })),
          ],
          onSelect: async (value) => {
            if (value === '__reload__') {
              const r = await ctx.request<{ report: string }>('session.reloadMcp')
              return text({ title: 'MCP', body: r?.report ?? 'Reloaded.' })
            }
            const srv = servers.find((s) => s.name === value)
            const disabled = srv?.disabled === true
            return picker({
              title: value,
              items: [
                ...(!disabled ? [{ label: 'Reconnect', value: 'reconnect' }] : []),
                disabled ? { label: 'Enable', value: 'enable' } : { label: 'Disable', value: 'disable' },
                ...(srv && srv.tools.length > 0 ? [{ label: `View tools (${srv.tools.length})`, value: 'tools' }] : []),
              ],
              onSelect: async (op) => {
                if (op === 'tools') return text({ title: `${value} tools`, body: (srv?.tools ?? []).join('\n'), mono: true })
                if (op === 'reconnect') {
                  const r = await ctx.request<{ ok: boolean }>('session.reconnectMcpServer', { name: value })
                  return text({ title: 'MCP', body: `${value}: ${r?.ok ? 'reconnected' : 'reconnect failed'}` })
                }
                const enabled = op === 'enable'
                const r = await ctx.request<{ report: string }>('session.setMcpServerEnabled', { name: value, enabled })
                return text({ title: 'MCP', body: `${value}: ${enabled ? 'enabled' : 'disabled'}${r?.report ? ` (${r.report})` : ''}` })
              },
            })
          },
        })
      },
    },
    {
      name: '/hooks',
      description: 'Manage hooks',
      group: 'Info',
      run: async () => {
        const data = await ctx.request<HooksStatusPayload>('session.getHooksStatus')
        const hooks = data?.hooks ?? []
        return picker({
          title: 'Hooks — select to toggle',
          emptyText: 'No hooks configured',
          items: [
            ...(hooks.length > 0 ? [{ label: 'Reload hooks', value: '__reload__' }] : []),
            ...hooks.map((h) => ({
              label: h.disabled ? `${h.name} (disabled)` : h.name,
              description: `${h.scope} · ${h.event}${h.matcher ? ` [${h.matcher}]` : ''}`,
              value: h.name,
            })),
          ],
          onSelect: async (value) => {
            if (value === '__reload__') {
              const r = await ctx.request<{ count: number }>('session.reloadHooks')
              return text({ title: 'Hooks', body: `Reloaded: ${r?.count ?? 0} active` })
            }
            const hook = hooks.find((h) => h.name === value)
            const enable = hook?.disabled === true
            await ctx.request('session.setHookEnabled', { name: value, enabled: enable })
            return text({ title: 'Hooks', body: `${value}: ${enable ? 'enabled' : 'disabled'}` })
          },
        })
      },
    },
    {
      name: '/help',
      description: 'Commands and shortcuts',
      group: 'Info',
      run: () =>
        text({
          title: 'Fermi',
          body: [
            'Type / to open commands. ↑↓ to move, Enter to run, Esc to close.',
            '',
            'Shortcuts:',
            '  Enter        send',
            '  Shift+Enter  newline',
            '  Esc          interrupt a running turn',
            '  ⌘N           new session',
            '  ↑ / ↓        prompt history (at the input edges)',
          ].join('\n'),
          mono: true,
        }),
    },
  ]

  const dynamic = skillCommands(ctx)
  const names = new Set(builtins.map((c) => c.name))
  return [...builtins, ...dynamic.filter((c) => !names.has(c.name))]
}

function skillCommands(ctx: CommandCtx): SlashCommand[] {
  if (!ctx.hasCapability('invokeSkill')) return []
  return ctx.skills
    .filter((s) => s.userInvocable && s.enabled)
    .map((s) => ({
      name: `/${s.name}`,
      description: s.description,
      group: 'Skills' as const,
      run: () =>
        input({
          title: `/${s.name}`,
          placeholder: 'Arguments (optional) — Enter to run',
          allowEmpty: true,
          onSubmit: async (args) => {
            await ctx.request('session.invokeSkill', { name: s.name, args: args.trim() })
          },
        }),
    }))
}

export function filterCommands(commands: SlashCommand[], filter: string): SlashCommand[] {
  const f = filter.toLowerCase()
  if (!f || f === '/') return commands
  return commands.filter((c) => c.name.toLowerCase().startsWith(f))
}
