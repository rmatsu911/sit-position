/**
 * 横断工程表（複数案件の工程を1画面で確認する）。
 *
 * 独自データは持たず、既存の projects / tasks / users / companies を横断表示する。
 * 座標計算は src/lib/timeline.ts、バー描画は ./GanttParts、工程更新は既存の
 * PUT /api/tasks/{id} を使い、案件工程と同じ実装を共有する。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, Building2, ChevronDown, ChevronRight, Crosshair, ExternalLink, Eye, FileDown,
  Filter, Printer, RotateCcw, Save, SlidersHorizontal, Trash2, TrendingUp, UserPlus,
} from 'lucide-react'
import { PageHeader } from '../../components/layout/Breadcrumb'
import { Panel } from '../../components/ui/common'
import { StatusBadge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { ContextMenu, type MenuItem } from '../../components/ui/ContextMenu'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../auth/AuthContext'
import { ApiError } from '../../lib/apiClient'
import {
  createTimeline, DEFAULT_SLOT_WIDTH, formatJst, formatPeriod, nowJst, rangeForScale,
  shiftDays, snapDelta, snapStepOf, toJstIsoString,
  type SchedulePrecision, type TimeScale, type Timeline,
} from '../../lib/timeline'
import { JP_HOLIDAYS } from '../../lib/holidays'
import type { WbsTask } from '../../types'
import {
  downloadCrossSchedule, EMPTY_FILTERS, hasAnyFilter, toWbsTask, useCreateSavedSearch,
  useCrossSchedule, useCrossScheduleOptions, useDeleteSavedSearch, useSavedSearches,
  useUpdateCrossTask,
  type CrossFilters, type CrossScheduleOptions, type CrossTask, type IdName, type SystemDetection,
} from '../../api/crossSchedule'
import { ScheduleTabs } from './ScheduleTabs'
import {
  EMPTY_MILESTONE_FILTERS, useCrossMilestones, type CrossMilestone,
} from '../../api/crossMilestones'
import {
  DependencyLines, edgeLabel, GanttGrid, GanttHeader, GanttLegend, GanttRow, MilestoneMarkers,
  milestoneRowsByProject, ROW_H, SCALE_OPTIONS, ScaleSelector, TodayLine,
} from './GanttParts'

type GroupKey = 'project' | 'manager' | 'company'

const GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'project', label: '案件別' },
  { key: 'manager', label: '担当者別' },
  { key: 'company', label: '担当会社別' },
]

/** 左一覧の列。sticky の3列は横スクロールしても常に見える主要列。 */
const COLUMNS = [
  { key: 'wbs', label: 'WBS', w: 54, sticky: true },
  { key: 'project', label: '案件名', w: 148, sticky: true },
  { key: 'name', label: '工程名', w: 178, sticky: true },
  { key: 'manager', label: '担当者', w: 88, sticky: false },
  { key: 'company', label: '担当会社', w: 132, sticky: false },
  { key: 'planStart', label: '予定開始', w: 82, sticky: false },
  { key: 'planEnd', label: '予定終了', w: 82, sticky: false },
  { key: 'actualStart', label: '実績開始', w: 82, sticky: false },
  { key: 'actualEnd', label: '実績終了', w: 82, sticky: false },
  { key: 'planDays', label: '期間', w: 52, sticky: false },
  { key: 'progress', label: '進捗率', w: 56, sticky: false },
  { key: 'planPeople', label: '予定人工', w: 64, sticky: false },
  { key: 'actualPeople', label: '実績人工', w: 64, sticky: false },
  { key: 'status', label: '状態', w: 78, sticky: false },
  { key: 'delay', label: '遅延', w: 54, sticky: false },
  { key: 'notes', label: '備考', w: 168, sticky: false },
] as const

type Column = (typeof COLUMNS)[number]
type ColumnKey = Column['key']

const ALWAYS_ON: ColumnKey[] = ['wbs', 'project', 'name']
const COLUMN_PREF_KEY = 'sysken.crossSchedule.columns'
const DEFAULT_COLUMNS: ColumnKey[] = [
  'wbs', 'project', 'name', 'manager', 'company',
  'planStart', 'planEnd', 'actualStart', 'actualEnd', 'planDays', 'progress', 'status', 'delay',
]

const LEFT_PANE_W = 560

type Row =
  | { kind: 'group'; key: string; label: string; sub?: string; count: number }
  | { kind: 'task'; task: CrossTask; bar: WbsTask | null; depth: number; hasChildren: boolean }
  // マイルストーンは工程とは別の正データ（milestones）。工程行の下へ別の帯として並べる。
  | { kind: 'milestone'; key: string; label: string; sub: string; items: CrossMilestone[] }

// ===== URLクエリ ⇔ 絞り込み条件（再読込しても条件が残る） =====
function numsFrom(v: string | null): number[] {
  return (v ?? '').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)
}
function stringsFrom(v: string | null): string[] {
  return (v ?? '').split(',').filter(Boolean)
}

function filtersFromParams(p: URLSearchParams): CrossFilters {
  return {
    q: p.get('q') ?? '',
    dateFrom: p.get('from') ?? '',
    dateTo: p.get('to') ?? '',
    projectIds: numsFrom(p.get('projects')),
    constructionTypeIds: numsFrom(p.get('ctypes')),
    departmentIds: numsFrom(p.get('depts')),
    statuses: stringsFrom(p.get('statuses')),
    managerIds: numsFrom(p.get('managers')),
    companyIds: numsFrom(p.get('companies')),
    delayedOnly: p.get('delayed') === '1',
    unassignedOnly: p.get('unassigned') === '1',
  }
}

function paramsFromFilters(f: CrossFilters, group: GroupKey, scale: TimeScale): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.dateFrom) p.set('from', f.dateFrom)
  if (f.dateTo) p.set('to', f.dateTo)
  if (f.projectIds.length) p.set('projects', f.projectIds.join(','))
  if (f.constructionTypeIds.length) p.set('ctypes', f.constructionTypeIds.join(','))
  if (f.departmentIds.length) p.set('depts', f.departmentIds.join(','))
  if (f.statuses.length) p.set('statuses', f.statuses.join(','))
  if (f.managerIds.length) p.set('managers', f.managerIds.join(','))
  if (f.companyIds.length) p.set('companies', f.companyIds.join(','))
  if (f.delayedOnly) p.set('delayed', '1')
  if (f.unassignedOnly) p.set('unassigned', '1')
  if (group !== 'project') p.set('group', group)
  if (scale !== 'day') p.set('scale', scale)
  return p
}

export default function CrossSchedule() {
  const { toast } = useApp()
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  // 案件指定つきルート（/projects/:id/schedule/cross）は対象案件で絞り込んだ状態で開く
  const scopedProjectId = Number(id) > 0 ? Number(id) : undefined

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams])
  const group = (searchParams.get('group') as GroupKey) || 'project'
  const scale: TimeScale = SCALE_OPTIONS.some((s) => s.key === searchParams.get('scale'))
    ? (searchParams.get('scale') as TimeScale)
    : 'day'

  const applyState = useCallback(
    (next: { filters?: CrossFilters; group?: GroupKey; scale?: TimeScale }) => {
      setSearchParams(
        paramsFromFilters(next.filters ?? filters, next.group ?? group, next.scale ?? scale),
        { replace: true },
      )
    },
    [filters, group, scale, setSearchParams],
  )
  const setFilters = useCallback((f: CrossFilters) => applyState({ filters: f }), [applyState])

  const { data, isLoading, isError, error, isFetching } = useCrossSchedule(filters, scopedProjectId)
  const { data: options } = useCrossScheduleOptions()
  // マイルストーンは milestones / milestone_types が正データ。工程名からは判定しない。
  // 既存の案件スコープを保ったまま1回でまとめて取得する（行ごと・案件ごとには呼ばない）。
  const milestoneFilters = useMemo(
    () => ({ ...EMPTY_MILESTONE_FILTERS, projectIds: filters.projectIds }),
    [filters.projectIds],
  )
  const { data: milestoneData } = useCrossMilestones(milestoneFilters, 'project', scopedProjectId)
  const updateTask = useUpdateCrossTask()

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [collapsedTasks, setCollapsedTasks] = useState<Set<number>>(new Set())
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; taskId: number } | null>(null)
  const [detailId, setDetailId] = useState<number | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(() => {
    const raw = localStorage.getItem(COLUMN_PREF_KEY)
    if (raw) {
      try {
        return new Set(JSON.parse(raw) as ColumnKey[])
      } catch {
        /* 壊れた設定は既定へ戻す */
      }
    }
    return new Set(DEFAULT_COLUMNS)
  })
  useEffect(() => {
    localStorage.setItem(COLUMN_PREF_KEY, JSON.stringify([...visibleColumns]))
  }, [visibleColumns])

  const tasks = useMemo(() => data?.tasks ?? [], [data])
  const taskById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])
  const parentIds = useMemo(() => {
    const s = new Set<number>()
    for (const t of tasks) if (t.parent_task_id) s.add(t.parent_task_id)
    return s
  }, [tasks])
  const wbsById = useMemo(() => new Map(tasks.map((t) => [t.id, t.wbs_code ?? String(t.id)])), [tasks])

  // 時間軸は対象工程の実期間から決める（固定の表示期間・固定の「今日」は持たない）
  // 表示範囲の決め方は案件工程と同じ rangeForScale を使い、画面ごとに別計算を作らない
  // マイルストーンの予定日・実績日も範囲の根拠に入れる（描く対象を時間軸の外に置かない）
  const range = useMemo(
    () => rangeForScale(
      scale,
      [
        ...tasks.map((t) => ({ start: t.planned_start_at, end: t.planned_finish_at })),
        ...(milestoneData?.milestones ?? []).flatMap((m) => [
          { start: m.planned_at, end: m.planned_at },
          { start: m.actual_at, end: m.actual_at },
        ]),
      ],
      // 「表示期間」を指定していれば時間軸もその期間に合わせる
      { explicit: { from: filters.dateFrom || undefined, to: filters.dateTo || undefined } },
    ),
    [scale, tasks, milestoneData, filters.dateFrom, filters.dateTo],
  )
  const timeline: Timeline = useMemo(
    () => createTimeline({
      scale, from: range.from, to: range.to,
      slotWidth: DEFAULT_SLOT_WIDTH[scale], holidays: JP_HOLIDAYS,
    }),
    [scale, range],
  )

  // ===== グループ化（同名でも別レコードなら別グループ。必ずIDで判定する） =====
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; sub?: string; sort: string; tasks: CrossTask[] }>()
    for (const t of tasks) {
      let key: string
      let label: string
      let sub: string | undefined
      let sort: string
      if (group === 'project') {
        key = `p:${t.project_id}`
        label = t.project_name
        sub = t.project_number
        sort = `1:${t.project_number}`
      } else if (group === 'manager') {
        key = t.manager_id ? `m:${t.manager_id}` : 'm:none'
        label = t.manager ?? '未割当'
        sub = t.manager_id ? `ID ${t.manager_id}` : undefined
        sort = t.manager_id ? `1:${t.manager ?? ''}:${String(t.manager_id).padStart(8, '0')}` : '2'
      } else {
        key = t.company_id ? `c:${t.company_id}` : 'c:none'
        label = t.company ?? '未割当'
        sub = t.company_id ? `ID ${t.company_id}` : undefined
        sort = t.company_id ? `1:${t.company ?? ''}:${String(t.company_id).padStart(8, '0')}` : '2'
      }
      const entry = map.get(key) ?? { key, label, sub, sort, tasks: [] }
      entry.tasks.push(t)
      map.set(key, entry)
    }
    // 未割当は最後。それ以外は表示名→IDの順で安定させる
    return [...map.values()].sort((a, b) => a.sort.localeCompare(b.sort, 'ja'))
  }, [tasks, group])

  /** 折りたたまれた親工程の配下か（同じグループ内に親がある場合だけ効かせる）。 */
  const isHiddenByParent = useCallback(
    (t: CrossTask, inGroup: Set<number>) => {
      let cur = t.parent_task_id
      const seen = new Set<number>()
      while (cur && !seen.has(cur)) {
        seen.add(cur)
        if (collapsedTasks.has(cur) && inGroup.has(cur)) return true
        cur = taskById.get(cur)?.parent_task_id ?? null
      }
      return false
    },
    [collapsedTasks, taskById],
  )

  const rows = useMemo(() => {
    const out: Row[] = []
    for (const g of groups) {
      out.push({
        kind: 'group', key: g.key, label: g.label, sub: g.sub,
        count: g.tasks.filter((t) => t.matched).length,
      })
      if (collapsedGroups.has(g.key)) continue
      const inGroup = new Set(g.tasks.map((t) => t.id))
      for (const t of g.tasks) {
        if (isHiddenByParent(t, inGroup)) continue
        out.push({
          kind: 'task',
          task: t,
          bar: toWbsTask(t, wbsById, parentIds),
          depth: t.parent_task_id && inGroup.has(t.parent_task_id) ? 1 : 0,
          hasChildren: g.tasks.some((x) => x.parent_task_id === t.id),
        })
      }
    }
    // 工程行のあとにマイルストーン帯を足す。先頭の行番号は変わらないため、
    // 依存線・今日線・ドラッグの座標は工程だけで完結したまま。
    for (const r of milestoneRowsByProject(milestoneData?.milestones ?? [])) {
      out.push({ kind: 'milestone', key: `ms-${r.projectId}`, label: r.label, sub: r.sub, items: r.items })
    }
    return out
  }, [groups, collapsedGroups, isHiddenByParent, wbsById, parentIds, milestoneData])

  const rowIndexByTaskId = useMemo(() => {
    const m = new Map<number, number>()
    rows.forEach((r, i) => { if (r.kind === 'task') m.set(r.task.id, i) })
    return m
  }, [rows])

  const bodyH = rows.length * ROW_H
  const totalW = timeline.totalWidth

  // 依存線は工程IDで結ぶ（案件をまたぐとWBS番号が重複するため名前では判定しない）
  const depLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; critical: boolean }[] = []
    for (const r of rows) {
      if (r.kind !== 'task' || !r.bar) continue
      const sr = rowIndexByTaskId.get(r.task.id)
      if (sr === undefined) continue
      for (const depId of r.task.dependencies) {
        const pr = rowIndexByTaskId.get(depId)
        const pred = taskById.get(depId)
        if (pr === undefined || !pred?.planned_start_at || !pred.planned_finish_at) continue
        const predBar = timeline.spanOf(pred.planned_start_at, pred.planned_finish_at)
        lines.push({
          x1: predBar.left + predBar.width,
          y1: pr * ROW_H + 11,
          x2: timeline.xOf(r.bar.planStartAt),
          y2: sr * ROW_H + 11,
          critical: r.task.is_delayed || pred.is_delayed,
        })
      }
    }
    return lines
  }, [rows, rowIndexByTaskId, taskById, timeline])

  // ===== ドラッグ（粒度に応じたスナップ。half_day は0.5日刻み） =====
  const ganttRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    taskId: number; projectId: number; mode: 'move' | 'resize'
    startX: number; s: string; e: string; precision: SchedulePrecision
  } | null>(null)
  const [preview, setPreview] = useState<{ taskId: number; ds: number; de: number } | null>(null)

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      // 列幅ではなく「1日あたりのピクセル数」で換算する（3時間・週・月表示でもずれない）
      const delta = snapDelta(ev.clientX - d.startX, timeline.pxPerDay, d.precision)
      setPreview(d.mode === 'move'
        ? { taskId: d.taskId, ds: delta, de: delta }
        : { taskId: d.taskId, ds: 0, de: delta })
    }
    async function onUp() {
      const d = dragRef.current
      const p = preview
      dragRef.current = null
      if (!d || !p || (p.ds === 0 && p.de === 0)) { setPreview(null); return }
      // ISO日時のまま日数をずらすため、午前/午後の区分は保たれる
      const planned_start_at = shiftDays(d.s, p.ds)
      const planned_finish_at = shiftDays(d.e, p.de)
      try {
        await updateTask.mutateAsync({
          id: d.taskId, projectId: d.projectId,
          name: taskById.get(d.taskId)?.name ?? '',
          planned_start_at, planned_finish_at,
          change_reason: '横断工程表のドラッグ変更',
          optimistic: { planned_start_at, planned_finish_at },
        })
        toast('日程変更を保存しました', 'ok')
      } catch (e) {
        toast(e instanceof ApiError ? e.message : '日程変更を保存できませんでした。表示は元に戻しました。', 'ng')
      } finally {
        setPreview(null)
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [preview, timeline.pxPerDay, taskById, toast, updateTask])

  function startDrag(e: React.PointerEvent, bar: WbsTask) {
    e.stopPropagation()
    const t = taskById.get(Number(bar.id))
    // 工程は名前に関係なくドラッグできる（マイルストーンは工程行に含めない）
    if (!t) return
    dragRef.current = {
      taskId: t.id, projectId: t.project_id, mode: 'move', startX: e.clientX,
      s: bar.planStartAt, e: bar.planEndAt, precision: bar.precision,
    }
  }
  function startResize(e: React.PointerEvent, bar: WbsTask) {
    startDrag(e, bar)
    if (dragRef.current) dragRef.current.mode = 'resize'
  }

  const scrollToToday = useCallback(() => {
    if (ganttRef.current && timeline.todayX !== null) {
      ganttRef.current.scrollLeft = Math.max(0, timeline.todayX - 200)
    }
  }, [timeline])
  useEffect(() => { scrollToToday() }, [scrollToToday])

  // ===== 更新（既存の工程更新APIを使う。失敗したら楽観更新を戻す） =====
  const patchTask = useCallback(
    async (t: CrossTask, input: Record<string, unknown>, optimistic: Partial<CrossTask>, message: string) => {
      try {
        await updateTask.mutateAsync({ id: t.id, projectId: t.project_id, name: t.name, ...input, optimistic })
        toast(message, 'ok')
      } catch (e) {
        toast(e instanceof ApiError ? e.message : '保存できませんでした。表示は元に戻しました。', 'ng')
      }
    },
    [toast, updateTask],
  )

  const menuTask = menu ? taskById.get(menu.taskId) ?? null : null
  const menuItems: MenuItem[] = menuTask
    ? [
        { label: '工程の詳細を表示', icon: Eye, onClick: () => setDetailId(menuTask.id) },
        { label: 'この案件の工程を開く', icon: ExternalLink, onClick: () => navigate(`/projects/${menuTask.project_id}/schedule`) },
        { label: '', onClick: () => {}, divider: true },
        { label: '進捗を更新', icon: TrendingUp, onClick: () => setDetailId(menuTask.id) },
        { label: '担当者を変更', icon: UserPlus, onClick: () => setDetailId(menuTask.id) },
        { label: '担当会社を変更', icon: Building2, onClick: () => setDetailId(menuTask.id) },
      ]
    : []

  const shownColumns: Column[] = COLUMNS.filter((c) => ALWAYS_ON.includes(c.key) || visibleColumns.has(c.key))
  const stickyLefts = new Map<ColumnKey, number>()
  {
    let acc = 0
    for (const c of shownColumns) {
      if (!c.sticky) break
      stickyLefts.set(c.key, acc)
      acc += c.w
    }
  }

  const detailTask = detailId !== null ? taskById.get(detailId) ?? null : null
  const detections = data?.detections ?? []

  return (
    <div>
      {/* 画面用の見出しと操作ボタン。印刷では PrintHeader が代わりを務める */}
      <div data-print="hide">
      <PageHeader
        breadcrumb={[{ label: '案件一覧', to: '/projects' }, { label: '工程管理', to: '/schedule' }, { label: '横断工程' }]}
        title="横断工程"
        description={`${scopedProjectId ? '対象案件で絞り込み中 ／ ' : ''}複数案件の工程を1画面で確認します${isFetching ? '（更新中...）' : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded border border-line bg-white p-0.5">
              {GROUPS.map((g) => (
                <button
                  key={g.key}
                  onClick={() => applyState({ group: g.key })}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${group === g.key ? 'bg-sysken-500 text-white' : 'text-ink hover:bg-canvas'}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {/* 表示単位は案件工程と同じ共通部品。3時間も直接選べる */}
            <ScaleSelector scale={scale} onChange={(s) => applyState({ scale: s })} />
          </div>
        }
      />

        <ScheduleTabs projectId={scopedProjectId} />
      </div>

      {/* 印刷時だけ出す見出し（画面・Excel・PDF と同じ条件・同じ件数であることを紙面にも残す） */}
      <PrintHeader
        filters={filters}
        options={options}
        group={group}
        total={data?.total ?? 0}
        shown={data?.tasks.filter((t) => t.matched).length ?? 0}
        scopedProjectId={scopedProjectId}
      />

      {/* ツールバー */}
      <div data-print="hide" className="mb-2 flex flex-wrap items-center gap-2 rounded border border-line bg-white px-2 py-1.5">
        <input
          className="field !w-56 !py-1 text-xs"
          placeholder="工程名・案件名・WBS・備考"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
        />
        <ToolButton icon={Filter} label="絞り込み" onClick={() => setFilterOpen((v) => !v)} />
        <ToolButton icon={SlidersHorizontal} label="表示項目" onClick={() => setColumnsOpen(true)} />
        <ToolButton icon={RotateCcw} label="条件をクリア" onClick={() => setFilters(EMPTY_FILTERS)} disabled={!hasAnyFilter(filters)} />
        <ToolButton icon={Crosshair} label="今日へ移動" onClick={scrollToToday} />
        <div className="mx-1 h-6 w-px bg-line" />
        <ExportButtons filters={filters} projectId={scopedProjectId} disabled={!data || data.total === 0} />
        <div className="mx-1 h-6 w-px bg-line" />
        <SavedSearchBar filters={filters} onApply={setFilters} />
        <span className="ml-auto text-xs text-ink-soft">
          {isLoading ? '検索中…' : isError ? '取得に失敗しました' : `${data?.total ?? 0} 件`}
        </span>
      </div>

      {filterOpen && options && (
        <div data-print="hide">
          <FilterPanel filters={filters} options={options} onChange={setFilters} />
        </div>
      )}

      {/* 検索中 / 取得失敗 / 0件 を区別して表示する（ダミー工程は出さない） */}
      {isError && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-4 py-3 text-center text-[13px] text-ng">
          工程データの取得に失敗しました（{error instanceof ApiError ? error.message : '原因不明のエラー'}）。
          ネットワーク接続とAPIの状態をご確認ください。
        </div>
      )}
      {isLoading && (
        <div className="mb-2 rounded border border-line bg-white px-4 py-6 text-center text-[13px] text-ink-soft">
          工程を検索しています…
        </div>
      )}
      {!isLoading && !isError && data?.total === 0 && (
        <div className="mb-2 rounded border border-line bg-white px-4 py-8 text-center text-[13px] text-ink-soft">
          <p className="font-medium text-ink">条件に一致する工程はありません</p>
          <p className="mt-1">絞り込み条件を変更するか、「条件をクリア」で全件表示に戻してください。</p>
        </div>
      )}
      {data?.truncated && (
        <div className="mb-2 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-ink">
          <AlertTriangle size={15} className="text-wn" />
          該当 {data.total} 件のうち先頭 {data.limit} 件のみ表示しています。絞り込み条件を追加してください。
        </div>
      )}

      {range.narrowed && (
        <div data-print="hide" className="mb-2 rounded border border-line bg-white px-3 py-1.5 text-[12px] text-ink-soft">
          3時間表示は1日が8列になるため、現在日を中心とした期間だけを表示しています。
          全期間を確認するときは「日」以上の表示単位に切り替えてください。
        </div>
      )}
      {!!detections.length && (
        <div data-print="hide">
          <DetectionPanel detections={detections} />
        </div>
      )}

      {/*
        一覧＋ガント。
        items-start が必須。既定の stretch だと左右の枠が親と同じ高さに引き伸ばされ、
        overflow-x-auto の指定によって縦方向も auto 扱いになり、それぞれが独立した
        スクロール枠になってしまう（左の一覧だけがスクロールして右のガントとずれる）。
        items-start で各枠の高さを内容と同じにすると、縦スクロールは外側の1箇所だけに
        なり、左一覧と右ガントの縦位置が常に一致する。
      */}
      <Panel className="overflow-hidden" bodyClassName="p-0">
        <div data-print="sheet" className="thin-scroll flex max-h-[calc(100vh-380px)] items-start overflow-y-auto">
          {/* 印刷はこの工程一覧が本体なので、紙面いっぱいまで広げる（data-print="wide"） */}
          <div data-print="wide" className="thin-scroll shrink-0 overflow-x-auto border-r border-line"
               style={{ width: LEFT_PANE_W }}>
            <table className="grid-table text-[12.5px]">
              <thead className="sticky top-0 z-20 bg-canvas">
                <tr>
                  {shownColumns.map((c) => (
                    <th
                      key={c.key}
                      className={`h-16 border-r border-line px-2 pb-2 text-left align-bottom text-[12.5px] font-semibold text-ink-soft ${c.sticky ? 'sticky z-10 bg-canvas' : ''}`}
                      style={{ width: c.w, minWidth: c.w, left: c.sticky ? stickyLefts.get(c.key) : undefined }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) =>
                  r.kind === 'group' ? (
                    <tr key={`g-${r.key}`} style={{ height: ROW_H }} className="bg-sysken-50">
                      <td colSpan={shownColumns.length} className="border-r border-line px-2">
                        <button
                          className="flex w-full items-center gap-1.5 text-left"
                          onClick={() => setCollapsedGroups((prev) => {
                            const n = new Set(prev)
                            if (n.has(r.key)) n.delete(r.key)
                            else n.add(r.key)
                            return n
                          })}
                        >
                          {collapsedGroups.has(r.key) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          <span className="truncate font-semibold text-ink">{r.label}</span>
                          {r.sub && <span className="shrink-0 text-[11px] text-ink-soft">{r.sub}</span>}
                          <span className="ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] text-ink-soft ring-1 ring-line">
                            {r.count} 件
                          </span>
                        </button>
                      </td>
                    </tr>
                  ) : r.kind === 'milestone' ? (
                    // 印刷はガントを載せない工程一覧の帳票なので、マーカーだけの
                    // マイルストーン帯は紙面から外す（工程件数と混ざらないようにする）
                    <tr key={r.key} data-print="hide" data-milestone-row={r.sub}
                        style={{ height: ROW_H }} className="bg-sysken-50/60">
                      <td colSpan={shownColumns.length} className="border-r border-line px-2">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rotate-45 bg-sysken-600" />
                          <span className="truncate font-semibold text-ink">マイルストーン</span>
                          <span className="shrink-0 text-[11px] text-ink-soft">{r.sub} {r.label}</span>
                          <span className="ml-auto shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] text-ink-soft ring-1 ring-line">
                            {r.items.length} 件
                          </span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <TaskRow
                      key={`t-${r.task.id}`}
                      row={r}
                      columns={shownColumns}
                      stickyLefts={stickyLefts}
                      selected={selectedId === r.task.id}
                      collapsed={collapsedTasks.has(r.task.id)}
                      onToggle={() => setCollapsedTasks((prev) => {
                        const n = new Set(prev)
                        if (n.has(r.task.id)) n.delete(r.task.id)
                        else n.add(r.task.id)
                        return n
                      })}
                      onSelect={() => setSelectedId(r.task.id)}
                      onOpen={() => setDetailId(r.task.id)}
                      onContext={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, taskId: r.task.id }) }}
                    />
                  ),
                )}
              </tbody>
            </table>
          </div>

          {/* ガントは紙面の幅に収まらないため印刷しない（工程一覧を印刷する） */}
          <div ref={ganttRef} data-print="hide" className="thin-scroll flex-1 overflow-x-auto">
            <div style={{ width: totalW }}>
              <GanttHeader timeline={timeline} />
              <div className="relative" style={{ height: bodyH }}>
                <GanttGrid timeline={timeline} height={bodyH} />
                {rows.map((r, i) => (
                  <div
                    key={`row-${i}`}
                    className={`absolute left-0 border-b border-line/60 ${
                      r.kind === 'group' ? 'bg-sysken-50' : r.kind === 'milestone' ? 'bg-sysken-50/60' : ''}`}
                    style={{ top: i * ROW_H, height: ROW_H, width: totalW }}
                  />
                ))}
                <DependencyLines lines={depLines} width={totalW} height={bodyH} />
                {rows.map((r, i) =>
                  r.kind === 'milestone' ? (
                    <MilestoneMarkers
                      key={r.key}
                      items={r.items}
                      row={i}
                      timeline={timeline}
                      onOpen={(m) => navigate(
                        `/schedule/milestones?projects=${m.project_id}`
                        + (m.milestone_type_id ? `&types=${m.milestone_type_id}` : ''),
                      )}
                    />
                  ) : null,
                )}
                {rows.map((r, i) =>
                  r.kind === 'task' && r.bar ? (
                    <GanttRow
                      key={`bar-${r.task.id}`}
                      task={r.bar}
                      row={i}
                      timeline={timeline}
                      preview={preview?.taskId === r.task.id ? preview : null}
                      onStartDrag={(e, bar, mode) => (mode === 'resize' ? startResize(e, bar) : startDrag(e, bar))}
                      onContext={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, taskId: r.task.id }) }}
                      onSelect={() => setSelectedId(r.task.id)}
                      onOpenProgress={() => setDetailId(r.task.id)}
                    />
                  ) : null,
                )}
                <TodayLine timeline={timeline} height={bodyH} />
              </div>
            </div>
          </div>
        </div>
        <div data-print="hide">
          <GanttLegend note="工程バーはドラッグで移動（0.5日単位の工程は0.5日刻み）／右端で期間変更 ／ 右クリックで操作メニュー" />
        </div>
      </Panel>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}

      <TaskDetailModal
        task={detailTask}
        options={options}
        saving={updateTask.isPending}
        onClose={() => setDetailId(null)}
        onOpenProject={(pid) => navigate(`/projects/${pid}/schedule`)}
        onPatch={patchTask}
      />

      <ColumnSettings
        open={columnsOpen}
        visible={visibleColumns}
        onClose={() => setColumnsOpen(false)}
        onChange={setVisibleColumns}
      />
    </div>
  )
}

function ToolButton({
  icon: Icon, label, onClick, disabled,
}: {
  icon: typeof Filter
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-ink hover:bg-canvas disabled:opacity-40"
    >
      <Icon size={15} className="text-sysken-600" />
      {label}
    </button>
  )
}

/**
 * 印刷時だけ紙面に出す見出し。
 * 出力日時・出力者・適用した検索条件・対象件数を残し、画面／Excel／PDF と
 * 同じ条件・同じ件数で出力されたことを紙の上でも確認できるようにする。
 */
function PrintHeader({
  filters, options, group, total, shown, scopedProjectId,
}: {
  filters: CrossFilters
  options: CrossScheduleOptions | undefined
  group: GroupKey
  total: number
  shown: number
  scopedProjectId?: number
}) {
  const { user } = useAuth()
  const nameOf = (items: IdName[] | undefined, ids: number[]) =>
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
    conditions.push(['表示期間', `${filters.dateFrom || '—'} 〜 ${filters.dateTo || '—'}`])
  }
  if (filters.projectIds.length) {
    conditions.push(['案件', filters.projectIds.map((id) => {
      const p = options?.projects.find((x) => x.id === id)
      return p ? `${p.construction_number} ${p.name}` : `ID ${id}`
    }).join('、')])
  }
  if (filters.constructionTypeIds.length) conditions.push(['工事区分・業種', nameOf(options?.construction_types, filters.constructionTypeIds)])
  if (filters.departmentIds.length) conditions.push(['部署', nameOf(options?.departments, filters.departmentIds)])
  if (filters.managerIds.length) conditions.push(['担当者', nameOf(options?.managers, filters.managerIds)])
  if (filters.companyIds.length) conditions.push(['担当会社', nameOf(options?.companies, filters.companyIds)])
  if (filters.statuses.length) conditions.push(['状態', filters.statuses.join('、')])
  if (filters.delayedOnly) conditions.push(['遅延のみ', 'はい'])
  if (filters.unassignedOnly) conditions.push(['未割当のみ', 'はい'])
  if (!conditions.length) conditions.push(['検索条件', '指定なし（全件）'])

  return (
    <div data-print="only" className="hidden">
      <h1 className="mb-1 text-[16px] font-bold text-ink">横断工程表</h1>
      <table className="mb-3 text-[11px]">
        <tbody>
          <tr>
            <th className="pr-2 text-left font-semibold">出力日時</th>
            <td className="pr-6">{formatJst(nowJst(), 'yyyy/MM/dd HH:mm')}</td>
            <th className="pr-2 text-left font-semibold">出力者</th>
            <td className="pr-6">{user ? `${user.name}（${user.role}）` : '—'}</td>
            <th className="pr-2 text-left font-semibold">表示の切替</th>
            <td className="pr-6">{GROUPS.find((g) => g.key === group)?.label ?? '—'}</td>
            <th className="pr-2 text-left font-semibold">対象工程数</th>
            <td>{total} 件{shown !== total ? `（表示 ${shown} 件）` : ''}</td>
          </tr>
          {conditions.map(([label, value]) => (
            <tr key={label}>
              <th className="pr-2 text-left align-top font-semibold">{label}</th>
              <td colSpan={7}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ===== 一覧の1行 =====
function TaskRow({
  row, columns, stickyLefts, selected, collapsed, onToggle, onSelect, onOpen, onContext,
}: {
  row: Extract<Row, { kind: 'task' }>
  columns: Column[]
  stickyLefts: Map<ColumnKey, number>
  selected: boolean
  collapsed: boolean
  onToggle: () => void
  onSelect: () => void
  onOpen: () => void
  onContext: (e: React.MouseEvent) => void
}) {
  const t = row.task
  const precision = (t.schedule_precision as WbsTask['precision']) ?? 'day'
  const bg = selected ? '#e9f2fa' : row.hasChildren ? '#f8fafc' : '#fff'

  function cell(key: ColumnKey) {
    switch (key) {
      case 'wbs':
        return <span className="tabular-nums text-ink-soft">{t.wbs_code ?? '—'}</span>
      case 'project':
        return <span className="block truncate text-ink-soft" title={`${t.project_number} ${t.project_name}`}>{t.project_name}</span>
      case 'name':
        return (
          <div className="flex items-center gap-1" style={{ paddingLeft: row.depth * 12 }}>
            {row.hasChildren ? (
              <button onClick={(e) => { e.stopPropagation(); onToggle() }} className="text-ink-soft">
                <span className="inline-block w-3">{collapsed ? '▶' : '▼'}</span>
              </button>
            ) : (
              <span className="inline-block w-3" />
            )}
            <span className={`truncate ${row.hasChildren ? 'font-semibold text-ink' : 'text-ink'} ${t.matched ? '' : 'opacity-60'}`}>
              {t.name}
            </span>
          </div>
        )
      case 'manager':
        return <span className={t.manager_id ? 'text-ink-soft' : 'text-wn'}>{t.manager ?? '未割当'}</span>
      case 'company':
        return <span className={`block truncate ${t.company_id ? 'text-ink-soft' : 'text-wn'}`} title={t.company ?? ''}>{t.company ?? '未割当'}</span>
      case 'planStart':
        return <span className="tabular-nums text-ink-soft">{t.planned_start_at ? edgeLabel(t.planned_start_at, 'start', precision) : '—'}</span>
      case 'planEnd':
        return <span className="tabular-nums text-ink-soft">{t.planned_finish_at ? edgeLabel(t.planned_finish_at, 'end', precision) : '—'}</span>
      case 'actualStart':
        return <span className="tabular-nums text-ink-soft">{t.actual_start_at ? edgeLabel(t.actual_start_at, 'start', precision) : '—'}</span>
      case 'actualEnd':
        return <span className="tabular-nums text-ink-soft">{t.actual_finish_at ? edgeLabel(t.actual_finish_at, 'end', precision) : '—'}</span>
      case 'planDays':
        return <span className="block text-center tabular-nums text-ink-soft">{row.bar ? row.bar.planDays : '—'}</span>
      case 'progress':
        return <span className="block text-right tabular-nums font-medium">{t.actual_progress}%</span>
      case 'planPeople':
        return <span className="block text-center tabular-nums text-ink-soft">{t.planned_workers}</span>
      case 'actualPeople':
        return <span className="block text-center tabular-nums text-ink-soft">{t.actual_workers || '—'}</span>
      case 'status':
        return <StatusBadge status={t.status} />
      case 'delay':
        return t.is_delayed ? <span className="text-ng">遅延</span> : <span className="text-ink-soft">—</span>
      case 'notes':
        return <span className="block truncate text-ink-soft" title={t.notes ?? ''}>{t.notes || '—'}</span>
    }
  }

  return (
    <tr style={{ height: ROW_H }} className="cursor-pointer" onClick={onSelect} onDoubleClick={onOpen} onContextMenu={onContext}>
      {columns.map((c) => (
        <td
          key={c.key}
          className={`border-r border-line px-2 ${c.sticky ? 'sticky z-10' : ''}`}
          style={{ width: c.w, minWidth: c.w, left: c.sticky ? stickyLefts.get(c.key) : undefined, background: bg }}
        >
          {cell(c.key)}
        </td>
      ))}
    </tr>
  )
}

// ===== 絞り込み =====
function FilterPanel({
  filters, options, onChange,
}: {
  filters: CrossFilters
  options: CrossScheduleOptions
  onChange: (f: CrossFilters) => void
}) {
  function multi(
    label: string,
    values: number[],
    items: { id: number; name: string; sub?: string }[],
    apply: (v: number[]) => void,
  ) {
    return (
      <div>
        <label className="label">{label}</label>
        <select
          multiple
          className="field h-24 !py-1 text-xs"
          value={values.map(String)}
          onChange={(e) => apply([...e.target.selectedOptions].map((o) => Number(o.value)))}
        >
          {items.map((it) => (
            <option key={it.id} value={it.id}>{it.name}{it.sub ? `（${it.sub}）` : ''}</option>
          ))}
        </select>
      </div>
    )
  }

  return (
    <div className="mb-2 grid grid-cols-2 gap-3 rounded border border-line bg-white px-3 py-3 md:grid-cols-4 xl:grid-cols-6">
      <div>
        <label className="label">表示期間（開始）</label>
        <input type="date" className="field !py-1 text-xs" value={filters.dateFrom} onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })} />
      </div>
      <div>
        <label className="label">表示期間（終了）</label>
        <input type="date" className="field !py-1 text-xs" value={filters.dateTo} onChange={(e) => onChange({ ...filters, dateTo: e.target.value })} />
      </div>
      {multi('案件', filters.projectIds,
        options.projects.map((p) => ({ id: p.id, name: p.name, sub: p.construction_number })),
        (v) => onChange({ ...filters, projectIds: v }))}
      {multi('工事区分・業種', filters.constructionTypeIds, options.construction_types,
        (v) => onChange({ ...filters, constructionTypeIds: v }))}
      {multi('部署', filters.departmentIds, options.departments,
        (v) => onChange({ ...filters, departmentIds: v }))}
      {/* 同名の担当者・担当会社を区別できるようIDを併記する */}
      {multi('担当者', filters.managerIds, options.managers.map((m) => ({ ...m, sub: `ID ${m.id}` })),
        (v) => onChange({ ...filters, managerIds: v }))}
      {multi('担当会社', filters.companyIds, options.companies.map((c) => ({ ...c, sub: `ID ${c.id}` })),
        (v) => onChange({ ...filters, companyIds: v }))}
      <div>
        <label className="label">状態</label>
        <select
          multiple
          className="field h-24 !py-1 text-xs"
          value={filters.statuses}
          onChange={(e) => onChange({ ...filters, statuses: [...e.target.selectedOptions].map((o) => o.value) })}
        >
          {options.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex flex-col justify-end gap-1.5 pb-1 text-[13px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={filters.delayedOnly} onChange={(e) => onChange({ ...filters, delayedOnly: e.target.checked })} />
          遅延のみ
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={filters.unassignedOnly} onChange={(e) => onChange({ ...filters, unassignedOnly: e.target.checked })} />
          未割当のみ
        </label>
      </div>
    </div>
  )
}

// ===== 表示項目設定 =====
function ColumnSettings({
  open, visible, onClose, onChange,
}: {
  open: boolean
  visible: Set<ColumnKey>
  onClose: () => void
  onChange: (v: Set<ColumnKey>) => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="表示項目の設定"
      footer={
        <>
          <button className="btn-default" onClick={() => onChange(new Set(DEFAULT_COLUMNS))}>既定に戻す</button>
          <button className="btn-primary" onClick={onClose}>閉じる</button>
        </>
      }
    >
      <p className="mb-3 text-[12px] text-ink-soft">
        WBS・案件名・工程名は横スクロールしても常に表示するため、非表示にできません。
      </p>
      <div className="grid grid-cols-2 gap-2 text-[13px] md:grid-cols-3">
        {COLUMNS.map((c) => {
          const locked = ALWAYS_ON.includes(c.key)
          return (
            <label key={c.key} className={`flex items-center gap-1.5 ${locked ? 'opacity-50' : ''}`}>
              <input
                type="checkbox"
                disabled={locked}
                checked={locked || visible.has(c.key)}
                onChange={(e) => {
                  const n = new Set(visible)
                  if (e.target.checked) n.add(c.key)
                  else n.delete(c.key)
                  onChange(n)
                }}
              />
              {c.label}
            </label>
          )
        })}
      </div>
    </Modal>
  )
}

// ===== システム検知（確定計算。AI予測ではない） =====
function DetectionPanel({ detections }: { detections: SystemDetection[] }) {
  const tone: Record<string, string> = {
    high: 'border-red-200 bg-red-50 text-ng',
    medium: 'border-amber-200 bg-amber-50 text-ink',
    low: 'border-line bg-white text-ink-soft',
  }
  return (
    <div className="mb-2 rounded border border-line bg-white px-3 py-2">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <AlertTriangle size={15} className="text-wn" />
        <span className="text-[13px] font-semibold text-ink">システム検知（確定計算）</span>
        <span className="text-[11px] text-ink-soft">
          保存済みの日時と割当だけから機械的に判定した結果です。AIによる予測ではありません。
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {detections.map((d) => (
          <span key={d.kind} className={`rounded border px-2 py-1 text-[12px] ${tone[d.severity] ?? tone.low}`} title={d.message}>
            <span className="font-medium">{d.label}</span>
            <span className="ml-1.5 tabular-nums">{d.task_ids.length} 件</span>
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-soft">
        AIによる工期・遅延の予測は未解析です。解析結果が保存されると、モデル名・バージョン・解析日時・
        確信度・主な予測要因・人による確認結果とあわせてここに表示します。
      </p>
    </div>
  )
}

// ===== 出力（現在の絞り込み条件と表示順を反映） =====
function ExportButtons({ filters, projectId, disabled }: { filters: CrossFilters; projectId?: number; disabled: boolean }) {
  const { toast } = useApp()
  const [busy, setBusy] = useState<'xlsx' | 'pdf' | null>(null)

  async function run(format: 'xlsx' | 'pdf') {
    setBusy(format)
    try {
      await downloadCrossSchedule(filters, format, projectId)
      toast(`${format === 'xlsx' ? 'Excel' : 'PDF'}を出力しました（現在の絞り込み条件を反映）`, 'ok')
    } catch (e) {
      toast(e instanceof Error ? e.message : '出力に失敗しました', 'ng')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <ToolButton icon={FileDown} label={busy === 'xlsx' ? '出力中…' : 'Excel'} onClick={() => void run('xlsx')} disabled={disabled || busy !== null} />
      <ToolButton icon={FileDown} label={busy === 'pdf' ? '出力中…' : 'PDF'} onClick={() => void run('pdf')} disabled={disabled || busy !== null} />
      <ToolButton icon={Printer} label="印刷" onClick={() => window.print()} disabled={disabled} />
    </>
  )
}

// ===== 保存検索条件（DBに保存する） =====
function SavedSearchBar({ filters, onApply }: { filters: CrossFilters; onApply: (f: CrossFilters) => void }) {
  const { toast } = useApp()
  const { data: saved = [] } = useSavedSearches()
  const create = useCreateSavedSearch()
  const remove = useDeleteSavedSearch()
  const [selected, setSelected] = useState('')

  async function save() {
    const name = window.prompt('この検索条件に名前を付けて保存します')
    if (!name?.trim()) return
    try {
      await create.mutateAsync({ name: name.trim(), conditions: filters })
      toast('検索条件を保存しました', 'ok')
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
      <select
        className="field !w-40 !py-1 text-xs"
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value)
          const row = saved.find((s) => String(s.id) === e.target.value)
          if (row) onApply({ ...EMPTY_FILTERS, ...row.conditions })
        }}
      >
        <option value="">保存した条件</option>
        {saved.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <button onClick={() => void save()} className="rounded px-1.5 py-1 text-xs text-ink hover:bg-canvas" title="現在の条件を保存">
        <Save size={15} className="text-sysken-600" />
      </button>
      <button onClick={() => void del()} disabled={!selected} className="rounded px-1.5 py-1 text-xs hover:bg-canvas disabled:opacity-40" title="選択中の条件を削除">
        <Trash2 size={15} className="text-ng" />
      </button>
    </div>
  )
}

// ===== 工程の詳細・編集 =====
function TaskDetailModal({
  task, options, saving, onClose, onOpenProject, onPatch,
}: {
  task: CrossTask | null
  options: CrossScheduleOptions | undefined
  saving: boolean
  onClose: () => void
  onOpenProject: (projectId: number) => void
  onPatch: (t: CrossTask, input: Record<string, unknown>, optimistic: Partial<CrossTask>, message: string) => Promise<void>
}) {
  const [progress, setProgress] = useState(0)
  const [managerId, setManagerId] = useState('')
  const [companyId, setCompanyId] = useState('')

  useEffect(() => {
    if (!task) return
    setProgress(task.actual_progress)
    setManagerId(task.manager_id ? String(task.manager_id) : '')
    setCompanyId(task.company_id ? String(task.company_id) : '')
  }, [task])

  if (!task) return null

  const precision = (task.schedule_precision as WbsTask['precision']) ?? 'day'
  const managers = options?.managers ?? []
  const companies = options?.companies ?? []

  async function apply() {
    if (!task) return
    // 担当者・担当会社は表示名ではなくIDで更新する
    const nextManager = managerId ? Number(managerId) : null
    const nextCompany = companyId ? Number(companyId) : null
    await onPatch(
      task,
      {
        actual_progress: progress,
        status: progress >= 100 ? '完了' : progress > 0 && task.status === '未着手' ? '施工中' : task.status,
        manager_id: nextManager,
        company_id: nextCompany,
        change_reason: '横断工程表から更新',
      },
      {
        actual_progress: progress,
        manager_id: nextManager,
        manager: managers.find((m) => m.id === nextManager)?.name ?? null,
        company_id: nextCompany,
        company: companies.find((c) => c.id === nextCompany)?.name ?? null,
      },
      `「${task.name}」を更新しました`,
    )
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`工程の詳細：${task.name}`}
      size="lg"
      footer={
        <>
          <button className="btn-default" onClick={() => onOpenProject(task.project_id)}>この案件の工程を開く</button>
          <button className="btn-default" onClick={onClose}>キャンセル</button>
          <button className="btn-primary" disabled={saving} onClick={() => void apply()}>{saving ? '保存中…' : '保存'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-[13px] md:grid-cols-3">
          <Info label="案件" value={`${task.project_number} ${task.project_name}`} />
          <Info label="WBS" value={task.wbs_code ?? '—'} />
          <Info label="工種 / 工程種別" value={`${task.work_type ?? '—'} / ${task.process_type ?? '—'}`} />
          <Info
            label="予定期間"
            value={task.planned_start_at && task.planned_finish_at
              ? formatPeriod(task.planned_start_at, task.planned_finish_at, precision)
              : '—'}
          />
          <Info
            label="実績期間"
            value={task.actual_start_at
              ? formatPeriod(task.actual_start_at, task.actual_finish_at ?? toJstIsoString(nowJst()), precision)
              : '未入力'}
          />
          <Info label="状態" value={`${task.status}${task.is_delayed ? '（遅延）' : ''}`} />
          <Info label="予定人工 / 実績人工" value={`${task.planned_workers} / ${task.actual_workers}`} />
          <Info label="入力粒度" value={precision === 'half_day' ? '0.5日単位（午前・午後）' : precision === 'time' ? '時刻指定' : '1日単位'} />
          <Info label="ドラッグの刻み" value={`${snapStepOf(precision)} 日`} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">担当者</label>
            <select className="field" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
              <option value="">未割当</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.name}（ID {m.id}）</option>)}
            </select>
          </div>
          <div>
            <label className="label">担当会社</label>
            <select className="field" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
              <option value="">未割当</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}（ID {c.id}）</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">進捗率：{progress}%</label>
          <input type="range" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="w-full accent-sysken-500" />
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-sysken-500" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {task.notes && (
          <div>
            <p className="text-[11px] text-ink-soft">備考</p>
            <p className="whitespace-pre-wrap text-[13px] text-ink">{task.notes}</p>
          </div>
        )}
      </div>
    </Modal>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-ink-soft">{label}</p>
      <p className="font-medium text-ink">{value}</p>
    </div>
  )
}
