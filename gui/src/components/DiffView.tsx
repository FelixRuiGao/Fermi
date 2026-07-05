/**
 * Render a unified-diff-style display field as a styled diff card.
 *
 * Vigil's write_file/edit_file tool emits a `display` of the form:
 *
 *      --- /abs/path/file.ts
 *      +++ /abs/path/file.ts
 *      @@ -A,B +C,D @@
 *    N +added line
 *    N  context line
 *    N -removed line
 *
 * We parse this into hunks and render +/- with green/red gutter colors,
 * line numbers, and a path header.
 */

import { useMemo } from 'react'
import { FileEdit, FilePlus2 } from 'lucide-react'
import { cn } from '@/lib/cn.js'
import { relToWorkspace } from '@/lib/path.js'
import { iconForExtension } from '@/lib/fileIcon.js'
import { diffStats, type FileModifyDisplay } from '@/lib/transcriptModel.js'

/**
 * Inline unified diff rendered straight from the structured hunk data the
 * server ships in a tool's `fileModifyData` — no client-side diffing. Write
 * mode shows the new file content as additions (truncated).
 */
export function StructuredDiff({
  data,
  workDir,
  maxWriteLines = 140,
}: {
  data: FileModifyDisplay
  workDir?: string
  maxWriteLines?: number
}): JSX.Element {
  const fileName = data.filePath.split(/[\\/]/).pop() ?? data.filePath
  const relPath = workDir ? relToWorkspace(data.filePath, workDir) : data.filePath
  const { added, removed } = diffStats(data)
  const FileIcon = iconForExtension(fileName)
  const isWrite = data.mode === 'write' && !!data.writeLines && data.hunks.length === 0

  const rows: DiffRow[] = []
  if (isWrite) {
    const lines = data.writeLines!.slice(0, maxWriteLines)
    lines.forEach((text, i) => rows.push({ kind: 'add', num: i + 1, text }))
    if (data.writeLines!.length > lines.length) {
      rows.push({ kind: 'more', num: null, text: `… ${data.writeLines!.length - lines.length} more lines` })
    }
  } else {
    data.hunks.forEach((h, hi) => {
      if (hi > 0) rows.push({ kind: 'sep', num: null, text: '' })
      let oldLine = h.startLine - h.contextBefore.length
      let newLine = oldLine
      for (const text of h.contextBefore) {
        rows.push({ kind: 'ctx', num: newLine, text })
        oldLine++
        newLine++
      }
      for (const text of h.deletions) {
        rows.push({ kind: 'del', num: oldLine, text })
        oldLine++
      }
      for (const text of h.additions) {
        rows.push({ kind: 'add', num: newLine, text })
        newLine++
      }
      for (const text of h.contextAfter) {
        rows.push({ kind: 'ctx', num: newLine, text })
        oldLine++
        newLine++
      }
    })
  }

  return (
    <div className="overflow-hidden">
      <div className="max-h-[420px] overflow-auto">
        <div className="mono min-w-max text-[13px] leading-[1.55]">
          {rows.map((row, i) => {
            if (row.kind === 'sep') {
              return <div key={i} className="h-2 bg-line-soft/20" />
            }
            if (row.kind === 'more') {
              return (
                <div key={i} className="flex px-1 py-1 text-ink-4">
                  <span className="w-10 shrink-0" />
                  <span>{row.text}</span>
                </div>
              )
            }
            const tone =
              row.kind === 'add'
                ? 'bg-diff-add-bg'
                : row.kind === 'del'
                  ? 'bg-diff-rm-bg'
                  : ''
            const sign = row.kind === 'add' ? '+' : row.kind === 'del' ? '−' : ' '
            const signColor =
              row.kind === 'add' ? 'text-diff-add-ink' : row.kind === 'del' ? 'text-diff-rm-ink' : 'text-ink-4'
            return (
              <div key={i} className={cn('flex', tone)}>
                <span className="w-11 shrink-0 select-none px-2 text-right text-[11.5px] text-ink-4">
                  {row.num ?? ''}
                </span>
                <span className={cn('w-4 shrink-0 select-none text-center', signColor)}>{sign}</span>
                <span className="whitespace-pre pr-3 text-code-ink">{row.text.length > 0 ? row.text : ' '}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line-soft/60 bg-pane-2/30 px-3 py-1.5 text-[12.5px]">
        <FileIcon className="h-3.5 w-3.5 shrink-0 text-ink-4" strokeWidth={1.6} />
        <span className="mono truncate text-ink-3" title={data.filePath}>
          {relPath}
        </span>
        <span className="mono ml-auto flex shrink-0 items-center gap-1.5">
          {added > 0 && <span className="text-diff-add-ink">+{added}</span>}
          {removed > 0 && <span className="text-diff-rm-ink">−{removed}</span>}
        </span>
      </div>
    </div>
  )
}

interface DiffRow {
  kind: 'add' | 'del' | 'ctx' | 'sep' | 'more'
  num: number | null
  text: string
}

interface DiffLine {
  kind: 'add' | 'del' | 'ctx' | 'hunk'
  lineNo: string // numeric or empty
  oldLineNo: string
  newLineNo: string
  text: string
}

interface ParsedDiff {
  fromPath: string
  toPath: string
  lines: DiffLine[]
  isNewFile: boolean
}

const HUNK_RE = /^\s*@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/
const LINE_RE = /^\s*(\d+)?\s*([+\- ])(.*)$/

function parseDiff(text: string): ParsedDiff | null {
  const lines = text.split('\n')
  let fromPath = ''
  let toPath = ''
  const out: DiffLine[] = []
  let inHeader = true
  let isNewFile = false
  let oldLine = 0
  let newLine = 0
  for (const raw of lines) {
    if (inHeader) {
      const fromMatch = raw.match(/^\s*---\s+(.+)$/)
      const toMatch = raw.match(/^\s*\+\+\+\s+(.+)$/)
      if (fromMatch) {
        fromPath = (fromMatch[1] ?? '').trim()
        continue
      }
      if (toMatch) {
        toPath = (toMatch[1] ?? '').trim()
        continue
      }
      const hunkMatch = raw.match(HUNK_RE)
      if (hunkMatch) {
        inHeader = false
        // Detect new file via "@@ -1,0" / "@@ -0,0" signatures
        if (/-(?:0|1),0\s/.test(raw)) isNewFile = true
        oldLine = Number(hunkMatch[1] ?? 0)
        newLine = Number(hunkMatch[2] ?? 0)
        out.push({ kind: 'hunk', lineNo: '', oldLineNo: '', newLineNo: '', text: raw.trim() })
        continue
      }
      if (
        raw.length === 0 ||
        raw.startsWith('diff --git ') ||
        raw.startsWith('index ') ||
        raw.startsWith('new file mode ') ||
        raw.startsWith('deleted file mode ') ||
        raw.startsWith('similarity index ') ||
        raw.startsWith('rename from ') ||
        raw.startsWith('rename to ')
      ) {
        continue
      }
      // not a known header line — treat the whole text as plain
      return null
    } else {
      const hunkMatch = raw.match(HUNK_RE)
      if (hunkMatch) {
        oldLine = Number(hunkMatch[1] ?? 0)
        newLine = Number(hunkMatch[2] ?? 0)
        out.push({ kind: 'hunk', lineNo: '', oldLineNo: '', newLineNo: '', text: raw.trim() })
        continue
      }
      const m = raw.match(LINE_RE)
      if (!m) {
        if (raw.length === 0) continue
        out.push({ kind: 'ctx', lineNo: '', oldLineNo: '', newLineNo: '', text: raw })
        continue
      }
      const ln = m[1] ?? ''
      const sign = m[2] ?? ' '
      const body = m[3] ?? ''
      const kind = sign === '+' ? 'add' : sign === '-' ? 'del' : 'ctx'
      const oldLineNo = kind === 'add' ? '' : oldLine > 0 ? String(oldLine) : ''
      const newLineNo = kind === 'del' ? '' : newLine > 0 ? String(newLine) : ''
      if (kind !== 'add' && oldLine > 0) oldLine += 1
      if (kind !== 'del' && newLine > 0) newLine += 1
      out.push({
        kind,
        lineNo: ln,
        oldLineNo,
        newLineNo,
        text: body,
      })
    }
  }
  if (out.length === 0) return null
  return { fromPath, toPath, lines: out, isNewFile }
}

export function DiffView({
  text,
  workDir,
  isError,
  resultSummary,
  mode = 'unified',
  hideHeader,
  flush,
}: {
  text: string
  workDir?: string
  isError: boolean
  resultSummary?: string
  mode?: 'unified' | 'split'
  hideHeader?: boolean
  flush?: boolean
}): JSX.Element | null {
  const parsed = useMemo(() => parseDiff(text), [text])
  if (!parsed) return null

  const path = parsed.toPath || parsed.fromPath
  const display = workDir ? relToWorkspace(path, workDir) : path
  const Icon = parsed.isNewFile ? FilePlus2 : FileEdit
  const stats = useMemo(() => {
    let adds = 0
    let dels = 0
    for (const l of parsed.lines) {
      if (l.kind === 'add') adds++
      else if (l.kind === 'del') dels++
    }
    return { adds, dels }
  }, [parsed])

  return (
    <div
      className={cn(
        'overflow-hidden bg-code-bg',
        flush ? 'border-0' : 'mt-1.5 rounded border',
        !flush && (isError ? 'border-error/30' : 'border-line-soft'),
      )}
    >
      {/* Header (hidden when caller already shows path + stats above) */}
      {!hideHeader && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-line-soft/60 bg-pane-2/40">
          <Icon className={cn('h-3.5 w-3.5', parsed.isNewFile ? 'text-success' : 'text-ink-3')} />
          <span className="font-mono text-[13.5px] text-ink-2 truncate">{display}</span>
          <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[14.5px]">
            {stats.adds > 0 && <span className="text-success">+{stats.adds}</span>}
            {stats.dels > 0 && <span className="text-error">−{stats.dels}</span>}
            {parsed.isNewFile && (
              <span className="rounded-full border border-success/40 bg-success/10 px-1.5 py-px text-[11.5px] text-success">
                new
              </span>
            )}
          </span>
        </div>
      )}

      {/* Body */}
      <div className="max-h-[420px] overflow-auto">
        {mode === 'split' ? <SplitDiffTable lines={parsed.lines} /> : <UnifiedDiffTable lines={parsed.lines} />}
      </div>

      {/* Footer with summary if provided */}
      {resultSummary && (
        <div className="border-t border-line-soft/60 bg-pane-2/30 px-3 py-1 text-[12.5px] text-ink-3 truncate">
          {resultSummary}
        </div>
      )}
    </div>
  )
}

function UnifiedDiffTable({ lines }: { lines: DiffLine[] }): JSX.Element {
  return (
    <table className="w-full border-collapse font-mono text-[13.5px]">
      <tbody>
        {lines.map((line, i) => {
          if (line.kind === 'hunk') {
            return (
              <tr key={i}>
                <td colSpan={3} className="px-3 py-1 bg-pane-2/30 text-[12.5px] text-ink-3">
                  {line.text}
                </td>
              </tr>
            )
          }
          const tone =
            line.kind === 'add'
              ? 'bg-success/10 text-ink'
              : line.kind === 'del'
                ? 'bg-error/10 text-ink-2'
                : ''
          const sign = line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '
          const signColor =
            line.kind === 'add'
              ? 'text-success'
              : line.kind === 'del'
                ? 'text-error'
                : 'text-ink-3'
          const lineNo = line.lineNo || line.newLineNo || line.oldLineNo
          return (
            <tr key={i} className={cn('group', tone)}>
              <td className="select-none pl-3 pr-2 text-right text-[12.5px] text-ink-3 align-top">
                {lineNo}
              </td>
              <td className={cn('select-none pr-1.5 text-center align-top', signColor)}>
                {sign}
              </td>
              <td className="pr-3 align-top whitespace-pre">{line.text}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function SplitDiffTable({ lines }: { lines: DiffLine[] }): JSX.Element {
  return (
    <table className="w-full table-fixed border-collapse font-mono text-[13px]">
      <tbody>
        {lines.map((line, i) => {
          if (line.kind === 'hunk') {
            return (
              <tr key={i}>
                <td colSpan={6} className="px-3 py-1 bg-pane-2/30 text-[12.5px] text-ink-3">
                  {line.text}
                </td>
              </tr>
            )
          }

          const oldTone = line.kind === 'del' ? 'bg-error/10 text-ink-2' : ''
          const newTone = line.kind === 'add' ? 'bg-success/10 text-ink' : ''
          const oldText = line.kind === 'add' ? '' : line.text
          const newText = line.kind === 'del' ? '' : line.text

          return (
            <tr key={i} className="group">
              <td className={cn('w-[3.1rem] select-none pl-3 pr-2 text-right text-[12px] text-ink-3 align-top', oldTone)}>
                {line.oldLineNo}
              </td>
              <td className={cn('w-5 select-none text-center align-top', line.kind === 'del' ? 'text-error' : 'text-ink-3', oldTone)}>
                {line.kind === 'del' ? '−' : ' '}
              </td>
              <td className={cn('w-1/2 overflow-hidden text-ellipsis pr-3 align-top whitespace-pre', oldTone)}>
                {oldText}
              </td>
              <td className={cn('w-[3.1rem] select-none border-l border-line-soft/50 pl-3 pr-2 text-right text-[12px] text-ink-3 align-top', newTone)}>
                {line.newLineNo}
              </td>
              <td className={cn('w-5 select-none text-center align-top', line.kind === 'add' ? 'text-success' : 'text-ink-3', newTone)}>
                {line.kind === 'add' ? '+' : ' '}
              </td>
              <td className={cn('w-1/2 overflow-hidden text-ellipsis pr-3 align-top whitespace-pre', newTone)}>
                {newText}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
