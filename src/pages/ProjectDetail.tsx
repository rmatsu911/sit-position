import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, AlertTriangle, Clock, Loader2 } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel, EmptyState } from '../components/ui/common'
import { StatusBadge, Badge } from '../components/ui/Badge'
import { Progress } from '../components/ui/Progress'
import { Modal } from '../components/ui/Modal'
import { PhotoImage } from '../components/ui/PhotoImage'
import { manYen } from '../lib/format'
import { useAuth } from '../auth/AuthContext'
import { useSelectedProject, projectLabel } from '../components/ui/ProjectSelect'
import { useProject, useUpdateProject, type ApiProject } from '../api/projects'
import { useProjectTasks } from '../api/tasks'
import { usePhotos } from '../api/photos'
import { useProjectMaterials, useCreateMaterial } from '../api/materials'
import { useProjectAuditLogs } from '../api/audit'
import { formatJst, formatPeriod } from '../lib/timeline'
import { ApiError } from '../lib/apiClient'
import NotFound from './NotFound'

const TABS = ['概要', '作業内容', '工程', '施工写真', '図面', '現場日報', '品質', '要員', '資材', '報告書', '操作履歴'] as const
type Tab = (typeof TABS)[number]

// 案件詳細の各タブは案件配下ルートへ移動する（対象案件はパスの :id が正本）
const routeByTab: Partial<Record<Tab, string>> = {
  工程: 'schedule', 施工写真: 'photos', 図面: 'drawings', 現場日報: 'daily-report',
  品質: 'quality', 要員: 'personnel', 報告書: 'reports',
}

export default function ProjectDetail() {
  const navigate = useNavigate()
  const { user } = useAuth()
  // 案件IDの解決は共通コンテキストだけを正本にする（画面ごとの独自解析をしない）
  const { projectId } = useSelectedProject()
  const pid = projectId ?? NaN
  const { data: p, isLoading, isError, error } = useProject(Number.isNaN(pid) ? undefined : pid)
  const [tab, setTab] = useState<Tab>('概要')
  const [editOpen, setEditOpen] = useState(false)

  if (isLoading) {
    return <div className="flex items-center justify-center gap-2 py-24 text-ink-soft"><Loader2 size={24} className="animate-spin text-sysken-500" />案件を読み込んでいます...</div>
  }
  if (isError && error instanceof ApiError && error.status === 404) return <NotFound />
  if (isError || !p) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-ng">
        <AlertTriangle size={26} />
        <p className="text-[13px]">{error instanceof ApiError ? error.message : '案件の取得に失敗しました'}</p>
        <button className="btn-default mt-2" onClick={() => navigate('/projects')}>案件一覧へ戻る</button>
      </div>
    )
  }

  const code = p.construction_number
  const client = p.customer ?? '—'
  const location = p.location ?? p.area ?? '—'
  const dash = (v: string | null | undefined) => v ?? '—'
  // 更新できない権限には編集の入口を出さない（拒否はAPI側が最終判断）
  const canEdit = user?.role === 'ADMIN' || user?.role === 'PROJECT_MANAGER'

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '案件一覧', to: '/projects' }, { label: projectLabel(p) }]}
        title={p.name}
        description={`${projectLabel(p)} ／ ${client} ／ ${location}`}
        actions={<><StatusBadge status={p.status} />{canEdit && <button className="btn-default" data-edit-project onClick={() => setEditOpen(true)}>基本情報を編集</button>}<button className="btn-primary" onClick={() => navigate(`/projects/${p.id}/schedule`)}>工程管理を開く</button></>}
      />

      {/* 基本情報（API連携） */}
      <Panel className="mb-3">
        <div className="grid grid-cols-6 gap-x-6 gap-y-3 text-[13px]">
          <KV label="工事名" value={p.name} />
          <KV label="案件番号" value={code} />
          <KV label="顧客" value={client} />
          <KV label="工事場所" value={location} />
          <KV label="工事区分" value={dash(p.construction_type)} />
          <KV label="担当部署" value={dash(p.department)} />
          <KV label="開始日" value={dash(p.start_planned_at)} />
          <KV label="終了予定日" value={dash(p.finish_planned_at)} />
          <KV label="現場責任者" value={dash(p.manager)} />
          <KV label="予定予算" value={p.budget_planned != null ? manYen(p.budget_planned) : '—'} />
          <KV label="使用予算" value={p.budget_used != null ? manYen(p.budget_used) : '—'} />
          <KV label="更新日時" value={p.updated_at ? p.updated_at.slice(0, 16).replace('T', ' ') : '—'} />
          <div className="col-span-3">
            <p className="mb-1 text-[11px] text-ink-soft">全体進捗率</p>
            <Progress value={p.actual_progress} plan={p.planned_progress} height={12} />
          </div>
        </div>
      </Panel>

      {/* タブ */}
      <div className="mb-3 flex flex-wrap gap-0.5 border-b border-line">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] font-medium ${tab === t ? 'border-sysken-500 text-sysken-700' : 'border-transparent text-ink-soft hover:text-ink'}`}>{t}</button>
        ))}
      </div>

      {tab === '概要' && <Overview project={p} />}
      {tab === '作業内容' && <WorkContent projectId={pid} />}
      {tab === '資材' && <Materials projectId={pid} />}
      {tab === '操作履歴' && <History projectId={pid} />}
      {(['工程', '施工写真', '図面', '現場日報', '品質', '要員', '報告書'] as Tab[]).includes(tab) && (
        <LinkTab tab={tab} to={`/projects/${p.id}/${routeByTab[tab]!}`}
          onGo={() => navigate(`/projects/${p.id}/${routeByTab[tab]!}`)} projectId={String(p.id)} />
      )}
      <ProjectEditModal open={editOpen} onClose={() => setEditOpen(false)} project={p} />
    </div>
  )
}

function ProjectEditModal({ open, onClose, project }: { open: boolean; onClose: () => void; project: ApiProject }) {
  const update = useUpdateProject(project.id)
  const [form, setForm] = useState({
    name: project.name, customer: project.customer ?? '', area: project.area ?? '',
    location: project.location ?? '', start_planned_at: project.start_planned_at ?? '',
    finish_planned_at: project.finish_planned_at ?? '', status: project.status,
  })
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (open) setForm({
      name: project.name, customer: project.customer ?? '', area: project.area ?? '',
      location: project.location ?? '', start_planned_at: project.start_planned_at ?? '',
      finish_planned_at: project.finish_planned_at ?? '', status: project.status,
    })
  }, [open, project])
  async function save() {
    setError(null)
    if (!form.name.trim()) return setError('工事名は必須です')
    try {
      await update.mutateAsync({
        name: form.name.trim(), customer: form.customer || undefined, area: form.area || undefined,
        location: form.location || undefined, start_planned_at: form.start_planned_at || null,
        finish_planned_at: form.finish_planned_at || null, status: form.status,
      })
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '保存に失敗しました')
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="案件基本情報を編集" size="lg"
      footer={<><button className="btn-default" onClick={onClose}>キャンセル</button><button className="btn-primary" disabled={update.isPending} onClick={save}>{update.isPending ? '保存中…' : '保存'}</button></>}>
      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-ng">{error}</div>}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label">工事名 *</label><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><label className="label">顧客</label><input className="field" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} /></div>
        <div><label className="label">エリア</label><input className="field" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} /></div>
        <div className="col-span-2"><label className="label">工事場所</label><input className="field" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
        <div><label className="label">開始予定</label><input type="date" className="field" value={form.start_planned_at} onChange={(e) => setForm({ ...form, start_planned_at: e.target.value })} /></div>
        <div><label className="label">終了予定</label><input type="date" className="field" value={form.finish_planned_at} onChange={(e) => setForm({ ...form, finish_planned_at: e.target.value })} /></div>
        <div className="col-span-2"><label className="label">ステータス</label><select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['未着工','準備中','施工中','確認待ち','一時停止','遅延','完了','中止'].map((s) => <option key={s}>{s}</option>)}</select></div>
      </div>
    </Modal>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-ink-soft">{label}</p><p className="mt-0.5 font-medium text-ink">{value}</p></div>
}

function Overview({ project }: { project: ApiProject }) {
  const { data: tasks = [], isLoading: tasksLoading } = useProjectTasks(project.id)
  const { data: materials = [] } = useProjectMaterials(project.id)
  const dash = (v: string | null | undefined) => v ?? '—'

  // 「現在の工程」「未対応事項」は登録済みの実データから確定計算する（推測しない）
  const leaves = tasks.filter((t) => !t.isParent)
  const running = leaves.filter((t) => t.status === '施工中')
  const delayed = leaves.filter((t) => t.status === '遅延')
  const todo: { tone: 'ng' | 'warn'; label: string; text: string }[] = []
  if (delayed.length) todo.push({ tone: 'ng', label: '要対応', text: `遅延している工程 ${delayed.length} 件` })
  if (project.unconfirmed_photos > 0) todo.push({ tone: 'warn', label: '確認', text: `未確認の施工写真 ${project.unconfirmed_photos} 枚` })
  if (project.quality_checks > 0) todo.push({ tone: 'warn', label: '確認', text: `対応中の品質確認 ${project.quality_checks} 件` })

  return (
    <div className="grid grid-cols-3 gap-4">
      <Panel title="工事概要" className="col-span-2">
        <div className="grid grid-cols-2 gap-3">
          <Info label="顧客" value={dash(project.customer)} />
          <Info label="工事場所" value={dash(project.location ?? project.area)} />
          <Info label="工事区分" value={dash(project.construction_type)} />
          <Info label="現場責任者" value={dash(project.manager)} />
          <Info label="着工予定日" value={dash(project.start_planned_at)} />
          <Info label="完了予定日" value={dash(project.finish_planned_at)} />
          <Info label="現在の工程" value={tasksLoading ? '読み込み中…'
            : running.length ? running.map((t) => t.name).join(' / ')
            : leaves.length ? '施工中の工程はありません' : '工程が登録されていません'} />
          <Info label="登録済みの工程数" value={tasksLoading ? '—' : `${leaves.length} 件`} />
        </div>
        <p className="mt-3 border-t border-line pt-2 text-xs text-ink-soft">
          工事概要の説明文・使用車両・必要工具・作業班は、登録する項目が未整備のため表示していません。
          工程の内容は「工程」タブ、当日の作業実績は「現場日報」で確認できます。
        </p>
      </Panel>
      <div className="space-y-4">
        <Panel title="危険予知・環境">
          <div className="text-xs text-ink-soft">
            危険予知（KY）の記録は現場日報に登録します。案件単位のKY項目は未整備のため表示していません。
            天候・熱中症指数（WBGT）は気象情報が未連携のため表示していません。
          </div>
        </Panel>
        <Panel title="未対応事項">
          {todo.length === 0 ? (
            <p className="text-[13px] text-ink-soft">未対応の項目はありません。</p>
          ) : (
            <ul className="space-y-1.5 text-[13px] text-ink">
              {todo.map((t) => (
                <li key={t.text} className="flex items-center gap-1.5"><Badge tone={t.tone}>{t.label}</Badge>{t.text}</li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="必要資材">
          {materials.length === 0 ? (
            <p className="text-[13px] text-ink-soft">資材は登録されていません。</p>
          ) : (
            <ul className="space-y-1 text-[13px] text-ink-soft">
              {materials.slice(0, 5).map((m) => (
                <li key={m.id}>{m.name} {m.qty_planned ?? '—'}{m.unit ?? ''}（使用 {m.qty_used ?? 0}）</li>
              ))}
            </ul>
          )}
        </Panel>
        <div className="rounded border border-line bg-white p-3 text-xs text-ink-soft shadow-panel">
          <p className="flex items-center gap-1"><Clock size={13} />
            直近の更新：{project.updated_at ? project.updated_at.slice(0, 16).replace('T', ' ') : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

function WorkContent({ projectId }: { projectId: number }) {
  // 作業内容は固定文言ではなく、この案件に登録された工程から表示する
  const { data: tasks = [], isLoading, isError } = useProjectTasks(projectId)
  const leaves = tasks.filter((t) => !t.isParent)
  return (
    <Panel title="作業内容">
      {isLoading ? (
        <p className="text-[13px] text-ink-soft">工程を読み込んでいます...</p>
      ) : isError ? (
        <p className="text-[13px] text-ng">工程の取得に失敗しました。</p>
      ) : leaves.length === 0 ? (
        <p className="text-[13px] text-ink-soft">この案件には工程が登録されていません。「工程」タブから登録できます。</p>
      ) : (
        <ol className="space-y-2 text-[13px]">
          {leaves.map((t, i) => (
            <li key={t.id} className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sysken-500 text-[11px] text-white">{i + 1}</span>
              <span className="text-ink">{t.name}</span>
              <span className="ml-auto shrink-0 text-[12px] text-ink-soft">
                {t.planStartAt && t.planEndAt
                  ? formatPeriod(t.planStartAt, t.planEndAt, t.precision)
                  : '日程未設定'} ／ 進捗 {t.progress}%
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

function Materials({ projectId }: { projectId: number }) {
  const { data: rows = [], isLoading, isError } = useProjectMaterials(projectId)
  const createMut = useCreateMaterial()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', model_number: '', unit: '台', qty_planned: '', qty_used: '', status: '未入荷' })

  function submit() {
    if (!form.name) return
    createMut.mutate({
      project_id: projectId, name: form.name, model_number: form.model_number || undefined, unit: form.unit,
      qty_planned: form.qty_planned ? Number(form.qty_planned) : null, qty_used: form.qty_used ? Number(form.qty_used) : null,
      status: form.status,
    }, {
      onSuccess: () => { setOpen(false); setForm({ name: '', model_number: '', unit: '台', qty_planned: '', qty_used: '', status: '未入荷' }) },
    })
  }

  return (
    <Panel title="資材" bodyClassName="p-0"
      action={<button className="btn-default btn-xs" onClick={() => setOpen(true)}>＋ 資材を追加</button>}>
      <table className="grid-table text-[13px]">
        <thead className="bg-canvas text-[12.5px] text-ink-soft"><tr>{['資材名', '仕様/型番', '予定数', '使用数', '残', '単位', '使用工程', '状態'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
        <tbody>
          {isLoading && <tr><td colSpan={8} className="px-3 py-6 text-center text-ink-soft">読み込み中…</td></tr>}
          {isError && <tr><td colSpan={8} className="px-3 py-6 text-center text-ng">資材の取得に失敗しました。</td></tr>}
          {!isLoading && !isError && rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-ink-soft">資材が登録されていません。</td></tr>}
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-canvas">
              <td className="px-3 py-1.5 font-medium">{r.name}</td>
              <td className="px-3 text-ink-soft">{r.model_number ?? '—'}</td>
              <td className="px-3 tabular-nums">{r.qty_planned ?? '—'}</td>
              <td className="px-3 tabular-nums">{r.qty_used ?? '—'}</td>
              <td className="px-3 tabular-nums text-ink-soft">{r.qty_planned != null && r.qty_used != null ? r.qty_planned - r.qty_used : '—'}</td>
              <td className="px-3 text-ink-soft">{r.unit ?? '—'}</td>
              <td className="px-3 text-ink-soft">{r.task ?? '—'}</td>
              <td className="px-3"><Badge tone="muted">{r.status ?? '—'}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={open} onClose={() => setOpen(false)} title="資材を追加"
        footer={<><button className="btn-default" onClick={() => setOpen(false)}>キャンセル</button><button className="btn-primary" disabled={!form.name || createMut.isPending} onClick={submit}>{createMut.isPending ? '保存中…' : '登録'}</button></>}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><label className="label">資材名</label><input className="field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：光成端箱" /></div>
          <div><label className="label">仕様/型番</label><input className="field" value={form.model_number} onChange={(e) => setForm({ ...form, model_number: e.target.value })} /></div>
          <div><label className="label">単位</label><input className="field" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
          <div><label className="label">予定数</label><input type="number" className="field" value={form.qty_planned} onChange={(e) => setForm({ ...form, qty_planned: e.target.value })} /></div>
          <div><label className="label">使用数</label><input type="number" className="field" value={form.qty_used} onChange={(e) => setForm({ ...form, qty_used: e.target.value })} /></div>
          <div className="col-span-2"><label className="label">状態</label><select className="field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{['未入荷', '入荷済', '使用中', '消費済'].map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
      </Modal>
    </Panel>
  )
}

/**
 * 操作履歴。`audit_logs`（誰が何を操作したか）と `task_change_history`
 * （工程のどの項目がどう変わったか）に実際に記録されたものだけを出す。
 * 記録が無ければ「まだありません」と出す（固定の履歴を出さない）。
 */
function History({ projectId }: { projectId: number }) {
  const { data, isLoading, isError, error } = useProjectAuditLogs(projectId)
  return (
    <Panel title="操作履歴" bodyClassName="p-0">
      {isLoading && (
        <p className="px-4 py-6 text-center text-[13px] text-ink-soft">操作履歴を読み込んでいます…</p>
      )}
      {isError && (
        <p className="px-4 py-6 text-center text-[13px] text-ng">
          {error instanceof ApiError ? error.message : '操作履歴の取得に失敗しました'}
        </p>
      )}
      {data && data.entries.length === 0 && (
        <p className="px-4 py-8 text-center text-[13px] text-ink-soft" data-audit-empty>
          この案件の操作履歴はまだありません。
        </p>
      )}
      {data && data.entries.length > 0 && (
        <ul className="divide-y divide-line" data-audit-log>
          {data.entries.map((r, i) => (
            <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-[13px]" data-audit-entry={r.source}>
              <span className="w-36 shrink-0 tabular-nums text-ink-soft">
                {r.at ? formatJst(r.at, 'yyyy/MM/dd HH:mm') : '—'}
              </span>
              <span className="w-28 shrink-0 truncate text-ink">{r.user}</span>
              <span className="text-ink-soft">{r.summary}</span>
            </li>
          ))}
        </ul>
      )}
      {data && data.returned >= data.limit && (
        <p className="border-t border-line px-4 py-2 text-[12px] text-ink-soft">
          直近 {data.limit} 件を表示しています。
        </p>
      )}
    </Panel>
  )
}

function PhotoTabContent({ projectId }: { projectId: string }) {
  const { data: sample = [], isLoading, isError } = usePhotos(Number(projectId))
  if (isLoading) return <div className="py-6 text-center text-[13px] text-ink-soft">写真を読み込んでいます…</div>
  if (isError) return <div className="py-6 text-center text-[13px] text-ng">写真の取得に失敗しました。</div>
  if (sample.length === 0) return <div className="py-6"><EmptyState label="この案件の施工写真はまだ登録されていません" /></div>
  return (
    <div className="grid grid-cols-6 gap-3">
      {sample.slice(0, 6).map((p) => (
        <div key={p.id} className="overflow-hidden rounded border border-line">
          <PhotoImage url={p.thumbUrl ?? p.imageUrl} type={p.colorKey} no={p.no} className="aspect-[4/3] w-full" />
          <div className="px-2 py-1"><StatusBadge status={p.confirm} /></div>
        </div>
      ))}
    </div>
  )
}

function LinkTab({ tab, onGo, projectId }: { tab: Tab; to: string; onGo: () => void; projectId: string }) {
  return (
    <Panel title={tab} action={<button className="btn-default btn-xs" onClick={onGo}><ExternalLink size={14} />{tab}画面を開く</button>}>
      {tab === '施工写真' ? (
        <PhotoTabContent projectId={projectId} />
      ) : (
        <div className="py-6">
          <EmptyState label={`${tab}の詳細は「${tab}画面を開く」からご確認いただけます`} />
        </div>
      )}
    </Panel>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded border border-line bg-canvas px-2.5 py-1.5"><p className="text-[11px] text-ink-soft">{label}</p><p className="text-[13px] font-medium text-ink">{value}</p></div>
}
