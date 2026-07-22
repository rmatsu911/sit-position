import { useMemo, useRef, useState, useEffect } from 'react'
import { format } from 'date-fns'
import {
  Plus, FolderPlus, CornerDownRight, Pencil, Trash2, Copy, ClipboardPaste,
  Undo2, Redo2, UserPlus, Users2, TrendingUp, Save, SlidersHorizontal, Filter,
  Crosshair, ZoomIn, ZoomOut, CheckCircle2, Link2, Eye, Maximize2,
} from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge } from '../components/ui/Badge'
import { Modal } from '../components/ui/Modal'
import { ContextMenu, type MenuItem } from '../components/ui/ContextMenu'
import { useApp } from '../context/AppContext'
import { wbsTasks, forecast, forecastSeries } from '../data/schedule'
import type { WbsTask } from '../types'
import {
  days, dayWidthByMode, ROW_H, dayIndex, isHoliday, isWeekend, weekdayLabel,
  weatherFor, addDaysIso, todayDate, type ViewMode,
} from './schedule/ganttUtils'
import {
  Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

const statusColor: Record<string, string> = {
  完了: '#2e8b57',
  施工中: '#005bac',
  遅延: '#d64545',
  一時停止: '#e6a700',
  未着手: '#94a3b8',
}

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
  const [tasks, setTasks] = useState<WbsTask[]>(() => wbsTasks.map((t) => ({ ...t })))
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [view, setView] = useState<ViewMode>('day')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [progressModal, setProgressModal] = useState<WbsTask | null>(null)
  const [progressVal, setProgressVal] = useState(0)
  const [forecastOpen, setForecastOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  const dw = dayWidthByMode[view]
  const ganttRef = useRef<HTMLDivElement>(null)

  // ドラッグ
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; s: string; e: string } | null>(null)
  const [preview, setPreview] = useState<{ id: string; ds: number; de: number } | null>(null)

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      const d = dragRef.current
      if (!d) return
      const delta = Math.round((ev.clientX - d.startX) / dw)
      if (d.mode === 'move') setPreview({ id: d.id, ds: delta, de: delta })
      else setPreview({ id: d.id, ds: 0, de: delta })
    }
    function onUp() {
      const d = dragRef.current
      const p = preview
      if (d && p && (p.ds !== 0 || p.de !== 0)) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === d.id
              ? { ...t, planStart: addDaysIso(d.s, p.ds), planEnd: addDaysIso(d.e, p.de) }
              : t,
          ),
        )
        toast('工程の日程を変更しました（デモ）', 'ok')
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
  }, [dw, preview, toast])

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

  const totalW = days.length * dw
  const bodyH = visible.length * ROW_H

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function scrollToToday() {
    if (ganttRef.current) {
      ganttRef.current.scrollLeft = Math.max(0, dayIndex(format(todayDate, 'yyyy-MM-dd')) * dw - 200)
    }
  }
  useEffect(() => {
    scrollToToday()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view])

  function startDrag(e: React.PointerEvent, t: WbsTask, mode: 'move' | 'resize') {
    e.stopPropagation()
    if (t.isMilestone) return
    dragRef.current = { id: t.id, mode, startX: e.clientX, s: t.planStart, e: t.planEnd }
  }

  function updateProgress() {
    if (!progressModal) return
    setTasks((prev) =>
      prev.map((t) =>
        t.id === progressModal.id
          ? { ...t, progress: progressVal, status: progressVal >= 100 ? '完了' : progressVal > 0 ? '施工中' : t.status }
          : t,
      ),
    )
    toast(`「${progressModal.name}」の進捗を ${progressVal}% に更新しました`, 'ok')
    setProgressModal(null)
  }

  async function deleteTask(t: WbsTask) {
    const ok = await confirm({
      title: '工程の削除',
      message: `「${t.name}」を削除します。よろしいですか？`,
      confirmLabel: '削除',
      danger: true,
    })
    if (ok) {
      setTasks((prev) => prev.filter((x) => x.id !== t.id && !x.wbs.startsWith(t.wbs + '.')))
      toast('工程を削除しました（デモ）', 'ok')
    }
  }

  const menuTask = menu ? tasks.find((t) => t.id === menu.id) : null
  const menuItems: MenuItem[] = menuTask
    ? [
        { label: '工程を追加', icon: Plus, onClick: () => toast('工程を追加しました（デモ）', 'ok') },
        { label: '子工程を追加', icon: CornerDownRight, onClick: () => toast('子工程を追加しました（デモ）', 'ok') },
        { label: '工程を編集', icon: Pencil, onClick: () => toast('編集ダイアログを開きます（デモ）') },
        { label: '工程をコピー', icon: Copy, onClick: () => toast('工程をコピーしました（デモ）') },
        { label: '', onClick: () => {}, divider: true },
        { label: '担当者を割り当て', icon: UserPlus, onClick: () => toast('担当者割当を開きます（デモ）') },
        { label: '前工程と関連付け', icon: Link2, onClick: () => toast('先行工程を設定しました（デモ）') },
        { label: '後工程と関連付け', icon: Link2, onClick: () => toast('後続工程を設定しました（デモ）') },
        { label: '進捗を更新', icon: TrendingUp, onClick: () => { setProgressModal(menuTask); setProgressVal(menuTask.progress) } },
        { label: '完了にする', icon: CheckCircle2, onClick: () => { setTasks((p) => p.map((t) => t.id === menuTask.id ? { ...t, progress: 100, status: '完了' } : t)); toast(`「${menuTask.name}」を完了にしました`, 'ok') } },
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
        const x1 = (dayIndex(pred.planEnd) + 1) * dw
        const y1 = pr * ROW_H + 11
        const x2 = dayIndex(t.planStart) * dw
        const y2 = sr * ROW_H + 11
        lines.push({ x1, y1, x2, y2, critical: !!(t.critical && pred.critical) })
      }
    }
    return lines
  }, [visible, rowIndexById, dw])

  const toolbarGroups: { icon: typeof Plus; label: string; onClick: () => void }[][] = [
    [
      { icon: Plus, label: '工程追加', onClick: () => toast('工程を追加しました（デモ）', 'ok') },
      { icon: FolderPlus, label: '親工程追加', onClick: () => toast('親工程を追加しました（デモ）', 'ok') },
      { icon: CornerDownRight, label: '子工程追加', onClick: () => toast('子工程を追加しました（デモ）', 'ok') },
    ],
    [
      { icon: Pencil, label: '編集', onClick: () => toast('編集（デモ）') },
      { icon: Trash2, label: '削除', onClick: () => toast('削除対象を選択してください') },
      { icon: Copy, label: 'コピー', onClick: () => toast('コピーしました（デモ）') },
      { icon: ClipboardPaste, label: '貼り付け', onClick: () => toast('貼り付けました（デモ）') },
      { icon: Undo2, label: '元に戻す', onClick: () => toast('元に戻しました（デモ）') },
      { icon: Redo2, label: 'やり直す', onClick: () => toast('やり直しました（デモ）') },
    ],
    [
      { icon: UserPlus, label: '担当者割当', onClick: () => toast('担当者を割り当てます（デモ）') },
      { icon: Users2, label: '要員割当', onClick: () => toast('要員を割り当てます（デモ）') },
      { icon: TrendingUp, label: '進捗更新', onClick: () => toast('工程を右クリックして進捗更新できます') },
      { icon: Save, label: '基準工程保存', onClick: () => toast('基準工程を保存しました（デモ）', 'ok') },
    ],
    [
      { icon: TrendingUp, label: '工期予測', onClick: () => setForecastOpen(true) },
      { icon: SlidersHorizontal, label: '表示設定', onClick: () => toast('表示設定を開きます（デモ）') },
      { icon: Filter, label: 'フィルター', onClick: () => setFilterOpen((v) => !v) },
      { icon: Crosshair, label: '今日へ移動', onClick: scrollToToday },
    ],
  ]

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: '案件一覧', to: '/projects' },
          { label: '熊本中央局 光設備更改工事', to: '/projects/p1' },
          { label: '工程管理' },
        ]}
        title="工程管理"
        description="熊本中央局 光設備更改工事 ／ WBS・ガントチャート（ドラッグで日程変更・右クリックで操作）"
        actions={
          <div className="flex items-center gap-1 rounded border border-line bg-white p-0.5">
            {(['day', 'week', 'month'] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded px-2.5 py-1 text-xs font-medium ${view === v ? 'bg-sysken-500 text-white' : 'text-ink hover:bg-canvas'}`}
              >
                {v === 'day' ? '日' : v === 'week' ? '週' : '月'}表示
              </button>
            ))}
            <button onClick={() => toast('全画面表示（デモ）')} className="ml-1 rounded p-1 text-ink-soft hover:bg-canvas" title="全画面表示"><Maximize2 size={15} /></button>
            <button onClick={() => setView('week')} className="rounded p-1 text-ink-soft hover:bg-canvas" title="縮小"><ZoomOut size={15} /></button>
            <button onClick={() => setView('day')} className="rounded p-1 text-ink-soft hover:bg-canvas" title="拡大"><ZoomIn size={15} /></button>
          </div>
        }
      />

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

      {/* ガント本体 */}
      <Panel className="overflow-hidden" bodyClassName="p-0">
        <div className="thin-scroll flex max-h-[calc(100vh-320px)] overflow-y-auto">
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
                      <td className="border-r border-line px-2 tabular-nums text-ink-soft" style={{ width: 82 }}>{t.planStart.slice(5)}</td>
                      <td className="border-r border-line px-2 tabular-nums text-ink-soft" style={{ width: 82 }}>{t.planEnd.slice(5)}</td>
                      <td className="border-r border-line px-2 tabular-nums text-ink-soft" style={{ width: 82 }}>{t.actualStart?.slice(5) ?? '—'}</td>
                      <td className="border-r border-line px-2 tabular-nums text-ink-soft" style={{ width: 82 }}>{t.actualEnd?.slice(5) ?? '—'}</td>
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
              <GanttHeader dw={dw} view={view} />
              {/* 本体 */}
              <div className="relative" style={{ height: bodyH }}>
                {/* 縦グリッド・週末/祝日 */}
                {days.map((d, i) => {
                  const wk = isWeekend(d)
                  const hol = isHoliday(d)
                  return (
                    <div
                      key={i}
                      className={`absolute top-0 border-r border-line/70 ${hol ? 'bg-red-50/50' : wk ? 'bg-slate-50/70' : ''}`}
                      style={{ left: i * dw, width: dw, height: bodyH }}
                    >
                      {view === 'day' && <div className="absolute top-0 h-full border-r border-dashed border-line/40" style={{ left: dw / 2 }} />}
                    </div>
                  )
                })}
                {/* 行の下線 */}
                {visible.map((_, i) => (
                  <div key={i} className="absolute left-0 border-b border-line/60" style={{ top: (i + 1) * ROW_H - 1, width: totalW }} />
                ))}
                {/* 依存線 */}
                <svg className="pointer-events-none absolute left-0 top-0" width={totalW} height={bodyH}>
                  {depLines.map((l, i) => {
                    const midX = l.x2 - 8
                    return (
                      <g key={i}>
                        <path
                          d={`M${l.x1},${l.y1} L${midX},${l.y1} L${midX},${l.y2} L${l.x2},${l.y2}`}
                          fill="none"
                          stroke={l.critical ? '#d64545' : '#94a3b8'}
                          strokeWidth={1.2}
                        />
                        <path d={`M${l.x2},${l.y2} l-5,-3 l0,6 z`} fill={l.critical ? '#d64545' : '#94a3b8'} />
                      </g>
                    )
                  })}
                </svg>
                {/* バー */}
                {visible.map((t, i) => (
                  <GanttRow key={t.id} task={t} row={i} dw={dw} preview={preview?.id === t.id ? preview : null}
                    onStartDrag={startDrag}
                    onContext={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: t.id }) }}
                    onSelect={() => setSelected(new Set([t.id]))}
                    onOpenProgress={() => { setProgressModal(t); setProgressVal(t.progress) }}
                  />
                ))}
                {/* 現在日時の縦線 */}
                <div className="today-line pointer-events-none absolute top-0 z-10 border-l-2 border-ng" style={{ left: (dayIndex(format(todayDate, 'yyyy-MM-dd')) + 0.5) * dw, height: bodyH }}>
                  <span className="absolute -top-0 -translate-x-1/2 rounded-b bg-ng px-1 text-[9px] text-white">本日</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 凡例 */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-canvas px-3 py-1.5 text-[11px] text-ink-soft">
          <Legend2 color="#005bac" label="予定バー" />
          <Legend2 color="#2e8b57" label="実績バー" />
          <span className="flex items-center gap-1"><span className="inline-block h-1 w-5 bg-slate-400" />基準工程</span>
          <span className="flex items-center gap-1"><span className="text-ng">◆</span> マイルストン</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-0.5 bg-ng" /> 本日</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 border border-ng bg-red-50" /> 遅延</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 bg-slate-50 ring-1 ring-line" /> 土日・祝</span>
          <span className="ml-auto">クリティカル工程は赤の依存線で表示 ／ 工程バーはドラッグで移動・右端で期間変更</span>
        </div>
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
              <Info label="予定期間" value={`${progressModal.planStart.slice(5)} 〜 ${progressModal.planEnd.slice(5)}`} />
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
      <Modal open={forecastOpen} onClose={() => setForecastOpen(false)} title="AI工期予測（準備中）" size="lg"
        footer={<button className="btn-primary" onClick={() => setForecastOpen(false)}>閉じる</button>}>
        <ForecastView />
      </Modal>
    </div>
  )
}

function GanttHeader({ dw, view }: { dw: number; view: ViewMode }) {
  // 月グループ
  const months: { label: string; span: number }[] = []
  days.forEach((d) => {
    const label = format(d, 'yyyy年M月')
    const last = months[months.length - 1]
    if (last && last.label === label) last.span += 1
    else months.push({ label, span: 1 })
  })
  return (
    <div className="sticky top-0 z-20 bg-canvas">
      <div className="flex h-6 border-b border-line">
        {months.map((m, i) => (
          <div key={i} className="flex items-center border-r border-line px-2 text-[12px] font-semibold text-ink" style={{ width: m.span * dw }}>
            {m.label}
          </div>
        ))}
      </div>
      <div className="flex h-10 border-b border-line">
        {days.map((d, i) => {
          const wk = isWeekend(d)
          const hol = isHoliday(d)
          const showNum = view === 'day' || view === 'week' || d.getDate() === 1 || d.getDay() === 1
          return (
            <div key={i} className={`flex flex-col items-center justify-center gap-0.5 border-r border-line/70 ${hol ? 'bg-red-50 text-ng' : wk ? 'bg-slate-50 text-slate-400' : 'text-ink-soft'}`} style={{ width: dw }}>
              {showNum && <span className="text-[11px] font-medium leading-none tabular-nums">{d.getDate()}</span>}
              {view === 'day' && <span className="text-[11px] leading-none">{weekdayLabel(d)}</span>}
              {view === 'day' && <span className="text-[11px] leading-none">{weatherFor(d)}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GanttRow({
  task: t, row, dw, preview, onStartDrag, onContext, onSelect, onOpenProgress,
}: {
  task: WbsTask; row: number; dw: number
  preview: { ds: number; de: number } | null
  onStartDrag: (e: React.PointerEvent, t: WbsTask, mode: 'move' | 'resize') => void
  onContext: (e: React.MouseEvent) => void
  onSelect: () => void
  onOpenProgress: () => void
}) {
  const ds = preview?.ds ?? 0
  const de = preview?.de ?? 0
  const planLeft = (dayIndex(t.planStart) + ds) * dw
  const planW = (dayIndex(t.planEnd) - dayIndex(t.planStart) + 1 + (de - ds)) * dw
  const top = row * ROW_H

  if (t.isMilestone) {
    return (
      <div className="absolute" style={{ top: top + 5, left: planLeft + dw / 2 - 7 }} onContextMenu={onContext} onClick={onSelect}>
        <div className="h-3.5 w-3.5 rotate-45 bg-ng" title={`${t.name}（マイルストン）`} />
      </div>
    )
  }

  const color = statusColor[t.status] ?? '#005bac'

  // 実績バー
  let actualEl = null
  if (t.actualStart) {
    const aEnd = t.actualEnd ?? format(todayDate, 'yyyy-MM-dd')
    const aLeft = dayIndex(t.actualStart) * dw
    const aW = (dayIndex(aEnd) - dayIndex(t.actualStart) + 1) * dw
    actualEl = (
      <div className="absolute rounded-sm" style={{ top: top + 18, left: aLeft, width: aW, height: 7, background: '#2e8b57', opacity: 0.9 }} title={`実績 ${t.actualStart.slice(5)}〜${aEnd.slice(5)}`} />
    )
  }

  if (t.isParent) {
    return (
      <>
        <div className="absolute" style={{ top: top + 8, left: planLeft, width: planW, height: 8 }} onContextMenu={onContext} onClick={onSelect}>
          <div className="h-2 w-full bg-sysken-700" style={{ clipPath: 'polygon(0 0,100% 0,100% 60%,calc(100% - 5px) 100%,5px 100%,0 60%)' }} />
        </div>
        {actualEl}
      </>
    )
  }

  return (
    <>
      {/* 基準工程（薄い線） */}
      <div className="absolute rounded-sm bg-slate-300" style={{ top: top + 3, left: (dayIndex(t.planStart)) * dw, width: (dayIndex(t.planEnd) - dayIndex(t.planStart) + 1) * dw, height: 3, opacity: 0.7 }} />
      {/* 予定バー */}
      <div
        className={`group absolute flex items-center rounded-sm ${t.status === '遅延' ? 'ring-1 ring-ng' : ''}`}
        style={{ top: top + 6, left: planLeft, width: planW, height: 11, background: color, opacity: 0.9, cursor: 'grab' }}
        onPointerDown={(e) => onStartDrag(e, t, 'move')}
        onContextMenu={onContext}
        onClick={onSelect}
        onDoubleClick={onOpenProgress}
        title={`${t.name} ｜ 予定 ${t.planStart.slice(5)}〜${t.planEnd.slice(5)} ｜ 進捗${t.progress}% ｜ ${t.actualPeople || t.planPeople}名`}
      >
        {/* 進捗塗り */}
        <div className="absolute left-0 top-0 h-full rounded-l-sm bg-black/25" style={{ width: `${t.progress}%` }} />
        {/* 人数表示 */}
        {planW > 40 && <span className="relative z-10 px-1 text-[9px] text-white">{t.actualPeople || t.planPeople}名</span>}
        {/* リサイズハンドル */}
        <div className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100" style={{ background: 'rgba(255,255,255,0.6)' }} onPointerDown={(e) => onStartDrag(e, t, 'resize')} />
      </div>
      {actualEl}
    </>
  )
}

function ForecastView() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded border border-dashed border-sysken-300 bg-sysken-50 px-3 py-2 text-xs text-sysken-700">
        AI工期予測：準備中 ／ 現在はサンプルデータによる表示です。
      </div>
      <div className="grid grid-cols-5 gap-2">
        {[
          { l: '現在の進捗率', v: `${forecast.progressActual}%` },
          { l: '予定進捗率', v: `${forecast.progressPlan}%` },
          { l: '当初完了予定', v: forecast.originalDue.slice(5) },
          { l: '予測完了日', v: forecast.forecastDue.slice(5), tone: 'ng' },
          { l: '予測差分', v: `+${forecast.diffDays}日`, tone: 'ng' },
          { l: '残り工程数', v: `${forecast.remainingTasks}` },
          { l: '遅延工程数', v: `${forecast.delayedTasks}`, tone: 'warn' },
          { l: '必要要員数', v: `${forecast.requiredPeople}名` },
          { l: '天候影響', v: forecast.weatherImpact },
          { l: 'リスクレベル', v: forecast.riskLevel, tone: 'warn' },
        ].map((k) => (
          <div key={k.l} className="rounded border border-line bg-white p-2">
            <p className="text-[11px] text-ink-soft">{k.l}</p>
            <p className={`mt-0.5 text-sm font-bold ${k.tone === 'ng' ? 'text-ng' : k.tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{k.v}</p>
          </div>
        ))}
      </div>
      <div className="h-64 rounded border border-line p-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={forecastSeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#005bac" stopOpacity={0.2} /><stop offset="100%" stopColor="#005bac" stopOpacity={0} /></linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
            <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} unit="%" />
            <Tooltip contentStyle={{ borderRadius: 4, border: '1px solid #d6dce3', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="plan" name="予定進捗" stroke="#94a3b8" strokeWidth={2} fill="none" />
            <Area type="monotone" dataKey="actual" name="実績進捗" stroke="#005bac" strokeWidth={2.5} fill="url(#pf)" />
            <Line type="monotone" dataKey="predict" name="予測進捗" stroke="#d64545" strokeWidth={2} strokeDasharray="5 4" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
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
function Legend2({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1"><span className="inline-block h-2 w-5 rounded-sm" style={{ background: color }} />{label}</span>
}
