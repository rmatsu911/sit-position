/**
 * カレンダー（工程・マイルストーン・期限を1画面へ統合）。
 *
 * イベントは共通API（GET /schedule/calendar/events）で一括取得する。
 * 日付の計算は src/lib/timeline.ts の共通処理だけを使い、画面専用の変換を作らない。
 * カレンダー専用のデータは持たず、選択すると元データの画面へ移動する。
 */
import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  AlertTriangle, ChevronLeft, ChevronRight, Filter, RotateCcw, Save, Trash2,
} from 'lucide-react'
import { PageHeader } from '../../components/layout/Breadcrumb'
import { Panel } from '../../components/ui/common'
import { useApp } from '../../context/AppContext'
import { ApiError } from '../../lib/apiClient'
import {
  calendarGrid, eventOnDay, formatJst, jstDateKey, nowJst, shiftCalendarAnchor,
  type CalendarView,
} from '../../lib/timeline'
import { JP_HOLIDAYS } from '../../lib/holidays'
import {
  EMPTY_CALENDAR_FILTERS, hasAnyCalendarFilter, RECORD_KIND_LABEL, SOURCE_KIND_STYLE,
  useCalendarEvents, useCalendarOptions, useDeleteCalendarSearch, useSaveCalendarSearch,
  useSavedCalendarSearches,
  type CalendarEvent, type CalendarFilters, type CalendarOptions,
} from '../../api/calendar'
import { ScheduleTabs } from './ScheduleTabs'

const VIEWS: { key: CalendarView; label: string }[] = [
  { key: 'month', label: '月表示' },
  { key: 'week', label: '週表示' },
]

const WEEKDAYS = ['月', '火', '水', '木', '金', '土', '日']

// ===== URLクエリ ⇔ 画面状態 =====
function nums(v: string | null): number[] {
  return (v ?? '').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)
}
function strs(v: string | null): string[] {
  return (v ?? '').split(',').filter(Boolean)
}

function filtersFromParams(p: URLSearchParams): CalendarFilters {
  return {
    q: p.get('q') ?? '',
    projectIds: nums(p.get('projects')),
    sourceKinds: strs(p.get('kinds')).filter((k) => k in SOURCE_KIND_STYLE),
    statuses: strs(p.get('statuses')),
    responsibleIds: nums(p.get('responsibles')),
    companyIds: nums(p.get('companies')),
  }
}

function paramsFromState(f: CalendarFilters, view: CalendarView, anchor: string): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.projectIds.length) p.set('projects', f.projectIds.join(','))
  if (f.sourceKinds.length) p.set('kinds', f.sourceKinds.join(','))
  if (f.statuses.length) p.set('statuses', f.statuses.join(','))
  if (f.responsibleIds.length) p.set('responsibles', f.responsibleIds.join(','))
  if (f.companyIds.length) p.set('companies', f.companyIds.join(','))
  if (view !== 'month') p.set('view', view)
  p.set('date', anchor)
  return p
}

export default function ScheduleCalendar() {
  const navigate = useNavigate()
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()

  // 案件詳細ルートではパスの案件IDを優先する（URLクエリで別案件へ広がらない）
  const scopedProjectId = Number(id) > 0 ? Number(id) : undefined

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams])
  const view: CalendarView = searchParams.get('view') === 'week' ? 'week' : 'month'
  const today = jstDateKey(nowJst())
  const anchor = /^\d{4}-\d{2}-\d{2}$/.test(searchParams.get('date') ?? '')
    ? (searchParams.get('date') as string)
    : today

  const apply = useCallback(
    (next: { filters?: CalendarFilters; view?: CalendarView; anchor?: string }) => {
      // 戻る・進むで復元できるよう履歴を残す
      setSearchParams(paramsFromState(
        next.filters ?? filters, next.view ?? view, next.anchor ?? anchor,
      ))
    },
    [filters, view, anchor, setSearchParams],
  )

  const grid = useMemo(() => calendarGrid(view, anchor), [view, anchor])
  const { data, isLoading, isError, error } = useCalendarEvents(
    filters, { from: grid.from, to: grid.to }, scopedProjectId,
  )
  const { data: options } = useCalendarOptions(scopedProjectId)

  const [filterOpen, setFilterOpen] = useState(false)

  // 日付キーごとのイベント。判定は共通の eventOnDay（半開区間）に任せる。
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const day of grid.days) {
      map.set(day, (data?.events ?? []).filter((e) => eventOnDay(day, e.start_at, e.end_at)))
    }
    return map
  }, [grid.days, data])

  const title = view === 'month'
    ? formatJst(`${grid.monthKey}-01`, 'yyyy年M月')
    : `${formatJst(grid.from, 'yyyy/MM/dd')} 〜 ${formatJst(grid.to, 'MM/dd')}`

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '案件一覧', to: '/projects' }, { label: '工程管理', to: '/schedule' },
                     { label: 'カレンダー' }]}
        title="カレンダー"
        description={`${scopedProjectId ? '対象案件で絞り込み中 ／ ' : ''}工程・マイルストーン・期限を1画面で確認します`}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded border border-line bg-white p-0.5"
                 role="group" aria-label="表示方式">
              {VIEWS.map((v) => (
                <button key={v.key} onClick={() => apply({ view: v.key })} aria-pressed={view === v.key}
                  className={`rounded px-2.5 py-1 text-xs font-medium ${
                    view === v.key ? 'bg-sysken-500 text-white' : 'text-ink hover:bg-canvas'}`}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        }
      />
      <ScheduleTabs projectId={scopedProjectId} />

      <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-line bg-white px-2 py-1.5">
        <div className="flex items-center gap-1">
          <button aria-label="前へ" title="前へ"
            onClick={() => apply({ anchor: shiftCalendarAnchor(view, anchor, -1) })}
            className="rounded border border-line p-1 text-ink hover:bg-canvas">
            <ChevronLeft size={15} />
          </button>
          <button onClick={() => apply({ anchor: today })}
            className="rounded border border-line px-2 py-1 text-xs text-ink hover:bg-canvas">
            今日
          </button>
          <button aria-label="次へ" title="次へ"
            onClick={() => apply({ anchor: shiftCalendarAnchor(view, anchor, 1) })}
            className="rounded border border-line p-1 text-ink hover:bg-canvas">
            <ChevronRight size={15} />
          </button>
        </div>
        <span className="ml-1 text-[15px] font-semibold text-ink" data-calendar-title>{title}</span>

        <input className="field !w-52 !py-1 text-xs" placeholder="件名・案件名"
          value={filters.q} onChange={(e) => apply({ filters: { ...filters, q: e.target.value } })} />
        <button onClick={() => setFilterOpen((v) => !v)}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-ink hover:bg-canvas">
          <Filter size={15} className="text-sysken-600" />絞り込み
        </button>
        <button onClick={() => apply({ filters: EMPTY_CALENDAR_FILTERS })}
          disabled={!hasAnyCalendarFilter(filters)}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-ink hover:bg-canvas disabled:opacity-40">
          <RotateCcw size={15} className="text-sysken-600" />条件をクリア
        </button>
        <div className="mx-1 h-6 w-px bg-line" />
        <SavedSearchBar filters={filters} view={view}
          onApply={(f, v) => setSearchParams(paramsFromState(f, v, anchor))} />
        <span className="ml-auto text-xs text-ink-soft">
          {isLoading ? '検索中…' : isError ? '取得に失敗しました'
            : `イベント ${data?.displayed ?? 0} 件（期間内）`}
        </span>
      </div>

      {filterOpen && options && (
        <FilterPanel filters={filters} options={options}
          onChange={(f) => apply({ filters: f })} />
      )}

      {/* 凡例（種別は source_kind で識別する） */}
      <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-line bg-white px-3 py-1.5 text-[11px] text-ink-soft">
        {Object.entries(SOURCE_KIND_STYLE).map(([key, s]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${s.dot}`} />{s.label}
          </span>
        ))}
        <span className="ml-auto">予定・実績・期限はイベント内に表示します</span>
      </div>

      {isError && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-4 py-3 text-center text-[13px] text-ng">
          {error instanceof ApiError && error.status === 403
            ? 'この画面を表示する権限がありません。'
            : `カレンダーの取得に失敗しました（${error instanceof ApiError ? error.message : '原因不明のエラー'}）。`}
        </div>
      )}
      {isLoading && (
        <div className="mb-2 rounded border border-line bg-white px-4 py-6 text-center text-[13px] text-ink-soft">
          予定を検索しています…
        </div>
      )}
      {!isLoading && !isError && data?.total === 0 && (
        <div className="mb-2 rounded border border-line bg-white px-4 py-8 text-center text-[13px] text-ink-soft">
          <p className="font-medium text-ink">この期間に表示できる予定はありません</p>
          <p className="mt-1">前後の期間へ移動するか、絞り込み条件を変更してください。</p>
        </div>
      )}
      {data?.truncated && (
        <div className="mb-2 flex items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-ink">
          <AlertTriangle size={15} className="text-wn" />
          該当 {data.total} 件のうち先頭 {data.displayed} 件のみ表示しています（上限 {data.limit} 件）。
          絞り込み条件を追加してください。
        </div>
      )}

      <Panel className="overflow-hidden" bodyClassName="p-0">
        <div className="grid grid-cols-7 border-b border-line bg-canvas">
          {WEEKDAYS.map((w, i) => (
            <div key={w} className={`px-2 py-1.5 text-center text-[12px] font-semibold ${
              i === 5 ? 'text-sysken-600' : i === 6 ? 'text-ng' : 'text-ink-soft'}`}>{w}</div>
          ))}
        </div>
        <div className="thin-scroll max-h-[calc(100vh-380px)] overflow-y-auto">
          <div className="grid grid-cols-7">
            {grid.days.map((day, i) => (
              <DayCell
                key={day}
                dateKey={day}
                events={byDay.get(day) ?? []}
                inMonth={view === 'week' || day.startsWith(grid.monthKey)}
                isToday={day === today}
                weekend={i % 7 >= 5}
                holiday={JP_HOLIDAYS.includes(day)}
                tall={view === 'week'}
                onOpen={(e) => navigate(e.source_url)}
              />
            ))}
          </div>
        </div>
      </Panel>
    </div>
  )
}

function DayCell({
  dateKey, events, inMonth, isToday, weekend, holiday, tall, onOpen,
}: {
  dateKey: string
  events: CalendarEvent[]
  inMonth: boolean
  isToday: boolean
  weekend: boolean
  holiday: boolean
  tall: boolean
  onOpen: (e: CalendarEvent) => void
}) {
  return (
    <div
      data-calendar-day={dateKey}
      data-today={isToday ? 'true' : undefined}
      className={`min-h-[104px] border-b border-r border-line/70 p-1 ${tall ? 'min-h-[320px]' : ''} ${
        !inMonth ? 'bg-slate-50/60' : holiday ? 'bg-red-50/40' : weekend ? 'bg-slate-50/40' : 'bg-white'}`}
    >
      <div className="mb-1 flex items-center gap-1">
        <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums ${
          isToday ? 'bg-ng font-semibold text-white' : inMonth ? 'text-ink' : 'text-ink-soft'}`}>
          {formatJst(dateKey, 'd')}
        </span>
        {isToday && <span className="text-[10px] font-semibold text-ng">本日</span>}
        {events.length > 0 && (
          <span className="ml-auto text-[10px] text-ink-soft tabular-nums">{events.length}</span>
        )}
      </div>
      {/* 同じ日の複数イベントは積み重ねる（1件にまとめない） */}
      <div className="space-y-0.5">
        {events.map((e) => <EventChip key={e.event_id} event={e} onOpen={onOpen} />)}
      </div>
    </div>
  )
}

function EventChip({ event: e, onOpen }: { event: CalendarEvent; onOpen: (e: CalendarEvent) => void }) {
  const style = SOURCE_KIND_STYLE[e.source_kind]
    ?? { label: e.source_kind, chip: 'border-line bg-white text-ink', dot: 'bg-slate-400' }
  const half = e.schedule_precision === 'half_day'
  const when = half
    ? `${formatJst(e.start_at, 'MM/dd')} ${formatJst(e.start_at, 'HH') === '12' ? '午後' : '午前'}`
    : formatJst(e.start_at, 'MM/dd')
  const label = `${style.label}｜${RECORD_KIND_LABEL[e.record_kind] ?? e.record_kind}`
    + `｜${e.project_code} ${e.title}`
    + `｜${when}${e.end_at ? ` 〜 ${formatJst(e.end_at, 'MM/dd')}` : ''}`
    + `｜状態 ${e.status}`
    + `｜担当 ${e.responsible_name ?? '未割当'}`
    + `${e.company_name ? `｜担当会社 ${e.company_name}` : ''}`
  return (
    <button
      type="button"
      onClick={() => onOpen(e)}
      title={label}
      aria-label={label}
      data-calendar-event={e.event_id}
      data-source-kind={e.source_kind}
      data-record-kind={e.record_kind}
      className={`flex w-full items-center gap-1 truncate rounded border px-1 py-0.5 text-left text-[11px] focus:outline-none focus:ring-2 focus:ring-sysken-400 ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className="shrink-0 rounded bg-white/70 px-1 text-[10px] text-ink-soft">
        {RECORD_KIND_LABEL[e.record_kind] ?? e.record_kind}
      </span>
      <span className="truncate">{e.title}</span>
    </button>
  )
}

function FilterPanel({
  filters, options, onChange,
}: { filters: CalendarFilters; options: CalendarOptions; onChange: (f: CalendarFilters) => void }) {
  const multiNum = (
    label: string, values: number[], items: { id: number; name: string }[],
    apply: (v: number[]) => void,
  ) => (
    <div>
      <label className="label">{label}</label>
      <select multiple className="field h-24 !py-1 text-xs" value={values.map(String)}
        onChange={(e) => apply([...e.target.selectedOptions].map((o) => Number(o.value)))}>
        {items.map((it) => <option key={it.id} value={it.id}>{it.name}（ID {it.id}）</option>)}
      </select>
    </div>
  )
  return (
    <div className="mb-2 grid grid-cols-2 gap-3 rounded border border-line bg-white px-3 py-3 md:grid-cols-3 xl:grid-cols-5">
      {multiNum('案件', filters.projectIds, options.projects,
        (v) => onChange({ ...filters, projectIds: v }))}
      <div>
        <label className="label">イベント種別</label>
        <select multiple className="field h-24 !py-1 text-xs" value={filters.sourceKinds}
          onChange={(e) => onChange({ ...filters, sourceKinds: [...e.target.selectedOptions].map((o) => o.value) })}>
          {options.source_kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </div>
      <div>
        <label className="label">状態</label>
        <select multiple className="field h-24 !py-1 text-xs" value={filters.statuses}
          onChange={(e) => onChange({ ...filters, statuses: [...e.target.selectedOptions].map((o) => o.value) })}>
          {options.statuses.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {multiNum('担当者', filters.responsibleIds, options.responsibles,
        (v) => onChange({ ...filters, responsibleIds: v }))}
      {multiNum('担当会社', filters.companyIds, options.companies,
        (v) => onChange({ ...filters, companyIds: v }))}
    </div>
  )
}

function SavedSearchBar({
  filters, view, onApply,
}: {
  filters: CalendarFilters
  view: CalendarView
  onApply: (f: CalendarFilters, v: CalendarView) => void
}) {
  const { toast } = useApp()
  const { data: saved = [] } = useSavedCalendarSearches()
  const save = useSaveCalendarSearch()
  const remove = useDeleteCalendarSearch()
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
        conditions: { ...filters, view },
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
            { ...EMPTY_CALENDAR_FILTERS, ...c,
              sourceKinds: (c.sourceKinds ?? []).filter((k) => k in SOURCE_KIND_STYLE) },
            c.view === 'week' ? 'week' : 'month',
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
