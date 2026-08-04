/**
 * 横断マイルストーン（複数案件の重要日を1画面で比較する）。
 *
 * 表示は「比較表」と「時間軸」の2種類。時間軸は Phase 1・2 で作った共通の
 * 時間軸部品（src/lib/timeline.ts と ./GanttParts）をそのまま使い、
 * 画面専用の座標計算・日付変換を作らない。
 * 件数はすべて /summary の確定計算を使い、画面側で数え直さない。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, CalendarClock, Crosshair, FileDown, Filter, Pencil, Plus,
  Printer, RotateCcw, Save, Table2, Trash2,
} from 'lucide-react'
import { PageHeader } from '../../components/layout/Breadcrumb'
import { Panel } from '../../components/ui/common'
import { Modal } from '../../components/ui/Modal'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../auth/AuthContext'
import { ApiError } from '../../lib/apiClient'
import {
  createTimeline, DEFAULT_SLOT_WIDTH, formatJst, nowJst, rangeForScale, splitStartAt,
  toJstIsoString, type TimeScale, type Timeline,
} from '../../lib/timeline'
import { JP_HOLIDAYS } from '../../lib/holidays'
import {
  DEFAULT_DUE_SOON_DAYS, DEFAULT_MILESTONE_LIMIT, EMPTY_MILESTONE_FILTERS,
  downloadMilestones, hasAnyMilestoneFilter, useCreateMilestone, useCrossMilestones,
  useDeleteMilestone, useDeleteMilestoneSearch, useMilestoneOptions, useMilestoneSummary,
  useSaveMilestoneSearch, useSavedMilestoneSearches, useUpdateMilestone,
  type CrossMilestone, type MilestoneCandidate, type MilestoneFilters, type MilestoneOptions,
  type MilestoneSummary,
} from '../../api/crossMilestones'
import { ScheduleTabs } from './ScheduleTabs'
import {
  GanttGrid, GanttHeader, MilestoneMarkers, ROW_H, SCALE_OPTIONS, ScaleSelector, TodayLine,
} from './GanttParts'

type ViewKind = 'table' | 'timeline'
type GroupKind = 'project' | 'type'

const VIEWS: { key: ViewKind; label: string; icon: typeof Table2 }[] = [
  { key: 'table', label: '比較表', icon: Table2 },
  { key: 'timeline', label: '時間軸', icon: CalendarClock },
]

const GROUPS: { key: GroupKind; label: string }[] = [
  { key: 'project', label: '案件別' },
  { key: 'type', label: '種別別' },
]

const ROW_LABEL_W = 260
const CELL_W = 190

/**
 * 保存された日時が午後（JST 12:00）かどうか。
 * 判定は Phase 1 の共通日時変換（splitStartAt）に任せる。
 * 画面独自の UTC 計算を書くと 00:00 を午後と誤判定する。
 */
function isAfternoon(iso: string): boolean {
  return splitStartAt(iso).half === 'PM'
}

// ===== URLクエリ ⇔ 絞り込み条件 =====
function nums(v: string | null): number[] {
  return (v ?? '').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)
}
function strs(v: string | null): string[] {
  return (v ?? '').split(',').filter(Boolean)
}

function filtersFromParams(p: URLSearchParams): MilestoneFilters {
  const actual = p.get('actual')
  return {
    q: p.get('q') ?? '',
    projectIds: nums(p.get('projects')),
    milestoneTypeIds: nums(p.get('types')),
    statuses: strs(p.get('statuses')),
    responsibleIds: nums(p.get('responsibles')),
    companyIds: nums(p.get('companies')),
    relatedTaskIds: nums(p.get('tasks')),
    dateFrom: p.get('from') ?? '',
    dateTo: p.get('to') ?? '',
    actual: actual === 'entered' || actual === 'missing' ? actual : '',
    overdueOnly: p.get('overdue') === '1',
    dueSoonOnly: p.get('duesoon') === '1',
    conflictOnly: p.get('conflict') === '1',
    dueSoonDays: Number(p.get('duesoondays')) || DEFAULT_DUE_SOON_DAYS,
    limit: Number(p.get('limit')) || DEFAULT_MILESTONE_LIMIT,
  }
}

function paramsFromState(
  f: MilestoneFilters, view: ViewKind, group: GroupKind, scale: TimeScale,
): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.projectIds.length) p.set('projects', f.projectIds.join(','))
  if (f.milestoneTypeIds.length) p.set('types', f.milestoneTypeIds.join(','))
  if (f.statuses.length) p.set('statuses', f.statuses.join(','))
  if (f.responsibleIds.length) p.set('responsibles', f.responsibleIds.join(','))
  if (f.companyIds.length) p.set('companies', f.companyIds.join(','))
  if (f.relatedTaskIds.length) p.set('tasks', f.relatedTaskIds.join(','))
  if (f.dateFrom) p.set('from', f.dateFrom)
  if (f.dateTo) p.set('to', f.dateTo)
  if (f.actual) p.set('actual', f.actual)
  if (f.overdueOnly) p.set('overdue', '1')
  if (f.dueSoonOnly) p.set('duesoon', '1')
  if (f.conflictOnly) p.set('conflict', '1')
  if (f.dueSoonDays !== DEFAULT_DUE_SOON_DAYS) p.set('duesoondays', String(f.dueSoonDays))
  if (f.limit !== DEFAULT_MILESTONE_LIMIT) p.set('limit', String(f.limit))
  if (view !== 'table') p.set('view', view)
  if (group !== 'project') p.set('group', group)
  if (scale !== 'month') p.set('scale', scale)
  return p
}

export default function CrossMilestones() {
  const { toast, confirm } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  // 案件詳細ルートではパスの案件IDを優先し、APIにも project_id を渡す。
  // URLクエリや保存検索で別案件へ範囲が広がらない。
  const scopedProjectId = Number(id) > 0 ? Number(id) : undefined

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams])
  const view: ViewKind = searchParams.get('view') === 'timeline' ? 'timeline' : 'table'
  const group: GroupKind = searchParams.get('group') === 'type' ? 'type' : 'project'
  const scale: TimeScale = SCALE_OPTIONS.some((s) => s.key === searchParams.get('scale'))
    ? (searchParams.get('scale') as TimeScale)
    : 'month'

  const apply = useCallback(
    (next: { filters?: MilestoneFilters; view?: ViewKind; group?: GroupKind; scale?: TimeScale }) => {
      // 戻る・進むで復元できるよう履歴を残す
      setSearchParams(paramsFromState(
        next.filters ?? filters, next.view ?? view, next.group ?? group, next.scale ?? scale,
      ))
    },
    [filters, view, group, scale, setSearchParams],
  )
  const setFilters = useCallback((f: MilestoneFilters) => apply({ filters: f }), [apply])

  const { data, isLoading, isError, error } = useCrossMilestones(filters, group, scopedProjectId)
  const { data: summary } = useMilestoneSummary(filters, group, scopedProjectId)
  const { data: options, isLoading: optionsLoading, isError: optionsError } = useMilestoneOptions(scopedProjectId)
  const createMs = useCreateMilestone()
  const updateMs = useUpdateMilestone()
  const deleteMs = useDeleteMilestone()

  const [filterOpen, setFilterOpen] = useState(false)
  const [editor, setEditor] = useState<
    | { mode: 'create'; seed?: { projectId: number; typeId: number } }
    | { mode: 'edit'; row: CrossMilestone }
    | null
  >(null)

  const canEdit = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER'
  const milestones = useMemo(() => data?.milestones ?? [], [data])
  const candidates = useMemo(() => data?.candidates ?? [], [data])

  // ===== 比較表の行・列（案件別／種別別で転置する） =====
  const { rowKeys, colKeys, cells } = useMemo(() => {
    type Cell = { rows: CrossMilestone[]; candidate?: MilestoneCandidate }
    const projects = new Map<number, RowKey & { sort: string }>()
    const types = new Map<number, RowKey & { order: number }>()
    const map = new Map<string, Cell>()

    const put = (pid: number, tid: number | null, m?: CrossMilestone, c?: MilestoneCandidate) => {
      const key = `${pid}:${tid ?? 0}`
      const cur = map.get(key) ?? { rows: [] }
      if (m) cur.rows.push(m)
      if (c) cur.candidate = c
      map.set(key, cur)
    }

    for (const m of milestones) {
      projects.set(m.project_id, {
        id: m.project_id, label: m.project_name, sub: m.project_number, sort: m.project_number,
      })
      if (m.milestone_type_id) {
        types.set(m.milestone_type_id, {
          id: m.milestone_type_id, label: m.milestone_type ?? '—', order: m.milestone_type_order,
        })
      }
      put(m.project_id, m.milestone_type_id, m)
    }
    for (const c of candidates) {
      projects.set(c.project_id, {
        id: c.project_id, label: c.project_name, sub: c.project_number, sort: c.project_number,
      })
      types.set(c.milestone_type_id, {
        id: c.milestone_type_id, label: c.milestone_type, order: c.milestone_type_order,
      })
      put(c.project_id, c.milestone_type_id, undefined, c)
    }

    const projectList = [...projects.values()].sort((a, b) => a.sort.localeCompare(b.sort))
    const typeList = [...types.values()].sort((a, b) => a.order - b.order || a.id - b.id)
    // 種別別のときは行と列を入れ替える（APIのグループ条件と一致させる）
    return group === 'project'
      ? { rowKeys: projectList as RowKey[], colKeys: typeList as RowKey[], cells: map }
      : { rowKeys: typeList as RowKey[], colKeys: projectList as RowKey[], cells: map }
  }, [milestones, candidates, group])

  const cellOf = useCallback(
    (rowId: number, colId: number) =>
      cells.get(group === 'project' ? `${rowId}:${colId}` : `${colId}:${rowId}`),
    [cells, group],
  )

  // ===== 時間軸（共通部品を使う。独自の座標計算は作らない） =====
  const range = useMemo(
    () => rangeForScale(
      scale,
      milestones.flatMap((m) => [
        { start: m.planned_at, end: m.planned_at },
        { start: m.actual_at, end: m.actual_at },
      ]),
      { explicit: { from: filters.dateFrom || undefined, to: filters.dateTo || undefined } },
    ),
    [scale, milestones, filters.dateFrom, filters.dateTo],
  )
  const timeline: Timeline = useMemo(
    () => createTimeline({
      scale, from: range.from, to: range.to,
      slotWidth: DEFAULT_SLOT_WIDTH[scale], holidays: JP_HOLIDAYS,
    }),
    [scale, range],
  )

  const timelineRows = useMemo(() => {
    const byRow = new Map<number, CrossMilestone[]>()
    for (const m of milestones) {
      const key = group === 'project' ? m.project_id : (m.milestone_type_id ?? 0)
      byRow.set(key, [...(byRow.get(key) ?? []), m])
    }
    return rowKeys.map((r) => ({ ...r, items: byRow.get(r.id) ?? [] }))
  }, [milestones, rowKeys, group])

  const timelineRef = useRef<HTMLDivElement>(null)
  const scrollToToday = useCallback(() => {
    if (timelineRef.current && timeline.todayX !== null) {
      timelineRef.current.scrollLeft = Math.max(0, timeline.todayX - 200)
    }
  }, [timeline])
  useEffect(() => { if (view === 'timeline') scrollToToday() }, [view, scrollToToday])

  async function removeMilestone(row: CrossMilestone) {
    const ok = await confirm({
      title: 'マイルストーンの削除',
      message: `「${row.project_number} ${row.name}」を削除します。よろしいですか？`,
      confirmLabel: '削除', danger: true,
    })
    if (!ok) return
    try {
      await deleteMs.mutateAsync({ id: row.id, reason: '横断マイルストーンから削除' })
      toast('マイルストーンを削除しました', 'ok')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '削除できませんでした', 'ng')
    }
  }

  const emptyKind = !data
    ? 'loading'
    : data.registered_count === 0 && data.candidate_count === 0
      ? 'none'
      : data.registered_count === 0
        ? 'candidates-only'
        : 'ok'

  return (
    <div>
      <div data-print="hide">
        <PageHeader
          breadcrumb={[{ label: '案件一覧', to: '/projects' }, { label: '工程管理', to: '/schedule' },
                       { label: '横断マイルストーン' }]}
          title="横断マイルストーン"
          description={`${scopedProjectId ? '対象案件で絞り込み中 ／ ' : ''}複数案件の重要日を1画面で比較します`}
          actions={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 rounded border border-line bg-white p-0.5"
                   role="group" aria-label="表示方式">
                {VIEWS.map((v) => (
                  <button key={v.key} onClick={() => apply({ view: v.key })} aria-pressed={view === v.key}
                    className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${
                      view === v.key ? 'bg-sysken-500 text-white' : 'text-ink hover:bg-canvas'}`}>
                    <v.icon size={14} />{v.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-0.5 rounded border border-line bg-white p-0.5"
                   role="group" aria-label="グループ">
                {GROUPS.map((g) => (
                  <button key={g.key} onClick={() => apply({ group: g.key })} aria-pressed={group === g.key}
                    className={`rounded px-2.5 py-1 text-xs font-medium ${
                      group === g.key ? 'bg-sysken-500 text-white' : 'text-ink hover:bg-canvas'}`}>
                    {g.label}
                  </button>
                ))}
              </div>
              {view === 'timeline' && <ScaleSelector scale={scale} onChange={(s) => apply({ scale: s })} />}
            </div>
          }
        />
        <ScheduleTabs projectId={scopedProjectId} />
      </div>

      <PrintHeader
        filters={filters} options={options} view={view} group={group} summary={summary}
        scopedProjectId={scopedProjectId} userLabel={user ? `${user.name}（${user.role}）` : '—'}
      />

      <div data-print="hide" className="mb-2 flex flex-wrap items-center gap-2 rounded border border-line bg-white px-2 py-1.5">
        <input className="field !w-56 !py-1 text-xs" placeholder="マイルストーン名・案件名・備考"
          value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <ToolButton icon={Filter} label="絞り込み" onClick={() => setFilterOpen((v) => !v)} />
        <ToolButton icon={RotateCcw} label="条件をクリア" disabled={!hasAnyMilestoneFilter(filters)}
          onClick={() => setFilters(EMPTY_MILESTONE_FILTERS)} />
        {view === 'timeline' && <ToolButton icon={Crosshair} label="今日へ移動" onClick={scrollToToday} />}
        <div className="mx-1 h-6 w-px bg-line" />
        <ExportButtons filters={filters} group={group} projectId={scopedProjectId}
          disabled={!data || (data.registered_count === 0 && data.candidate_count === 0)} />
        <div className="mx-1 h-6 w-px bg-line" />
        <SavedSearchBar filters={filters} view={view} group={group} scale={scale}
          onApply={(f, v, g, s) => setSearchParams(paramsFromState(f, v, g, s))} />
        {canEdit && (
          <button onClick={() => setEditor({ mode: 'create' })}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-ink hover:bg-canvas">
            <Plus size={15} className="text-sysken-600" />新規登録
          </button>
        )}
        <span className="ml-auto text-xs text-ink-soft">
          {isLoading ? '検索中…' : isError ? '取得に失敗しました'
            : `登録済み ${data?.registered_count ?? 0} 件 ／ 未設定 ${data?.candidate_count ?? 0} 件`}
        </span>
      </div>

      {filterOpen && options && (
        <div data-print="hide">
          <FilterPanel filters={filters} options={options} onChange={setFilters} />
        </div>
      )}

      {/* サマリーは /summary の確定計算をそのまま表示する（画面で数え直さない） */}
      {summary && <SummaryBar summary={summary} />}

      {isError && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-4 py-3 text-center text-[13px] text-ng">
          {error instanceof ApiError && error.status === 403
            ? 'この画面を表示する権限がありません。'
            : `マイルストーンの取得に失敗しました（${error instanceof ApiError ? error.message : '原因不明のエラー'}）。`}
        </div>
      )}
      {isLoading && (
        <div className="mb-2 rounded border border-line bg-white px-4 py-6 text-center text-[13px] text-ink-soft">
          マイルストーンを検索しています…
        </div>
      )}
      {!isLoading && !isError && emptyKind === 'none' && (
        <div className="mb-2 rounded border border-line bg-white px-4 py-8 text-center text-[13px] text-ink-soft">
          <p className="font-medium text-ink">条件に一致するマイルストーンはありません</p>
          <p className="mt-1">絞り込み条件を変更するか、「条件をクリア」で全件表示に戻してください。</p>
        </div>
      )}
      {!isLoading && !isError && emptyKind === 'candidates-only' && (
        <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-4 py-4 text-center text-[13px] text-ink">
          <p className="font-medium">登録済みのマイルストーンはありません（未設定の区分が {data?.candidate_count} 件あります）</p>
          <p className="mt-1 text-ink-soft">下の「未設定」から登録できます。</p>
        </div>
      )}
      {data?.truncated && (
        <div className="mb-2 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-ink">
          <AlertTriangle size={15} className="text-wn" />
          該当 {data.total} 件のうち先頭 {data.returned_count} 件のみ表示しています（上限 {data.limit} 件）。
          絞り込み条件を追加してください。
        </div>
      )}

      {view === 'table' ? (
        <ComparisonTable
          rowKeys={rowKeys} colKeys={colKeys} cellOf={cellOf} group={group} canEdit={canEdit}
          onEdit={(row) => setEditor({ mode: 'edit', row })}
          onCreate={(projectId, typeId) => setEditor({ mode: 'create', seed: { projectId, typeId } })}
          onDelete={removeMilestone}
          onOpenProject={(pid) => navigate(`/projects/${pid}/schedule`)}
        />
      ) : (
        <TimelineView
          rows={timelineRows} timeline={timeline} narrowed={range.narrowed}
          scrollRef={timelineRef} onOpen={(m) => setEditor({ mode: 'edit', row: m })}
        />
      )}

      <MilestoneEditor
        editor={editor} options={options} scopedProjectId={scopedProjectId}
        optionsLoading={optionsLoading} optionsError={optionsError}
        saving={createMs.isPending || updateMs.isPending}
        onClose={() => setEditor(null)}
        onSubmit={async (input, id) => {
          if (id) await updateMs.mutateAsync({ id, ...input })
          else await createMs.mutateAsync(input)
        }}
      />
    </div>
  )
}

function ToolButton({
  icon: Icon, label, onClick, disabled,
}: { icon: typeof Filter; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-ink hover:bg-canvas disabled:opacity-40">
      <Icon size={15} className="text-sysken-600" />{label}
    </button>
  )
}

// ===== サマリー =====
function SummaryBar({ summary }: { summary: MilestoneSummary }) {
  const items: { label: string; value: number; tone?: string }[] = [
    { label: '登録済み', value: summary.registered_count },
    { label: '未設定候補', value: summary.candidate_count },
    { label: '完了', value: summary.completed },
    { label: '期限超過', value: summary.overdue, tone: 'text-ng' },
    { label: `近日予定（${summary.due_soon_days}日以内）`, value: summary.due_soon, tone: 'text-wn' },
    { label: '遅延完了', value: summary.was_delayed, tone: 'text-wn' },
    { label: '関連工程と不整合', value: summary.related_task_conflict, tone: 'text-wn' },
  ]
  return (
    <div className="mb-2 rounded border border-line bg-white px-3 py-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <AlertTriangle size={15} className="text-wn" />
        <span className="text-[13px] font-semibold text-ink">システム検知（確定計算）</span>
        <span className="text-[11px] text-ink-soft">
          基準日 {summary.calculated_at}（Asia/Tokyo）。保存済みの日時から機械的に判定した結果で、AIによる予測ではありません。
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <span key={i.label} className="rounded border border-line px-2 py-1 text-[12px]">
            <span className="text-ink-soft">{i.label}</span>
            <span className={`ml-1.5 font-semibold tabular-nums ${i.tone ?? 'text-ink'}`}>{i.value}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

// ===== 比較表 =====
type RowKey = { id: number; label: string; sub?: string }

function ComparisonTable({
  rowKeys, colKeys, cellOf, group, canEdit, onEdit, onCreate, onDelete, onOpenProject,
}: {
  rowKeys: RowKey[]
  colKeys: RowKey[]
  cellOf: (rowId: number, colId: number) => { rows: CrossMilestone[]; candidate?: MilestoneCandidate } | undefined
  group: GroupKind
  canEdit: boolean
  onEdit: (m: CrossMilestone) => void
  onCreate: (projectId: number, typeId: number) => void
  onDelete: (m: CrossMilestone) => void
  onOpenProject: (projectId: number) => void
}) {
  if (!rowKeys.length) return null
  return (
    <Panel className="overflow-hidden" bodyClassName="p-0">
      <div data-print="sheet" className="thin-scroll max-h-[calc(100vh-420px)] overflow-auto">
        <table className="grid-table text-[12.5px]">
          <thead className="sticky top-0 z-20 bg-canvas">
            <tr>
              <th className="sticky left-0 z-30 h-12 border-r border-line bg-canvas px-2 text-left text-[12.5px] font-semibold text-ink-soft"
                  style={{ width: ROW_LABEL_W, minWidth: ROW_LABEL_W }}>
                {group === 'project' ? '案件' : 'マイルストーン区分'}
              </th>
              {colKeys.map((c) => (
                <th key={c.id} className="h-12 border-r border-line px-2 text-left text-[12.5px] font-semibold text-ink-soft"
                    style={{ width: CELL_W, minWidth: CELL_W }}>
                  {c.label}
                  {c.sub && <span className="ml-1 text-[11px] font-normal">{c.sub}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowKeys.map((r) => (
              <tr key={r.id} className="align-top">
                <td className="sticky left-0 z-10 border-r border-line bg-white px-2 py-1.5"
                    style={{ width: ROW_LABEL_W, minWidth: ROW_LABEL_W }}>
                  <div className="font-medium text-ink">{r.label}</div>
                  {r.sub && group === 'project' && (
                    <button data-print="hide" className="text-[11px] text-sysken-600 hover:underline"
                      onClick={() => onOpenProject(r.id)}>{r.sub}</button>
                  )}
                  {r.sub && group !== 'project' && <div className="text-[11px] text-ink-soft">{r.sub}</div>}
                </td>
                {colKeys.map((c) => {
                  const cell = cellOf(r.id, c.id)
                  const projectId = group === 'project' ? r.id : c.id
                  const typeId = group === 'project' ? c.id : r.id
                  return (
                    <td key={c.id} className="border-r border-line px-1.5 py-1.5"
                        style={{ width: CELL_W, minWidth: CELL_W }}>
                      {/* 同一案件・同一区分が複数あればセル内に積み重ねる（1件に潰さない） */}
                      {(cell?.rows ?? []).map((m) => (
                        <MilestoneCell key={m.id} m={m} canEdit={canEdit}
                          onEdit={() => onEdit(m)} onDelete={() => onDelete(m)} />
                      ))}
                      {!cell?.rows.length && cell?.candidate && (
                        <div className="rounded border border-dashed border-line px-2 py-1.5 text-center">
                          <div className="text-[12px] text-ink-soft">未設定</div>
                          {canEdit && (
                            <button data-print="hide" onClick={() => onCreate(projectId, typeId)}
                              className="mt-1 text-[11px] text-sysken-600 hover:underline">登録する</button>
                          )}
                        </div>
                      )}
                      {!cell && <div className="px-2 py-1.5 text-[12px] text-ink-soft">—</div>}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

/** 1件分のセル。DBの状態と確定計算の結果を分けて表示する。 */
function MilestoneCell({
  m, canEdit, onEdit, onDelete,
}: { m: CrossMilestone; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  const half = m.schedule_precision === 'half_day'
  const fmt = (iso: string | null) => {
    if (!iso) return '—'
    const base = formatJst(iso, 'MM/dd')
    return half ? `${base} ${isAfternoon(iso) ? '午後' : '午前'}` : base
  }
  return (
    <div className="mb-1 rounded border border-line px-2 py-1.5 last:mb-0">
      <div className="flex items-start gap-1">
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink" title={m.name}>{m.name}</span>
        {canEdit && (
          <span data-print="hide" className="flex shrink-0 gap-0.5">
            <button onClick={onEdit} className="rounded p-0.5 text-ink-soft hover:bg-canvas" title="編集">
              <Pencil size={12} />
            </button>
            <button onClick={onDelete} className="rounded p-0.5 text-ng hover:bg-canvas" title="削除">
              <Trash2 size={12} />
            </button>
          </span>
        )}
      </div>
      <div className="mt-0.5 grid grid-cols-2 gap-x-2 text-[11px] tabular-nums text-ink-soft">
        <span>予定 {fmt(m.planned_at)}</span>
        <span>実績 {fmt(m.actual_at)}</span>
      </div>
      <div className="mt-0.5 truncate text-[11px] text-ink-soft"
           title={`${m.responsible ?? '未割当'} / ${m.company ?? '未割当'}`}>
        {m.responsible ?? '未割当'} ／ {m.company ?? '未割当'}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-ink-soft">{m.status}</span>
        {m.is_overdue && <DetectionFlag tone="ng">期限超過 {m.delay_days}日</DetectionFlag>}
        {m.is_due_soon && <DetectionFlag tone="wn">近日 残{m.remaining_days}日</DetectionFlag>}
        {m.was_delayed && <DetectionFlag tone="wn">遅延完了 {m.delay_days}日</DetectionFlag>}
        {m.related_task_conflict && <DetectionFlag tone="wn">工程と不整合</DetectionFlag>}
        {m.actual_missing && <DetectionFlag tone="ng">実績未入力</DetectionFlag>}
      </div>
    </div>
  )
}

function DetectionFlag({ tone, children }: { tone: 'ng' | 'wn'; children: React.ReactNode }) {
  const cls = tone === 'ng' ? 'border-red-200 bg-red-50 text-ng' : 'border-amber-200 bg-amber-50 text-ink'
  return <span className={`rounded border px-1.5 py-0.5 text-[10px] ${cls}`}>{children}</span>
}

// ===== 時間軸 =====
function TimelineView({
  rows, timeline, narrowed, scrollRef, onOpen,
}: {
  rows: (RowKey & { items: CrossMilestone[] })[]
  timeline: Timeline
  narrowed: boolean
  scrollRef: React.RefObject<HTMLDivElement>
  onOpen: (m: CrossMilestone) => void
}) {
  const bodyH = Math.max(rows.length * ROW_H, ROW_H)
  if (!rows.length) return null
  return (
    <>
      {narrowed && (
        <div className="mb-2 rounded border border-line bg-white px-3 py-1.5 text-[12px] text-ink-soft">
          3時間表示は1日が8列になるため、現在日を中心とした期間だけを表示しています。
        </div>
      )}
      <Panel className="overflow-hidden" bodyClassName="p-0">
        {/*
          items-start が必須。既定の stretch だと左右の枠が独立したスクロール枠になり
          縦位置がずれる（Phase 2 の工程表と同じ理由）。
        */}
        <div data-print="sheet" className="thin-scroll flex max-h-[calc(100vh-420px)] items-start overflow-y-auto">
          <div className="shrink-0 border-r border-line bg-white" style={{ width: ROW_LABEL_W }}>
            <div className="sticky top-0 z-20 flex h-16 items-end border-b border-line bg-canvas px-2 pb-2 text-[12.5px] font-semibold text-ink-soft">
              対象
            </div>
            {rows.map((r) => (
              <div key={r.id} className="flex items-center border-b border-line/60 px-2" style={{ height: ROW_H }}>
                <span className="truncate text-[12.5px] text-ink" title={r.label}>{r.label}</span>
                {r.sub && <span className="ml-1 shrink-0 text-[11px] text-ink-soft">{r.sub}</span>}
              </div>
            ))}
          </div>
          <div ref={scrollRef} className="thin-scroll flex-1 overflow-x-auto">
            <div style={{ width: timeline.totalWidth }}>
              <GanttHeader timeline={timeline} />
              <div className="relative" style={{ height: bodyH }}>
                <GanttGrid timeline={timeline} height={bodyH} />
                {rows.map((_, i) => (
                  <div key={i} className="absolute left-0 border-b border-line/60"
                       style={{ top: (i + 1) * ROW_H - 1, width: timeline.totalWidth }} />
                ))}
                {rows.map((r, i) => (
                  <MilestoneMarkers key={r.id} items={r.items} row={i} timeline={timeline} onOpen={onOpen} />
                ))}
                <TodayLine timeline={timeline} height={bodyH} />
              </div>
            </div>
          </div>
        </div>
        <div data-print="hide" className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-canvas px-3 py-1.5 text-[11px] text-ink-soft">
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45 bg-sysken-600" /> 予定日</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45 border border-ok bg-white" /> 実績日</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45 bg-ng" /> 期限超過</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rotate-45 bg-wn" /> 関連工程と不整合</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-0.5 bg-ng" /> 本日</span>
          <span className="ml-auto">マーカーを選択すると詳細を編集できます</span>
        </div>
      </Panel>
    </>
  )
}

// ===== 絞り込み =====
function FilterPanel({
  filters, options, onChange,
}: { filters: MilestoneFilters; options: MilestoneOptions; onChange: (f: MilestoneFilters) => void }) {
  const multi = (
    label: string, values: number[], items: { id: number; name: string; sub?: string }[],
    apply: (v: number[]) => void,
  ) => (
    <div>
      <label className="label">{label}</label>
      <select multiple className="field h-24 !py-1 text-xs" value={values.map(String)}
        onChange={(e) => apply([...e.target.selectedOptions].map((o) => Number(o.value)))}>
        {items.map((it) => (
          <option key={it.id} value={it.id}>{it.name}{it.sub ? `（${it.sub}）` : ''}</option>
        ))}
      </select>
    </div>
  )
  return (
    <div className="mb-2 grid grid-cols-2 gap-3 rounded border border-line bg-white px-3 py-3 md:grid-cols-4 xl:grid-cols-6">
      <div>
        <label className="label">予定日（開始）</label>
        <input type="date" className="field !py-1 text-xs" value={filters.dateFrom}
          onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })} />
      </div>
      <div>
        <label className="label">予定日（終了）</label>
        <input type="date" className="field !py-1 text-xs" value={filters.dateTo}
          onChange={(e) => onChange({ ...filters, dateTo: e.target.value })} />
      </div>
      {multi('案件', filters.projectIds,
        options.projects.map((p) => ({ id: p.id, name: p.name, sub: p.construction_number })),
        (v) => onChange({ ...filters, projectIds: v }))}
      {/* 同名でも区別できるようIDを併記する */}
      {multi('マイルストーン区分', filters.milestoneTypeIds,
        options.milestone_types.map((t) => ({ ...t, sub: `ID ${t.id}` })),
        (v) => onChange({ ...filters, milestoneTypeIds: v }))}
      {multi('担当者', filters.responsibleIds,
        options.responsibles.map((r) => ({ ...r, sub: `ID ${r.id}` })),
        (v) => onChange({ ...filters, responsibleIds: v }))}
      {multi('担当会社', filters.companyIds,
        options.companies.map((c) => ({ ...c, sub: `ID ${c.id}` })),
        (v) => onChange({ ...filters, companyIds: v }))}
      {multi('関連工程', filters.relatedTaskIds,
        options.related_tasks.map((t) => ({ id: t.id, name: `${t.wbs_code ?? ''} ${t.name}`.trim() })),
        (v) => onChange({ ...filters, relatedTaskIds: v }))}
      <div>
        <label className="label">状態（DB）</label>
        <select multiple className="field h-24 !py-1 text-xs" value={filters.statuses}
          onChange={(e) => onChange({ ...filters, statuses: [...e.target.selectedOptions].map((o) => o.value) })}>
          {options.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label className="label">実績</label>
        <select className="field !py-1 text-xs" value={filters.actual}
          onChange={(e) => onChange({ ...filters, actual: e.target.value as MilestoneFilters['actual'] })}>
          <option value="">すべて</option>
          <option value="entered">入力済みのみ</option>
          <option value="missing">未入力のみ</option>
        </select>
      </div>
      <div>
        <label className="label">近日予定の日数</label>
        <input type="number" min={0} max={365} className="field !py-1 text-xs" value={filters.dueSoonDays}
          onChange={(e) => onChange({ ...filters, dueSoonDays: Number(e.target.value) || 0 })} />
      </div>
      <div>
        <label className="label">表示上限</label>
        <input type="number" min={1} max={5000} className="field !py-1 text-xs" value={filters.limit}
          onChange={(e) => onChange({ ...filters, limit: Number(e.target.value) || DEFAULT_MILESTONE_LIMIT })} />
      </div>
      <div className="flex flex-col justify-end gap-1.5 pb-1 text-[13px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={filters.overdueOnly}
            onChange={(e) => onChange({ ...filters, overdueOnly: e.target.checked })} />期限超過のみ
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={filters.dueSoonOnly}
            onChange={(e) => onChange({ ...filters, dueSoonOnly: e.target.checked })} />近日予定のみ
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={filters.conflictOnly}
            onChange={(e) => onChange({ ...filters, conflictOnly: e.target.checked })} />日程矛盾のみ
        </label>
      </div>
    </div>
  )
}

// ===== 出力 =====
function ExportButtons({
  filters, group, projectId, disabled,
}: { filters: MilestoneFilters; group: GroupKind; projectId?: number; disabled: boolean }) {
  const { toast } = useApp()
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null)
  async function run(format: 'xlsx' | 'pdf') {
    setBusy(format)
    try {
      await downloadMilestones(filters, format, { projectId, group })
      toast(`${format === 'xlsx' ? 'Excel' : 'PDF'}を出力しました（現在の絞り込み条件を反映）`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : '出力に失敗しました', 'ng')
    } finally {
      setBusy(null)
    }
  }
  return (
    <>
      <ToolButton icon={FileDown} label={busy === 'xlsx' ? '出力中…' : 'Excel'}
        onClick={() => void run('xlsx')} disabled={disabled || busy !== null} />
      <ToolButton icon={FileDown} label={busy === 'pdf' ? '出力中…' : 'PDF'}
        onClick={() => void run('pdf')} disabled={disabled || busy !== null} />
      <ToolButton icon={Printer} label="印刷" onClick={() => window.print()} disabled={disabled} />
    </>
  )
}

// ===== 保存検索条件 =====
function SavedSearchBar({
  filters, view, group, scale, onApply,
}: {
  filters: MilestoneFilters
  view: ViewKind
  group: GroupKind
  scale: TimeScale
  onApply: (f: MilestoneFilters, v: ViewKind, g: GroupKind, s: TimeScale) => void
}) {
  const { toast } = useApp()
  const { data: saved = [] } = useSavedMilestoneSearches()
  const save = useSaveMilestoneSearch()
  const remove = useDeleteMilestoneSearch()
  const [selected, setSelected] = useState('')

  async function store(overwrite: boolean) {
    const current = saved.find((s) => String(s.id) === selected)
    const name = overwrite && current
      ? current.name
      : window.prompt('この検索条件に名前を付けて保存します')?.trim()
    if (!name) return
    try {
      await save.mutateAsync({
        id: overwrite && current ? current.id : undefined,
        name,
        conditions: { ...filters, view, group, scale },
      })
      toast(overwrite ? '検索条件を上書きしました' : '検索条件を保存しました', 'ok')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '検索条件を保存できませんでした', 'ng')
    }
  }

  async function del() {
    if (!selected) return
    try {
      await remove.mutateAsync(Number(selected))
      setSelected('')
      toast('検索条件を削除しました', 'ok')
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '検索条件を削除できませんでした', 'ng')
    }
  }

  return (
    <div className="flex items-center gap-1">
      <select className="field !w-40 !py-1 text-xs" value={selected}
        onChange={(e) => {
          setSelected(e.target.value)
          const row = saved.find((s) => String(s.id) === e.target.value)
          if (!row) return
          const c = row.conditions ?? {}
          // 保存時の選択肢が無効になっていても壊れないよう、既定値へ寄せて読み込む
          onApply(
            { ...EMPTY_MILESTONE_FILTERS, ...c },
            c.view === 'timeline' ? 'timeline' : 'table',
            c.group === 'type' ? 'type' : 'project',
            SCALE_OPTIONS.some((s) => s.key === c.scale) ? (c.scale as TimeScale) : 'month',
          )
        }}>
        <option value="">保存した条件</option>
        {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <button onClick={() => void store(false)} className="rounded px-1.5 py-1 hover:bg-canvas" title="現在の条件を保存">
        <Save size={15} className="text-sysken-600" />
      </button>
      <button onClick={() => void store(true)} disabled={!selected}
        className="rounded px-1.5 py-1 text-[11px] text-ink hover:bg-canvas disabled:opacity-40" title="選択中の条件を上書き">
        上書き
      </button>
      <button onClick={() => void del()} disabled={!selected}
        className="rounded px-1.5 py-1 hover:bg-canvas disabled:opacity-40" title="選択中の条件を削除">
        <Trash2 size={15} className="text-ng" />
      </button>
    </div>
  )
}

// ===== 登録・編集 =====
function MilestoneEditor({
  editor, options, optionsLoading, optionsError, saving, scopedProjectId, onClose, onSubmit,
}: {
  editor:
    | { mode: 'create'; seed?: { projectId: number; typeId: number } }
    | { mode: 'edit'; row: CrossMilestone }
    | null
  options: MilestoneOptions | undefined
  optionsLoading: boolean
  optionsError: boolean
  saving: boolean
  scopedProjectId?: number
  onClose: () => void
  onSubmit: (input: Record<string, unknown>, id?: number) => Promise<void>
}) {
  const [form, setForm] = useState({
    projectId: '', typeId: '', name: '', plannedDate: '', plannedHalf: 'AM',
    actualDate: '', actualHalf: 'AM', precision: 'day', status: '予定',
    responsibleId: '', companyId: '', relatedTaskId: '', notes: '',
  })
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!editor) return
    setError(null)
    if (editor.mode === 'edit') {
      const r = editor.row
      const split = (iso: string | null) =>
        iso ? { date: formatJst(iso, 'yyyy-MM-dd'), half: isAfternoon(iso) ? 'PM' : 'AM' }
            : { date: '', half: 'AM' }
      const p = split(r.planned_at)
      const a = split(r.actual_at)
      setForm({
        projectId: String(r.project_id),
        typeId: r.milestone_type_id ? String(r.milestone_type_id) : '',
        name: r.name, plannedDate: p.date, plannedHalf: p.half,
        actualDate: a.date, actualHalf: a.half,
        precision: r.schedule_precision, status: r.status,
        responsibleId: r.responsible_id ? String(r.responsible_id) : '',
        companyId: r.company_id ? String(r.company_id) : '',
        relatedTaskId: r.related_task_id ? String(r.related_task_id) : '',
        notes: r.notes ?? '',
      })
    } else {
      // 未設定候補から登録する場合は、案件IDと区分IDだけを初期値にする。
      // 予定日・状態・担当者などは自動生成しない。
      setForm({
        projectId: String(editor.seed?.projectId ?? scopedProjectId ?? ''),
        typeId: editor.seed?.typeId ? String(editor.seed.typeId) : '',
        name: '', plannedDate: '', plannedHalf: 'AM', actualDate: '', actualHalf: 'AM',
        precision: 'day', status: '予定', responsibleId: '', companyId: '', relatedTaskId: '', notes: '',
      })
    }
  }, [editor, scopedProjectId])

  if (!editor) return null

  const projectId = Number(form.projectId) || 0
  // 関連工程は選択した案件の工程だけ。案件を変えたら不整合な選択は外す。
  const relatedChoices = (options?.related_tasks ?? []).filter((t) => t.project_id === projectId)
  const relatedValid = relatedChoices.some((t) => String(t.id) === form.relatedTaskId)
  const half = form.precision === 'half_day'
  const atOf = (date: string, h: string) =>
    date ? `${date}T${half && h === 'PM' ? '12' : '00'}:00:00+09:00` : null

  async function submit() {
    setError(null)
    if (!projectId) { setError('案件を選択してください'); return }
    if (!form.name.trim()) { setError('名称を入力してください'); return }
    const payload: Record<string, unknown> = {
      milestone_type_id: form.typeId ? Number(form.typeId) : null,
      name: form.name.trim(),
      planned_at: atOf(form.plannedDate, form.plannedHalf),
      // 実績未入力は未入力のまま送る（固定値で埋めない）
      actual_at: atOf(form.actualDate, form.actualHalf),
      status: form.status,
      responsible_id: form.responsibleId ? Number(form.responsibleId) : null,
      company_id: form.companyId ? Number(form.companyId) : null,
      related_task_id: relatedValid && form.relatedTaskId ? Number(form.relatedTaskId) : null,
      schedule_precision: form.precision,
      notes: form.notes || null,
    }
    try {
      if (editor && editor.mode === 'edit') {
        await onSubmit({ ...payload, change_reason: '横断マイルストーンから更新' }, editor.row.id)
      } else {
        await onSubmit({ ...payload, project_id: projectId })
      }
      onClose()
    } catch (e) {
      // 保存に失敗したらモーダルは閉じない。理由をそのまま表示する。
      setError(e instanceof ApiError ? e.message : '保存できませんでした')
    }
  }

  return (
    <Modal open onClose={onClose} size="lg"
      title={editor.mode === 'edit' ? 'マイルストーンを編集' : 'マイルストーンを登録'}
      footer={<>
        <button className="btn-default" onClick={onClose}>キャンセル</button>
        <button className="btn-primary" disabled={saving} onClick={() => void submit()}>
          {saving ? '保存中…' : '保存'}
        </button>
      </>}>
      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-ng">{error}</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <div>
          <label className="label">案件 *</label>
          <select className="field" data-milestone-project
            value={form.projectId}
            disabled={editor.mode === 'edit' || scopedProjectId !== undefined}
            onChange={(e) => setForm({ ...form, projectId: e.target.value, relatedTaskId: '' })}>
            <option value="">選択してください</option>
            {(options?.projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.construction_number} {p.name}</option>
            ))}
          </select>
          {/* 候補が無いとき、通信失敗・権限不足・本当に0件を区別して伝える */}
          {!optionsLoading && (options?.projects ?? []).length === 0 && (
            <p className="mt-1 text-[11px] text-ng" data-milestone-project-empty>
              {optionsError
                ? '案件の候補を取得できませんでした。通信状態を確認して開き直してください。'
                : '登録できる案件がありません。担当案件の割当を管理者へご確認ください。'}
            </p>
          )}
          {scopedProjectId !== undefined && (
            <p className="mt-1 text-[11px] text-ink-soft">この画面の案件に登録します（変更するには横断マイルストーンから開いてください）</p>
          )}
        </div>
        <div>
          <label className="label">区分</label>
          <select className="field" data-milestone-type value={form.typeId}
            onChange={(e) => setForm({ ...form, typeId: e.target.value })}>
            <option value="">未指定</option>
            {(options?.milestone_types ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          {!optionsLoading && (options?.milestone_types ?? []).length === 0 && (
            <p className="mt-1 text-[11px] text-ng">
              {optionsError ? '区分マスタを取得できませんでした。' : '区分マスタが登録されていません。'}
            </p>
          )}
        </div>
        <div>
          <label className="label">名称 *</label>
          <input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">入力粒度</label>
          <select className="field" value={form.precision} onChange={(e) => setForm({ ...form, precision: e.target.value })}>
            <option value="day">1日単位</option>
            <option value="half_day">0.5日単位（午前・午後）</option>
          </select>
        </div>
        <div>
          <label className="label">予定日</label>
          <div className="flex items-center gap-1">
            <input type="date" className="field" value={form.plannedDate}
              onChange={(e) => setForm({ ...form, plannedDate: e.target.value })} />
            {half && (
              <select className="field !w-20" value={form.plannedHalf}
                onChange={(e) => setForm({ ...form, plannedHalf: e.target.value })}>
                <option value="AM">午前</option><option value="PM">午後</option>
              </select>
            )}
          </div>
        </div>
        <div>
          <label className="label">実績日</label>
          <div className="flex items-center gap-1">
            <input type="date" className="field" value={form.actualDate}
              onChange={(e) => setForm({ ...form, actualDate: e.target.value })} />
            {half && form.actualDate && (
              <select className="field !w-20" value={form.actualHalf}
                onChange={(e) => setForm({ ...form, actualHalf: e.target.value })}>
                <option value="AM">午前</option><option value="PM">午後</option>
              </select>
            )}
          </div>
        </div>
        <div>
          <label className="label">状態</label>
          <select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {['予定', '完了', '中止'].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        {/* 担当者と担当会社は独立して選択する（相互に自動導出しない） */}
        <div>
          <label className="label">担当者</label>
          <select className="field" value={form.responsibleId}
            onChange={(e) => setForm({ ...form, responsibleId: e.target.value })}>
            <option value="">未割当</option>
            {(options?.responsibles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}（ID {r.id}）</option>)}
          </select>
        </div>
        <div>
          <label className="label">担当会社</label>
          <select className="field" value={form.companyId}
            onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
            <option value="">未割当</option>
            {(options?.companies ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}（ID {c.id}）</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className="label">関連工程</label>
          <select className="field" value={relatedValid ? form.relatedTaskId : ''}
            onChange={(e) => setForm({ ...form, relatedTaskId: e.target.value })}>
            <option value="">なし</option>
            {relatedChoices.map((t) => <option key={t.id} value={t.id}>{t.wbs_code} {t.name}</option>)}
          </select>
          {!projectId && <p className="mt-1 text-[11px] text-ink-soft">案件を選ぶと、その案件の工程だけが表示されます。</p>}
        </div>
        <div className="col-span-2 md:col-span-3">
          <label className="label">備考</label>
          <textarea className="field min-h-16" value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
    </Modal>
  )
}

// ===== 印刷用の見出し =====
function PrintHeader({
  filters, options, view, group, summary, scopedProjectId, userLabel,
}: {
  filters: MilestoneFilters
  options: MilestoneOptions | undefined
  view: ViewKind
  group: GroupKind
  summary: MilestoneSummary | undefined
  scopedProjectId?: number
  userLabel: string
}) {
  const nameOf = (items: { id: number; name: string }[] | undefined, ids: number[]) =>
    ids.map((id) => {
      const hit = items?.find((x) => x.id === id)
      return hit ? `${hit.name}（ID ${id}）` : `ID ${id}`
    }).join('、')

  const conditions: [string, string][] = []
  if (scopedProjectId) {
    const p = options?.projects.find((x) => x.id === scopedProjectId)
    conditions.push(['対象案件', p ? `${p.construction_number} ${p.name}` : `ID ${scopedProjectId}`])
  }
  if (filters.q.trim()) conditions.push(['キーワード', filters.q.trim()])
  if (filters.dateFrom || filters.dateTo) {
    conditions.push(['予定日', `${filters.dateFrom || '—'} 〜 ${filters.dateTo || '—'}`])
  }
  if (filters.projectIds.length) {
    conditions.push(['案件', filters.projectIds.map((id) => {
      const p = options?.projects.find((x) => x.id === id)
      return p ? `${p.construction_number} ${p.name}` : `ID ${id}`
    }).join('、')])
  }
  if (filters.milestoneTypeIds.length) conditions.push(['区分', nameOf(options?.milestone_types, filters.milestoneTypeIds)])
  if (filters.responsibleIds.length) conditions.push(['担当者', nameOf(options?.responsibles, filters.responsibleIds)])
  if (filters.companyIds.length) conditions.push(['担当会社', nameOf(options?.companies, filters.companyIds)])
  if (filters.statuses.length) conditions.push(['状態(DB)', filters.statuses.join('、')])
  if (filters.actual) conditions.push(['実績', filters.actual === 'entered' ? '入力済みのみ' : '未入力のみ'])
  if (filters.overdueOnly) conditions.push(['期限超過のみ', 'はい'])
  if (filters.dueSoonOnly) conditions.push(['近日予定のみ', 'はい'])
  if (filters.conflictOnly) conditions.push(['日程矛盾のみ', 'はい'])
  if (!conditions.length) conditions.push(['検索条件', '指定なし（全件）'])

  return (
    <div data-print="only" className="hidden">
      <h1 className="mb-1 text-[16px] font-bold text-ink">横断マイルストーン</h1>
      <table className="mb-3 text-[11px]">
        <tbody>
          <tr>
            <th className="pr-2 text-left font-semibold">出力日時</th>
            <td className="pr-6">{formatJst(toJstIsoString(nowJst()), 'yyyy/MM/dd HH:mm')}</td>
            <th className="pr-2 text-left font-semibold">出力者</th>
            <td className="pr-6">{userLabel}</td>
            <th className="pr-2 text-left font-semibold">計算基準日</th>
            <td>{summary?.calculated_at ?? '—'}</td>
          </tr>
          <tr>
            <th className="pr-2 text-left font-semibold">表示方式</th>
            <td className="pr-6">{view === 'table' ? '比較表' : '時間軸'}</td>
            <th className="pr-2 text-left font-semibold">表示の切替</th>
            <td className="pr-6">{group === 'project' ? '案件別' : '種別別'}</td>
            <th className="pr-2 text-left font-semibold">対象件数</th>
            <td>登録済み {summary?.registered_count ?? 0} 件 ／ 未設定 {summary?.candidate_count ?? 0} 件</td>
          </tr>
          {conditions.map(([label, value]) => (
            <tr key={label}>
              <th className="pr-2 text-left align-top font-semibold">{label}</th>
              <td colSpan={5}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
