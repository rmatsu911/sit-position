/**
 * 案件一覧。
 *
 * 絞り込み・並び替え・ページネーションはすべてサーバー側（GET /projects/search）で行う。
 * URLを検索条件の正とし、画面側で別の絞り込みや件数集計をしない。
 * 表示件数と全件数（total）はAPIレスポンスをそのまま使う。
 */
import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, Plus, FileDown, Columns3, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel, EmptyState } from '../components/ui/common'
import { StatusBadge } from '../components/ui/Badge'
import { Progress } from '../components/ui/Progress'
import { Modal } from '../components/ui/Modal'
import { useApp } from '../context/AppContext'
import { useAuth } from '../auth/AuthContext'
import {
  DEFAULT_PER_PAGE, EMPTY_PROJECT_FILTERS, hasAnyProjectFilter, PROJECT_SORTS,
  useCreateProject, useProjectFilterOptions, useProjectSearch,
  type ApiProject, type ProjectFilters, type ProjectSort,
} from '../api/projects'
import { ApiError } from '../lib/apiClient'

// ===== URLクエリ ⇔ 検索条件（1対1） =====
function nums(v: string | null): number[] {
  return (v ?? '').split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0)
}
function strs(v: string | null): string[] {
  return (v ?? '').split(',').filter(Boolean)
}

function filtersFromParams(p: URLSearchParams): ProjectFilters {
  return {
    q: p.get('q') ?? '',
    statuses: strs(p.get('statuses')),
    managerIds: nums(p.get('managers')),
    companyIds: nums(p.get('companies')),
    areas: strs(p.get('areas')),
    departmentIds: nums(p.get('depts')),
    delayedOnly: p.get('delayed') === '1',
    dateFrom: p.get('from') ?? '',
    dateTo: p.get('to') ?? '',
  }
}

function paramsFromState(
  f: ProjectFilters, page: number, perPage: number, sort: ProjectSort, newId?: number | null,
): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.statuses.length) p.set('statuses', f.statuses.join(','))
  if (f.managerIds.length) p.set('managers', f.managerIds.join(','))
  if (f.companyIds.length) p.set('companies', f.companyIds.join(','))
  if (f.areas.length) p.set('areas', f.areas.join(','))
  if (f.departmentIds.length) p.set('depts', f.departmentIds.join(','))
  if (f.delayedOnly) p.set('delayed', '1')
  if (f.dateFrom) p.set('from', f.dateFrom)
  if (f.dateTo) p.set('to', f.dateTo)
  if (page !== 1) p.set('page', String(page))
  if (perPage !== DEFAULT_PER_PAGE) p.set('per_page', String(perPage))
  if (sort !== 'recent') p.set('sort', sort)
  if (newId) p.set('new', String(newId))
  return p
}

export default function Projects() {
  const { toast } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams])
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const perPage = Number(searchParams.get('per_page')) || DEFAULT_PER_PAGE
  const sort: ProjectSort = PROJECT_SORTS.some((s) => s.key === searchParams.get('sort'))
    ? (searchParams.get('sort') as ProjectSort)
    : 'recent'
  // 登録直後の案件。一覧内で強調し、条件で隠れている場合は明示する。
  const newId = Number(searchParams.get('new')) || null

  const apply = useCallback(
    (next: { filters?: ProjectFilters; page?: number; perPage?: number; sort?: ProjectSort; newId?: number | null }) => {
      setSearchParams(paramsFromState(
        next.filters ?? filters,
        // 条件を変えたら1ページ目へ戻す（指定があればそれを優先）
        next.page ?? (next.filters || next.sort ? 1 : page),
        next.perPage ?? perPage,
        next.sort ?? sort,
        next.newId === undefined ? newId : next.newId,
      ))
    },
    [filters, page, perPage, sort, newId, setSearchParams],
  )
  const setFilters = useCallback((f: ProjectFilters) => apply({ filters: f, page: 1 }), [apply])

  const { data, isLoading, isError, error, isFetching } = useProjectSearch(filters, page, perPage, sort)
  const { data: options } = useProjectFilterOptions()

  const [newOpen, setNewOpen] = useState(false)
  const [selected, setSelected] = useState<Set<number>>(new Set())

  const canCreate = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER'
  const items = data?.items ?? []
  const forbidden = isError && error instanceof ApiError && error.status === 403
  // 登録した案件が現在の条件では表示されていない状態（保存はできている）
  const newHidden = !!newId && !isLoading && !isError && !items.some((p) => p.id === newId)

  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map((p) => p.id)))
  }

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '案件一覧' }]}
        title="案件一覧"
        description={data ? `該当 ${data.total} 件 ／ ${data.page} / ${data.pages} ページ` : '案件を検索しています…'}
        actions={
          <>
            <button className="btn-default" onClick={() => toast('この操作は現在準備中です')}><Columns3 size={15} />表示列設定</button>
            <button className="btn-default" onClick={() => toast('この操作は現在準備中です', 'info')}><FileDown size={15} />CSV出力</button>
            {canCreate && (
              <button className="btn-primary" onClick={() => setNewOpen(true)}><Plus size={15} />新規案件登録</button>
            )}
          </>
        }
      />

      {/* 検索条件（すべてURL→APIへ渡す。画面側で絞り込まない） */}
      <Panel className="mb-3">
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-2">
            <label className="label">フリーワード（工事名・案件番号・顧客・責任者）</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input className="field pl-8" value={filters.q} placeholder="キーワードを入力"
                onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
            </div>
          </div>
          <MultiSelect label="ステータス" values={filters.statuses} items={options?.statuses ?? []}
            onChange={(v) => setFilters({ ...filters, statuses: v })} />
          <MultiSelect label="エリア" values={filters.areas} items={options?.areas ?? []}
            onChange={(v) => setFilters({ ...filters, areas: v })} />
          <MultiSelectId label="担当部署" values={filters.departmentIds} items={options?.departments ?? []}
            onChange={(v) => setFilters({ ...filters, departmentIds: v })} />
          <MultiSelectId label="現場責任者" values={filters.managerIds} items={options?.managers ?? []}
            onChange={(v) => setFilters({ ...filters, managerIds: v })} />
          <MultiSelectId label="担当会社（工程の担当会社）" values={filters.companyIds} items={options?.companies ?? []}
            onChange={(v) => setFilters({ ...filters, companyIds: v })} />
          <div>
            <label className="label">予定期間（開始）</label>
            <input type="date" className="field" value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
          </div>
          <div>
            <label className="label">予定期間（終了）</label>
            <input type="date" className="field" value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
          </div>
          <div>
            <label className="label">並び替え</label>
            <select className="field" value={sort} onChange={(e) => apply({ sort: e.target.value as ProjectSort, page: 1 })}>
              {PROJECT_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-4">
            <label className="flex items-center gap-1.5 text-[13px] text-ink">
              <input type="checkbox" className="h-4 w-4 accent-sysken-500" checked={filters.delayedOnly}
                onChange={(e) => setFilters({ ...filters, delayedOnly: e.target.checked })} />遅延案件のみ
            </label>
          </div>
          <div className="col-span-2 flex items-end justify-end gap-2">
            <button className="btn-default" disabled={!hasAnyProjectFilter(filters)}
              onClick={() => setFilters(EMPTY_PROJECT_FILTERS)}><RotateCcw size={15} />条件クリア</button>
            <span className="self-center text-xs text-ink-soft">
              {isFetching ? '検索中…' : data ? `該当 ${data.total} 件` : ''}
            </span>
          </div>
        </div>
      </Panel>

      {newHidden && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-ink">
          <AlertTriangle size={15} className="text-wn" />
          案件は登録済みですが、現在の絞り込み条件では表示されていません。
          <button className="btn-default btn-xs"
            onClick={() => setSearchParams(paramsFromState(EMPTY_PROJECT_FILTERS, 1, perPage, 'recent', newId))}>
            条件を解除して表示
          </button>
          <button className="ml-auto text-xs text-ink-soft hover:underline"
            onClick={() => apply({ newId: null })}>この通知を閉じる</button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="mb-2 flex items-center gap-3 rounded border border-sysken-200 bg-sysken-50 px-3 py-2 text-[13px]">
          <span className="font-medium text-sysken-700">{selected.size}件を選択中</span>
          <button className="btn-default btn-xs" onClick={() => toast('この操作は現在準備中です', 'info')}>ステータス変更</button>
          <button className="btn-default btn-xs" onClick={() => toast('この操作は現在準備中です', 'info')}>CSV出力</button>
          <button className="ml-auto text-xs text-ink-soft hover:underline" onClick={() => setSelected(new Set())}>選択解除</button>
        </div>
      )}

      <Panel bodyClassName="p-0" className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-ink-soft"><Loader2 size={22} className="animate-spin text-sysken-500" />案件を読み込んでいます...</div>
        ) : forbidden ? (
          <div className="flex flex-col items-center gap-2 py-14 text-ng">
            <AlertTriangle size={26} />
            <p className="text-[13px]">案件一覧を表示する権限がありません。</p>
            <p className="text-[12px] text-ink-soft">担当案件の割当については管理者へご確認ください。</p>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-14 text-ng">
            <AlertTriangle size={26} />
            <p className="text-[13px]">{error instanceof ApiError ? error.message : '案件の取得に失敗しました'}</p>
            <p className="text-[12px] text-ink-soft">バックエンドAPIが起動しているか確認してください。</p>
          </div>
        ) : items.length === 0 ? (
          <div className="py-10">
            <EmptyState label={hasAnyProjectFilter(filters) ? '条件に一致する案件はありません' : '登録されている案件はありません'} />
          </div>
        ) : (
          <>
            <div className="thin-scroll overflow-x-auto">
              <table className="grid-table text-[13px]">
                <thead className="bg-canvas text-[12.5px] text-ink-soft">
                  <tr>
                    <th className="px-3 py-2"><input type="checkbox" className="h-4 w-4 accent-sysken-500" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} /></th>
                    {['案件番号', '工事名', '顧客', 'エリア', '担当部署', '現場責任者', '開始日', '完了予定', '進捗率', 'ステータス', '写真未確認', '品質確認'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} data-project-row={p.id}
                      data-new={p.id === newId ? 'true' : undefined}
                      className={`hover:bg-canvas ${p.id === newId ? 'bg-ok/10 ring-1 ring-inset ring-ok/40' : selected.has(p.id) ? 'bg-sysken-50' : ''}`}>
                      <td className="px-3"><input type="checkbox" className="h-4 w-4 accent-sysken-500" checked={selected.has(p.id)} onChange={() => setSelected((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })} /></td>
                      <td className="cursor-pointer px-3 tabular-nums text-sysken-600" onClick={() => navigate(`/projects/${p.id}`)}>
                        {p.construction_number}
                        {p.id === newId && <span className="ml-1.5 rounded bg-ok px-1 py-0.5 text-[10px] text-white">新規</span>}
                      </td>
                      <td className="cursor-pointer px-3 font-medium text-ink hover:text-sysken-600" onClick={() => navigate(`/projects/${p.id}`)}>{p.name}</td>
                      <td className="px-3 text-ink-soft">{p.customer ?? '—'}</td>
                      <td className="px-3 text-ink-soft">{p.area ?? '—'}</td>
                      <td className="px-3 text-ink-soft">{p.department ?? '—'}</td>
                      <td className="px-3 text-ink-soft">{p.manager ?? '—'}</td>
                      <td className="px-3 tabular-nums text-ink-soft">{p.start_planned_at?.slice(5) ?? '—'}</td>
                      <td className="px-3 tabular-nums text-ink-soft">{p.finish_planned_at?.slice(5) ?? '—'}</td>
                      <td className="w-28 px-3"><Progress value={p.actual_progress} plan={p.planned_progress} height={7} /></td>
                      <td className="px-3"><StatusBadge status={p.status} /></td>
                      <td className="px-3 text-center tabular-nums">{p.unconfirmed_photos}</td>
                      <td className="px-3 text-center tabular-nums">{p.quality_checks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-line px-3 py-2 text-xs text-ink-soft">
              <span data-project-count>
                {data!.total}件中 {(data!.page - 1) * data!.per_page + 1}〜
                {Math.min(data!.page * data!.per_page, data!.total)}件を表示
              </span>
              <div className="flex items-center gap-1">
                <button className="btn-default btn-xs disabled:opacity-40" disabled={page <= 1}
                  onClick={() => apply({ page: page - 1 })}>前へ</button>
                {Array.from({ length: data!.pages }).map((_, i) => (
                  <button key={i} onClick={() => apply({ page: i + 1 })} data-page={i + 1}
                    className={`h-7 w-7 rounded text-xs ${page === i + 1 ? 'bg-sysken-500 text-white' : 'border border-line hover:bg-canvas'}`}>{i + 1}</button>
                ))}
                <button className="btn-default btn-xs disabled:opacity-40" disabled={page >= data!.pages}
                  onClick={() => apply({ page: page + 1 })}>次へ</button>
              </div>
            </div>
          </>
        )}
      </Panel>

      <NewProjectModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(created) => {
          // 登録した案件を必ず見つけられるよう、1ページ目・既定の並び順へ戻して強調する
          setSearchParams(paramsFromState(filters, 1, perPage, 'recent', created.id))
        }}
      />
    </div>
  )
}

function MultiSelect({
  label, values, items, onChange,
}: { label: string; values: string[]; items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select multiple className="field h-20 !py-1 text-xs" value={values}
        onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))}>
        {items.map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
    </div>
  )
}

function MultiSelectId({
  label, values, items, onChange,
}: { label: string; values: number[]; items: { id: number; name: string }[]; onChange: (v: number[]) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <select multiple className="field h-20 !py-1 text-xs" value={values.map(String)}
        onChange={(e) => onChange([...e.target.selectedOptions].map((o) => Number(o.value)))}>
        {items.map((it) => <option key={it.id} value={it.id}>{it.name}（ID {it.id}）</option>)}
      </select>
    </div>
  )
}

function NewProjectModal({
  open, onClose, onCreated,
}: { open: boolean; onClose: () => void; onCreated: (p: ApiProject) => void }) {
  const { toast } = useApp()
  const create = useCreateProject()
  // 初期値は空欄。顧客・日付に架空の既定値を入れない。
  const [form, setForm] = useState({
    construction_number: '', name: '', customer: '', area: '', location: '',
    start_planned_at: '', finish_planned_at: '', contract_amount: '',
  })
  const [err, setErr] = useState<string | null>(null)
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  async function submit() {
    // 二重送信を防ぐ（保存中は再実行しない）
    if (create.isPending) return
    setErr(null)
    if (!form.construction_number.trim() || !form.name.trim()) {
      setErr('工事番号と工事名は必須です')
      return
    }
    if (form.start_planned_at && form.finish_planned_at
        && form.start_planned_at > form.finish_planned_at) {
      setErr('着工予定日が完了予定日より後になっています')
      return
    }
    try {
      const created = await create.mutateAsync({
        construction_number: form.construction_number.trim(),
        name: form.name.trim(),
        customer: form.customer.trim() || undefined,
        area: form.area.trim() || undefined,
        location: form.location.trim() || undefined,
        start_planned_at: form.start_planned_at || null,
        finish_planned_at: form.finish_planned_at || null,
        contract_amount: form.contract_amount ? Number(form.contract_amount) : null,
        status: '未着工',
      })
      // 保存が成功したときだけ通知・一覧更新・モーダルを閉じる
      toast('案件を登録しました', 'ok')
      setForm({
        construction_number: '', name: '', customer: '', area: '', location: '',
        start_planned_at: '', finish_planned_at: '', contract_amount: '',
      })
      onCreated(created)
      onClose()
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '登録に失敗しました')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="新規案件登録" size="lg"
      footer={<>
        <button className="btn-default" onClick={onClose} disabled={create.isPending}>キャンセル</button>
        <button className="btn-primary" disabled={create.isPending} onClick={() => void submit()}>
          {create.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
          {create.isPending ? '登録中…' : '案件を登録'}
        </button>
      </>}>
      {err && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-ng">{err}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">工事番号 *</label>
          <input className="field" value={form.construction_number} onChange={(e) => set('construction_number', e.target.value)} placeholder="例: KM-2026-010" /></div>
        <div><label className="label">工事名 *</label>
          <input className="field" value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
        <div><label className="label">顧客</label>
          <input className="field" value={form.customer} onChange={(e) => set('customer', e.target.value)} /></div>
        <div><label className="label">エリア</label>
          <input className="field" value={form.area} onChange={(e) => set('area', e.target.value)} /></div>
        <div className="col-span-2"><label className="label">工事場所</label>
          <input className="field" value={form.location} onChange={(e) => set('location', e.target.value)} /></div>
        <div><label className="label">着工予定日</label>
          <input type="date" className="field" value={form.start_planned_at} onChange={(e) => set('start_planned_at', e.target.value)} /></div>
        <div><label className="label">完了予定日</label>
          <input type="date" className="field" value={form.finish_planned_at} onChange={(e) => set('finish_planned_at', e.target.value)} /></div>
        <div><label className="label">契約金額（円）</label>
          <input type="number" className="field" value={form.contract_amount} onChange={(e) => set('contract_amount', e.target.value)} /></div>
      </div>
    </Modal>
  )
}
