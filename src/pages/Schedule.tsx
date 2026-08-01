import { useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Plus, FolderPlus, CornerDownRight, Pencil, Trash2, Copy, ClipboardPaste,
  Undo2, Redo2, UserPlus, Users2, TrendingUp, Save, SlidersHorizontal, Filter,
  Crosshair, CheckCircle2, Link2, Eye, Maximize2,
} from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { ContextMenu, type MenuItem } from '../components/ui/ContextMenu'
import { useApp } from '../context/AppContext'
import { useCreateTask, useDeleteTask, useProjectTasks, useUpdateTask, type TaskWriteInput } from '../api/tasks'
import { useProject, useProjects } from '../api/projects'
import { ApiError } from '../lib/apiClient'
import type { WbsTask } from '../types'

import {
  createTimeline, DEFAULT_SLOT_WIDTH, durationInDays, endAtOf, formatPeriod, jstDateKey, nowJst,
  rangeForScale, shiftDays, snapDelta, splitEndAt, splitStartAt, startAtOf,
  type HalfDay, type SchedulePrecision, type TimeScale, type Timeline,
} from '../lib/timeline'
import { JP_HOLIDAYS } from '../lib/holidays'
import { ScheduleTabs } from './schedule/ScheduleTabs'
import {
  DependencyLines, edgeLabel, GanttGrid, GanttHeader, GanttLegend, GanttRow, ROW_H,
  SCALE_OPTIONS, ScaleSelector, TodayLine,
} from './schedule/GanttParts'

const LEFT_COLS = [
  { key: 'wbs', label: 'WBS', w: 46 },
  { key: 'name', label: '工程名', w: 176 },
  { key: 'workType', label: '工種', w: 72 },
  { key: 'crew', label: '担当班', w: 68 },
  { key: 'manager', label: '責任者', w: 76 },
  { key: 'planStart', label: '開始予定', w: 82 },
  { key: 'planEnd', label: '終了予定', w: 82 },
  { key: 'actualStart', label: '開始実績', w: 82 },
  { key: 'actualEnd', label: '終了実績', w: 82 },
  { key: 'planDays', label: '予定', w: 44 },
  { key: 'progress', label: '進捗', w: 52 },
  { key: 'planPeople', label: '予定人', w: 52 },
  { key: 'actualPeople', label: '実績人', w: 52 },
  { key: 'status', label: 'ステータス', w: 78 },
  { key: 'pred', label: '先行', w: 48 },
]

export default function Schedule() {
  const { toast, confirm } = useApp()
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: projects = [] } = useProjects()
  const requestedId = Number(id ?? searchParams.get('project_id'))
  const projectId = Number.isFinite(requestedId) && requestedId > 0 ? requestedId : projects[0]?.id
  const { data: project } = useProject(projectId)
  const { data: apiTasks, isLoading: tasksLoading, isError: tasksError } = useProjectTasks(projectId)
  const createTaskMutation = useCreateTask(projectId ?? 0)
  const updateTaskMutation = useUpdateTask(projectId ?? 0)
  const deleteTaskMutation = useDeleteTask(projectId ?? 0)
  const [tasks, setTasks] = useState<WbsTask[]>([])

  // API取得（read）→ ローカルstateへ。取得失敗時は固定ダミーへフォールバックしない。
  useEffect(() => {
    if (apiTasks) setTasks(apiTasks.map((t) => ({ ...t })))
  }, [apiTasks])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  // 表示単位はURLクエリで保持する（再読込・URL共有でも同じ単位で開ける）
  const scale = (SCALE_OPTIONS.some((s) => s.key === searchParams.get('scale'))
    ? (searchParams.get('scale') as TimeScale)
    : 'day')
  const setScale = useCallback((next: TimeScale) => {
    const p = new URLSearchParams(searchParams)
    if (next === 'day') p.delete('scale')
    else p.set('scale', next)
    setSearchParams(p, { replace: true })
  }, [searchParams, setSearchParams])
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [progressModal, setProgressModal] = useState<WbsTask | null>(null)
  const [progressVal, setProgressVal] = useState(0)
  const [forecastOpen, setForecastOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit' | 'copy'; parent?: WbsTask; task?: WbsTask } | null>(null)

  const ganttRef = useRef<HTMLDivElement>(null)

  // 時間軸は工程の実期間から動的に決める（固定の表示期間・固定の「今日」は持たない）。
  // ヘッダーもバーもこの timeline を唯一の基準にするため、両者がずれない。
  // 表示範囲の決め方は横断工程と同じ rangeForScale を使い、画面ごとに別計算を作らない。
  const range = useMemo(
    () => rangeForScale(scale, tasks.map((t) => ({ start: t.planStartAt, end: t.planEndAt }))),
    [scale, tasks],
  )
  const timeline: Timeline = useMemo(
    () => createTimeline({
      scale, from: range.from, to: range.to,
      slotWidth: DEFAULT_SLOT_WIDTH[scale], holidays: JP_HOLIDAYS,
    }),
    [scale, range],
  )

  // ドラッグ
  const dragRef = useRef<{
    id: string; mode: 'move' | 'resize'; startX: number; s: string; e: string; precision: SchedulePrecision
  } | null>(null)
  const [preview, setPreview] = useState<{ id: string; ds: number; de: number } | null>(null)

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      // 列幅ではなく「1日あたりのピクセル数」で換算する（3時間・週・月表示でもずれない）
      const delta = snapDelta(ev.clientX - d.startX, timeline.pxPerDay, d.precision)
      if (d.mode === 'move') setPreview({ id: d.id, ds: delta, de: delta })
      else setPreview({ id: d.id, ds: 0, de: delta })
    }
    async function onUp() {
      const d = dragRef.current
      const p = preview
      if (d && p && (p.ds !== 0 || p.de !== 0)) {
        // ISO日時のまま日数をずらすため、午前/午後の区分は保たれる
        const planStartAt = shiftDays(d.s, p.ds)
        const planEndAt = shiftDays(d.e, p.de)
        try {
          await updateTaskMutation.mutateAsync({
            id: Number(d.id), name: tasks.find((t) => t.id === d.id)?.name ?? '',
            planned_start_at: planStartAt,
            planned_finish_at: planEndAt,
            change_reason: 'ガントチャートのドラッグ変更',
          })
          toast('日程変更を保存しました', 'ok')
        } catch (e) {
          toast(e instanceof ApiError ? e.message : '日程変更を保存できませんでした', 'ng')
        }
      }
      dragRef.current = null
      setPreview(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [timeline.pxPerDay, preview, toast, tasks, updateTaskMutation])

  const visible = useMemo(() => {
    if (filterStatus !== 'all') return tasks.filter((t) => !t.isParent && t.status === filterStatus)
    return tasks.filter((t) => {
      if (t.level === 1) {
        const parentWbs = t.wbs.split('.')[0]
        const parent = tasks.find((p) => p.wbs === parentWbs && p.isParent)
        if (parent && collapsed.has(parent.id)) return false
      }
      return true
    })
  }, [tasks, collapsed, filterStatus])

  const rowIndexById = useMemo(() => {
    const m = new Map<string, number>()
    visible.forEach((t, i) => m.set(t.id, i))
    return m
  }, [visible])

  const totalW = timeline.totalWidth
  const bodyH = visible.length * ROW_H

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const scrollToToday = useCallback(() => {
    if (ganttRef.current && timeline.todayX !== null) {
      ganttRef.current.scrollLeft = Math.max(0, timeline.todayX - 200)
    }
  }, [timeline])
  useEffect(() => {
    scrollToToday()
  }, [scrollToToday])

  function startDrag(e: React.PointerEvent, t: WbsTask, mode: 'move' | 'resize') {
    e.stopPropagation()
    if (t.isMilestone) return
    dragRef.current = { id: t.id, mode, startX: e.clientX, s: t.planStartAt, e: t.planEndAt, precision: t.precision }
  }

  async function updateProgress() {
    if (!progressModal) return
    try {
      await updateTaskMutation.mutateAsync({
        id: Number(progressModal.id), name: progressModal.name, actual_progress: progressVal,
        status: progressVal >= 100 ? '完了' : progressVal > 0 ? '施工中' : progressModal.status,
        change_reason: '工程管理画面から進捗更新',
      })
      toast(`「${progressModal.name}」の進捗を ${progressVal}% に更新しました`, 'ok')
      setProgressModal(null)
    } catch (e) {
      toast(e instanceof ApiError ? e.message : '進捗を保存できませんでした', 'ng')
    }
  }

  async function deleteTask(t: WbsTask) {
    const ok = await confirm({
      title: '工程の削除',
      message: `「${t.name}」を削除します。よろしいですか？`,
      confirmLabel: '削除',
      danger: true,
    })
    if (ok) {
      try {
        await deleteTaskMutation.mutateAsync(Number(t.id))
        toast('工程を削除しました', 'ok')
      } catch (e) {
        toast(e instanceof ApiError ? e.message : '工程を削除できませんでした', 'ng')
      }
    }
  }

  const menuTask = menu ? tasks.find((t) => t.id === menu.id) : null
  const menuItems: MenuItem[] = menuTask
    ? [
        { label: '工程を追加', icon: Plus, onClick: () => setEditor({ mode: 'create' }) },
        { label: '子工程を追加', icon: CornerDownRight, onClick: () => setEditor({ mode: 'create', parent: menuTask }) },
        { label: '工程を編集', icon: Pencil, onClick: () => setEditor({ mode: 'edit', task: menuTask }) },
        { label: '工程をコピー', icon: Copy, onClick: () => setEditor({ mode: 'copy', task: menuTask }) },
        { label: '', onClick: () => {}, divider: true },
        { label: '担当者を割り当て', icon: UserPlus, onClick: () => toast('この操作は現在準備中です') },
        { label: '前工程と関連付け', icon: Link2, onClick: () => toast('この操作は現在準備中です') },
        { label: '後工程と関連付け', icon: Link2, onClick: () => toast('この操作は現在準備中です') },
        { label: '進捗を更新', icon: TrendingUp, onClick: () => { setProgressModal(menuTask); setProgressVal(menuTask.progress) } },
        { label: '完了にする', icon: CheckCircle2, onClick: () => { updateTaskMutation.mutate({ id: Number(menuTask.id), name: menuTask.name, actual_progress: 100, status: '完了', change_reason: '右クリックメニューから完了' }, { onSuccess: () => toast(`「${menuTask.name}」を完了にしました`, 'ok'), onError: () => toast('完了状態を保存できませんでした', 'ng') }) } },
        { label: '詳細を表示', icon: Eye, onClick: () => { setProgressModal(menuTask); setProgressVal(menuTask.progress) } },
        { label: '', onClick: () => {}, divider: true },
        { label: '工程を削除', icon: Trash2, onClick: () => deleteTask(menuTask), danger: true },
      ]
    : []

  // 依存線
  const depLines = useMemo(() => {
    const lines: { x1: number; y1: number; x2: number; y2: number; critical: boolean }[] = []
    for (const t of visible) {
      if (t.isParent) continue
      for (const pw of t.predecessors) {
        const pred = visible.find((x) => x.wbs === pw)
        if (!pred) continue
        const pr = rowIndexById.get(pred.id)!
        const sr = rowIndexById.get(t.id)!
        // 先行工程のバー右端（終了日の翌日0時）から、後続工程の開始位置へ引く
        const predBar = timeline.spanOf(pred.planStartAt, pred.planEndAt)
        const x1 = predBar.left + predBar.width
        const y1 = pr * ROW_H + 11
        const x2 = timeline.xOf(t.planStartAt)
        const y2 = sr * ROW_H + 11
        lines.push({ x1, y1, x2, y2, critical: !!(t.critical && pred.critical) })
      }
    }
    return lines
  }, [visible, rowIndexById, timeline])

  const toolbarGroups: { icon: typeof Plus; label: string; onClick: () => void }[][] = [
    [
      { icon: Plus, label: '工程追加', onClick: () => setEditor({ mode: 'create' }) },
      { icon: FolderPlus, label: '親工程追加', onClick: () => setEditor({ mode: 'create' }) },
      { icon: CornerDownRight, label: '子工程追加', onClick: () => { const t = tasks.find((x) => selected.has(x.id)); t ? setEditor({ mode: 'create', parent: t }) : toast('親工程を選択してください', 'info') } },
    ],
    [
      { icon: Pencil, label: '編集', onClick: () => { const t = tasks.find((x) => selected.has(x.id)); t ? setEditor({ mode: 'edit', task: t }) : toast('工程を選択してください') } },
      { icon: Trash2, label: '削除', onClick: () => { const t = tasks.find((x) => selected.has(x.id)); t ? void deleteTask(t) : toast('削除対象を選択してください') } },
      { icon: Copy, label: 'コピー', onClick: () => { const t = tasks.find((x) => selected.has(x.id)); t ? setEditor({ mode: 'copy', task: t }) : toast('工程を選択してください') } },
      { icon: ClipboardPaste, label: '貼り付け', onClick: () => toast('この操作は現在準備中です') },
      { icon: Undo2, label: '元に戻す', onClick: () => toast('この操作は現在準備中です') },
      { icon: Redo2, label: 'やり直す', onClick: () => toast('この操作は現在準備中です') },
    ],
    [
      { icon: UserPlus, label: '担当者割当', onClick: () => toast('この操作は現在準備中です') },
      { icon: Users2, label: '要員割当', onClick: () => toast('この操作は現在準備中です') },
      { icon: TrendingUp, label: '進捗更新', onClick: () => toast('工程を右クリックして進捗更新できます') },
      { icon: Save, label: '基準工程保存', onClick: () => toast('この操作は現在準備中です', 'info') },
    ],
    [
      { icon: TrendingUp, label: '工期予測', onClick: () => setForecastOpen(true) },
      { icon: SlidersHorizontal, label: '表示設定', onClick: () => toast('この操作は現在準備中です') },
      { icon: Filter, label: 'フィルター', onClick: () => setFilterOpen((v) => !v) },
      { icon: Crosshair, label: '今日へ移動', onClick: scrollToToday },
    ],
  ]

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: '案件一覧', to: '/projects' },
          { label: project?.name ?? '案件を選択', to: projectId ? `/projects/${projectId}` : '/projects' },
          { label: '工程管理' },
        ]}
        title="工程管理"
        description={`${project?.name ?? '案件未選択'} ／ WBS・ガントチャート ${tasksLoading ? '（工程データを読み込み中...）' : tasksError ? '（工程データの取得に失敗しました）' : '（DB保存）'}`}
        actions={
          <div className="flex items-center gap-2">
            <select className="field !w-64 !py-1 text-xs" value={projectId ?? ''} onChange={(e) => navigate(`/projects/${e.target.value}/schedule`)}>
              <option value="" disabled>案件を選択</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.construction_number} {p.name}</option>)}
            </select>
            {/* 表示単位は横断工程と同じ共通部品。3時間も直接選べる */}
            <ScaleSelector scale={scale} onChange={setScale} />
            <button onClick={() => toast('この操作は現在準備中です')} className="rounded border border-line bg-white p-1.5 text-ink-soft hover:bg-canvas" title="全画面表示"><Maximize2 size={15} /></button>
          </div>
        }
      />

      <ScheduleTabs projectId={projectId} />

      {/* ツールバー */}
      <div className="mb-2 flex flex-wrap items-center gap-1 rounded border border-line bg-white px-2 py-1.5">
        {toolbarGroups.map((group, gi) => (
          <div key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <div className="mx-1 h-6 w-px bg-line" />}
            {group.map((b) => (
              <button
                key={b.label}
                onClick={b.onClick}
                className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-ink hover:bg-canvas"
                title={b.label}
              >
                <b.icon size={15} className="text-sysken-600" />
                <span className="hidden 2xl:inline">{b.label}</span>
              </button>
            ))}
          </div>
        ))}
        {filterOpen && (
          <div className="ml-2 flex items-center gap-1">
            <span className="text-xs text-ink-soft">ステータス:</span>
            <select
              className="field !w-auto !py-1 text-xs"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">すべて</option>
              <option value="施工中">施工中</option>
              <option value="完了">完了</option>
              <option value="遅延">遅延</option>
              <option value="未着手">未着手</option>
            </select>
          </div>
        )}
      </div>

      {range.narrowed && (
        <div className="mb-2 rounded border border-line bg-white px-3 py-1.5 text-[12px] text-ink-soft">
          3時間表示は1日が8列になるため、現在日を中心とした期間だけを表示しています。
          全期間を確認するときは「日」以上の表示単位に切り替えてください。
        </div>
      )}
      {/* エラー時は固定ダミーへ切り替えず、状態を明示する */}
      {tasksError && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-4 py-3 text-center text-[13px] text-ng">
          工程データの取得に失敗しました。ネットワーク接続とAPIの状態をご確認ください。
        </div>
      )}
      {!tasksLoading && !tasksError && tasks.length === 0 && (
        <div className="mb-2 rounded border border-line bg-white px-4 py-6 text-center text-[13px] text-ink-soft">
          工程がまだ登録されていません。
        </div>
      )}

      {/* ガント本体 */}
      <Panel className="overflow-hidden" bodyClassName="p-0">
        {/*
          items-start が必須。既定の stretch だと左右の枠が親と同じ高さに引き伸ばされ、
          overflow-x-auto の指定によって縦方向も auto 扱いになるため、左の工程表と
          右のガントがそれぞれ独立したスクロール枠になり縦位置がずれる。
          items-start で各枠の高さを内容と同じにすると、縦スクロールは外側の1箇所だけになる。
        */}
        <div className="thin-scroll flex max-h-[calc(100vh-320px)] items-start overflow-y-auto">
          {/* 左：工程表（横スクロール・固定列） */}
          <div className="thin-scroll shrink-0 overflow-x-auto border-r border-line" style={{ width: 560 }}>
            <table className="grid-table text-[12.5px]">
              <thead className="sticky top-0 z-20 bg-canvas">
                <tr>
                  {LEFT_COLS.map((c, i) => (
                    <th
                      key={c.key}
                      className={`h-16 border-r border-line px-2 text-left align-bottom pb-2 text-[12.5px] font-semibold text-ink-soft ${i < 2 ? 'sticky bg-canvas z-10' : ''}`}
                      style={{ width: c.w, minWidth: c.w, left: i === 0 ? 0 : i === 1 ? 46 : undefined }}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => {
                  const isParent = t.isParent
                  return (
                    <tr
                      key={t.id}
                      style={{ height: ROW_H }}
                      className={`cursor-pointer ${selected.has(t.id) ? 'bg-sysken-50' : isParent ? 'bg-slate-50' : 'hover:bg-canvas'}`}
                      onClick={() => setSelected(new Set([t.id]))}
                      onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: t.id }) }}
                    >
                      <td className="sticky left-0 z-10 border-r border-line px-2 tabular-nums text-ink-soft" style={{ width: 46, background: selected.has(t.id) ? '#e9f2fa' : isParent ? '#f8fafc' : '#fff' }}>{t.wbs}</td>
                      <td className="sticky z-10 border-r border-line px-2" style={{ width: 176, left: 46, background: selected.has(t.id) ? '#e9f2fa' : isParent ? '#f8fafc' : '#fff' }}>
                        <div className="flex items-center gap-1" style={{ paddingLeft: (t.level) * 12 }}>
                          {isParent ? (
                            <button onClick={(e) => { e.stopPropagation(); toggleCollapse(t.id) }} className="text-ink-soft">
                              <span className="inline-block w-3">{collapsed.has(t.id) ? '▶' : '▼'}</span>
                            </button>
                          ) : (
                            <span className="inline-block w-3" />
                          )}
                          <span className={`truncate ${isParent ? 'font-semibold text-ink' : 'text-ink'}`}>{t.isMilestone ? '◆ ' : ''}{t.name}</span>
                        </div>
                      </td>
                      <td className="border-r border-line px-2 text-ink-soft" style={{ width: 72 }}>{t.workType}</td>
                      <td className="border-r border-line px-2 text-ink-soft" style={{ width: 68 }}>{t.crew}</td>
                      <td className="border-r border-line px-2 text-ink-soft" style={{ width: 76 }}>{t.manager}</td>
                      <td className="border-r border-line px-2 tabular-nums text-ink-soft" style={{ width: 82 }}>{edgeLabel(t.planStartAt, 'start', t.precision)}</td>
                      <td className="border-r border-line px-2 tabular-nums text-ink-soft" style={{ width: 82 }}>{edgeLabel(t.planEndAt, 'end', t.precision)}</td>
                      <td className="border-r border-line px-2 tabular-nums text-ink-soft" style={{ width: 82 }}>{t.actualStartAt ? edgeLabel(t.actualStartAt, 'start', t.precision) : '—'}</td>
                      <td className="border-r border-line px-2 tabular-nums text-ink-soft" style={{ width: 82 }}>{t.actualEndAt ? edgeLabel(t.actualEndAt, 'end', t.precision) : '—'}</td>
                      <td className="border-r border-line px-2 text-center tabular-nums text-ink-soft" style={{ width: 44 }}>{t.planDays}</td>
                      <td className="border-r border-line px-2 text-right tabular-nums font-medium" style={{ width: 52 }}>{t.progress}%</td>
                      <td className="border-r border-line px-2 text-center tabular-nums text-ink-soft" style={{ width: 52 }}>{t.planPeople}</td>
                      <td className="border-r border-line px-2 text-center tabular-nums text-ink-soft" style={{ width: 52 }}>{t.actualPeople || '—'}</td>
                      <td className="border-r border-line px-1.5" style={{ width: 78 }}><StatusBadge status={t.status} /></td>
                      <td className="px-2 tabular-nums text-ink-soft" style={{ width: 48 }}>{t.predecessors.join(',') || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 右：ガント */}
          <div ref={ganttRef} className="thin-scroll flex-1 overflow-x-auto">
            <div style={{ width: totalW }}>
              {/* ヘッダ */}
              <GanttHeader timeline={timeline} />
              {/* 本体 */}
              <div className="relative" style={{ height: bodyH }}>
                {/* 縦グリッド・週末/祝日 */}
                <GanttGrid timeline={timeline} height={bodyH} />
                {/* 行の下線 */}
                {visible.map((_, i) => (
                  <div key={i} className="absolute left-0 border-b border-line/60" style={{ top: (i + 1) * ROW_H - 1, width: totalW }} />
                ))}
                {/* 依存線 */}
                <DependencyLines lines={depLines} width={totalW} height={bodyH} />
                {/* バー */}
                {visible.map((t, i) => (
                  <GanttRow key={t.id} task={t} row={i} timeline={timeline} preview={preview?.id === t.id ? preview : null}
                    onStartDrag={startDrag}
                    onContext={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: t.id }) }}
                    onSelect={() => setSelected(new Set([t.id]))}
                    onOpenProgress={() => { setProgressModal(t); setProgressVal(t.progress) }}
                  />
                ))}
                {/* 現在日時の縦線（表示範囲内のときのみ） */}
                <TodayLine timeline={timeline} height={bodyH} />
              </div>
            </div>
          </div>
        </div>

        {/* 凡例 */}
        <GanttLegend note="クリティカル工程は赤の依存線で表示 ／ 工程バーはドラッグで移動・右端で期間変更" />
      </Panel>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />}

      {/* 進捗更新モーダル */}
      <Modal
        open={!!progressModal}
        onClose={() => setProgressModal(null)}
        title={progressModal ? `進捗更新：${progressModal.name}` : ''}
        footer={<><button className="btn-default" onClick={() => setProgressModal(null)}>キャンセル</button><button className="btn-primary" onClick={updateProgress}>更新</button></>}
      >
        {progressModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-[13px]">
              <Info label="工種" value={progressModal.workType} />
              <Info label="担当班" value={progressModal.crew} />
              <Info label="予定期間" value={formatPeriod(progressModal.planStartAt, progressModal.planEndAt, progressModal.precision)} />
              <Info label="ステータス" value={progressModal.status} />
            </div>
            <div>
              <label className="label">進捗率：{progressVal}%</label>
              <input type="range" min={0} max={100} step={5} value={progressVal} onChange={(e) => setProgressVal(Number(e.target.value))} className="w-full accent-sysken-500" />
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-sysken-500" style={{ width: `${progressVal}%` }} />
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* 工期予測モーダル */}
      <Modal open={forecastOpen} onClose={() => setForecastOpen(false)} title="AI工期予測" size="lg"
        footer={<button className="btn-primary" onClick={() => setForecastOpen(false)}>閉じる</button>}>
        <ForecastView />
      </Modal>
      <TaskEditor
        open={!!editor}
        editor={editor}
        tasks={tasks}
        saving={createTaskMutation.isPending || updateTaskMutation.isPending}
        onClose={() => setEditor(null)}
        onSave={async (input) => {
          if (!projectId || !editor) return
          try {
            if (editor.mode === 'edit' && editor.task) {
              await updateTaskMutation.mutateAsync({ id: Number(editor.task.id), ...input, change_reason: '工程編集' })
            } else {
              await createTaskMutation.mutateAsync(input)
            }
            toast(editor.mode === 'edit' ? '工程を更新しました' : '工程を追加しました', 'ok')
            setEditor(null)
          } catch (e) {
            toast(e instanceof ApiError ? e.message : '工程を保存できませんでした', 'ng')
          }
        }}
      />
    </div>
  )
}

/** 工程の期間入力（1日単位／0.5日単位）。日時が正で、precision は入力粒度の判定に使う。 */
type ScheduleUnit = 'day' | 'half'

/** 既存工程の日時から、フォームの初期値（日付＋区分）を作る。 */
function periodFormOf(task?: WbsTask, parent?: WbsTask) {
  const src = task ?? parent
  const todayKey = jstDateKey(nowJst())
  if (!src) {
    return {
      unit: 'day' as ScheduleUnit,
      planStartDate: todayKey, planStartHalf: 'AM' as HalfDay,
      planEndDate: todayKey, planEndHalf: 'PM' as HalfDay,
    }
  }
  const s0 = splitStartAt(src.planStartAt)
  const e0 = splitEndAt(src.planEndAt)
  return {
    unit: (src.precision === 'half_day' ? 'half' : 'day') as ScheduleUnit,
    planStartDate: s0.dateKey, planStartHalf: s0.half,
    planEndDate: e0.dateKey, planEndHalf: e0.half,
  }
}

function actualFormOf(task?: WbsTask) {
  const s0 = task?.actualStartAt ? splitStartAt(task.actualStartAt) : null
  const e0 = task?.actualEndAt ? splitEndAt(task.actualEndAt) : null
  return {
    actualStartDate: s0?.dateKey ?? '', actualStartHalf: (s0?.half ?? 'AM') as HalfDay,
    actualEndDate: e0?.dateKey ?? '', actualEndHalf: (e0?.half ?? 'PM') as HalfDay,
  }
}

function TaskEditor({
  open, editor, tasks, saving, onClose, onSave,
}: {
  open: boolean
  editor: { mode: 'create' | 'edit' | 'copy'; parent?: WbsTask; task?: WbsTask } | null
  tasks: WbsTask[]
  saving: boolean
  onClose: () => void
  onSave: (input: TaskWriteInput) => Promise<void>
}) {
  const source = editor?.task
  const parent = editor?.parent
  const nextRoot = Math.max(0, ...tasks.filter((t) => t.isParent).map((t) => Number(t.wbs) || 0)) + 1
  const childCount = parent ? tasks.filter((t) => t.wbs.startsWith(`${parent.wbs}.`)).length : 0
  const initial = () => ({
    wbs: source ? (editor?.mode === 'copy' ? `${source.wbs}-copy` : source.wbs) : parent ? `${parent.wbs}.${childCount + 1}` : String(nextRoot),
    name: source ? `${source.name}${editor?.mode === 'copy' ? '（コピー）' : ''}` : '',
    ...periodFormOf(source, parent),
    ...actualFormOf(source),
    plannedProgress: source?.progress ?? 0,
    actualProgress: source?.progress ?? 0,
    plannedWorkers: source?.planPeople ?? 0,
    actualWorkers: source?.actualPeople ?? 0,
    status: source?.status ?? '未着手',
    notes: '',
    predecessor: source?.predecessors[0] ?? '',
  })
  const [form, setForm] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!open) return
    setForm(initial())
    setError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, source, parent, editor?.mode, childCount, nextRoot])

  const half = form.unit === 'half'
  // 0.5日単位でないときは 午前開始〜午後終了（＝丸1日）に固定する
  const startAt = startAtOf(form.planStartDate, half ? form.planStartHalf : 'AM')
  const endAt = endAtOf(form.planEndDate, half ? form.planEndHalf : 'PM')
  const days = durationInDays(startAt, endAt)

  async function submit() {
    if (!form.name.trim() || !form.wbs.trim()) return
    if (days <= 0) {
      setError('終了は開始より後にしてください')
      return
    }
    setError(null)
    const predecessor = tasks.find((t) => t.wbs === form.predecessor)
    await onSave({
      parent_task_id: parent ? Number(parent.id) : source?.isParent ? null : undefined,
      wbs_code: form.wbs.trim(), name: form.name.trim(),
      // 日時（開始=inclusive / 終了=exclusive）が正。precision は入力粒度の記録。
      planned_start_at: startAt,
      planned_finish_at: endAt,
      actual_start_at: form.actualStartDate ? startAtOf(form.actualStartDate, half ? form.actualStartHalf : 'AM') : null,
      actual_finish_at: form.actualEndDate ? endAtOf(form.actualEndDate, half ? form.actualEndHalf : 'PM') : null,
      schedule_precision: half ? 'half_day' : 'day',
      planned_progress: form.plannedProgress, actual_progress: form.actualProgress,
      planned_workers: form.plannedWorkers, actual_workers: form.actualWorkers,
      status: form.status, notes: form.notes || null,
      dependency_ids: predecessor ? [Number(predecessor.id)] : [],
    })
  }

  const halfSelect = (value: HalfDay, onChange: (v: HalfDay) => void) => (
    <select className="field !w-20" value={value} onChange={(e) => onChange(e.target.value as HalfDay)}>
      <option value="AM">午前</option>
      <option value="PM">午後</option>
    </select>
  )

  return (
    <Modal open={open} onClose={onClose} title={editor?.mode === 'edit' ? '工程を編集' : editor?.mode === 'copy' ? '工程をコピー' : parent ? '子工程を追加' : '工程を追加'} size="lg"
      footer={<><button className="btn-default" onClick={onClose}>キャンセル</button><button className="btn-primary" disabled={saving || !form.name.trim()} onClick={submit}>{saving ? '保存中…' : '保存'}</button></>}>
      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-ng">{error}</div>}
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">WBS *</label><input className="field" value={form.wbs} onChange={(e) => setForm({ ...form, wbs: e.target.value })} /></div>
        <div className="col-span-2"><label className="label">工程名 *</label><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>

        {/* 期間の単位。既定は1日単位で、0.5日を選んだときだけ午前/午後を出す */}
        <div className="col-span-3 rounded border border-line bg-canvas px-3 py-2">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="label">期間の単位</label>
              <div className="flex items-center gap-0.5 rounded border border-line bg-white p-0.5">
                {([['day', '1日単位'], ['half', '0.5日単位']] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => setForm({ ...form, unit: v })}
                    className={`rounded px-2.5 py-1 text-xs font-medium ${form.unit === v ? 'bg-sysken-500 text-white' : 'text-ink hover:bg-canvas'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">開始予定</label>
              <div className="flex items-center gap-1">
                <input type="date" className="field !w-36" value={form.planStartDate} onChange={(e) => setForm({ ...form, planStartDate: e.target.value })} />
                {half && halfSelect(form.planStartHalf, (v) => setForm({ ...form, planStartHalf: v }))}
              </div>
            </div>
            <div>
              <label className="label">終了予定</label>
              <div className="flex items-center gap-1">
                <input type="date" className="field !w-36" value={form.planEndDate} onChange={(e) => setForm({ ...form, planEndDate: e.target.value })} />
                {half && halfSelect(form.planEndHalf, (v) => setForm({ ...form, planEndHalf: v }))}
              </div>
            </div>
            <div className="pb-2 text-[13px] text-ink-soft">
              期間：<span className="font-semibold text-ink">{days > 0 ? `${days}日` : '—'}</span>
            </div>
          </div>
        </div>

        <div><label className="label">先行工程</label><select className="field" value={form.predecessor} onChange={(e) => setForm({ ...form, predecessor: e.target.value })}><option value="">なし</option>{tasks.filter((t) => t.id !== source?.id).map((t) => <option key={t.id} value={t.wbs}>{t.wbs} {t.name}</option>)}</select></div>
        <div>
          <label className="label">開始実績</label>
          <div className="flex items-center gap-1">
            <input type="date" className="field" value={form.actualStartDate} onChange={(e) => setForm({ ...form, actualStartDate: e.target.value })} />
            {half && form.actualStartDate && halfSelect(form.actualStartHalf, (v) => setForm({ ...form, actualStartHalf: v }))}
          </div>
        </div>
        <div>
          <label className="label">終了実績</label>
          <div className="flex items-center gap-1">
            <input type="date" className="field" value={form.actualEndDate} onChange={(e) => setForm({ ...form, actualEndDate: e.target.value })} />
            {half && form.actualEndDate && halfSelect(form.actualEndHalf, (v) => setForm({ ...form, actualEndHalf: v }))}
          </div>
        </div>
        <div><label className="label">ステータス</label><select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as WbsTask['status'] })}>{['未着手','施工中','完了','一時停止','遅延'].map((s) => <option key={s}>{s}</option>)}</select></div>
        <div><label className="label">予定進捗 (%)</label><input type="number" min="0" max="100" className="field" value={form.plannedProgress} onChange={(e) => setForm({ ...form, plannedProgress: Number(e.target.value) })} /></div>
        <div><label className="label">実績進捗 (%)</label><input type="number" min="0" max="100" className="field" value={form.actualProgress} onChange={(e) => setForm({ ...form, actualProgress: Number(e.target.value) })} /></div>
        <div><label className="label">予定人数</label><input type="number" min="0" className="field" value={form.plannedWorkers} onChange={(e) => setForm({ ...form, plannedWorkers: Number(e.target.value) })} /></div>
        <div><label className="label">実績人数</label><input type="number" min="0" className="field" value={form.actualWorkers} onChange={(e) => setForm({ ...form, actualWorkers: Number(e.target.value) })} /></div>
        <div className="col-span-3"><label className="label">備考</label><textarea className="field min-h-20" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div>
    </Modal>
  )
}

function ForecastView() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <TrendingUp size={40} className="text-slate-300" />
      <p className="text-[14px] font-semibold text-ink">AI工期予測は未連携です</p>
      <p className="max-w-md text-[13px] leading-relaxed text-ink-soft">
        実績進捗・天候・要員稼働を解析し、完了予定日と遅延リスクを予測する機能は現在準備中です。
        予測モデルが連携されると、予測完了日・遅延リスク・進捗推移グラフがここに表示されます。
      </p>
      <p className="text-[12px] text-ink-soft">
        現在の予定・実績進捗は本画面のガントチャートで確認できます。
      </p>
    </div>
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
