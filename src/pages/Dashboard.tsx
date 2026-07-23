import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  FolderKanban, Hammer, CalendarCheck, AlertTriangle, Camera, ShieldCheck,
  Users, CloudOff, ArrowUpRight, Clock,
} from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge, Badge } from '../components/ui/Badge'
import { Progress } from '../components/ui/Progress'
import { useDashboardSummary } from '../api/dashboard'
import type { DashboardSummary } from '../api/dashboard'
import { useProjects } from '../api/projects'
import { useNotifications } from '../api/notifications'

const kpiMeta = [
  { key: 'total', label: '全案件数', unit: '件', icon: FolderKanban, tone: 'info', to: '/projects' },
  { key: 'active', label: '進行中', unit: '件', icon: Hammer, tone: 'info', to: '/projects?status=施工中' },
  { key: 'workingToday', label: '本日作業中', unit: '件', icon: Clock, tone: 'info', to: '/projects' },
  { key: 'finishToday', label: '今日完了予定', unit: '件', icon: CalendarCheck, tone: 'ok', to: '/projects' },
  { key: 'delayed', label: '遅延案件', unit: '件', icon: AlertTriangle, tone: 'ng', to: '/projects?status=遅延' },
  { key: 'photoPending', label: '写真未確認', unit: '枚', icon: Camera, tone: 'warn', to: '/photos' },
  { key: 'qualityWaiting', label: '品質確認待ち', unit: '件', icon: ShieldCheck, tone: 'warn', to: '/quality' },
  { key: 'peopleToday', label: '本日の要員', unit: '名', icon: Users, tone: 'info', to: '/personnel' },
] as const

const toneText: Record<string, string> = { info: 'text-sysken-600', ok: 'text-ok', warn: 'text-warn', ng: 'text-ng' }
const toneBg: Record<string, string> = { info: 'bg-sysken-50 text-sysken-600', ok: 'bg-emerald-50 text-ok', warn: 'bg-amber-50 text-warn', ng: 'bg-red-50 text-ng' }

function ymd5(iso: string | null): string {
  return iso ? iso.slice(5) : '—'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: summary, isLoading: sumLoading } = useDashboardSummary()
  const { data: projects = [], isLoading: projLoading } = useProjects()
  const { data: notifications = [] } = useNotifications()

  const kpis = kpiMeta.map((m) => ({ ...m, value: summary ? (summary[m.key as keyof DashboardSummary] ?? 0) : null }))

  // 工程進捗（予定 vs 実績）：実績が予定より遅れている案件を優先表示
  const progressRows = useMemo(() =>
    [...projects]
      .map((p) => ({ id: p.id, name: p.name, plan: p.planned_progress, actual: p.actual_progress }))
      .sort((a, b) => (b.plan - b.actual) - (a.plan - a.actual))
      .slice(0, 6),
    [projects])

  // 遅延・注意案件：案件のステータス・未確認写真・品質確認待ちから導出
  const alerts = useMemo(() => {
    const rows: { id: number; level: string; name: string; issue: string; owner: string; due: string; status: string; to: string }[] = []
    for (const p of projects) {
      if (p.status === '遅延') {
        rows.push({ id: p.id, level: '高', name: p.name, issue: '工程が遅延しています', owner: p.manager ?? '—', due: ymd5(p.finish_planned_at), status: p.status, to: `/projects/${p.id}` })
      } else if (p.unconfirmed_photos > 0) {
        rows.push({ id: p.id, level: '中', name: p.name, issue: `未確認の施工写真 ${p.unconfirmed_photos} 枚`, owner: p.manager ?? '—', due: ymd5(p.finish_planned_at), status: p.status, to: '/photos' })
      } else if (p.quality_checks > 0) {
        rows.push({ id: p.id, level: '中', name: p.name, issue: `品質確認待ち ${p.quality_checks} 件`, owner: p.manager ?? '—', due: ymd5(p.finish_planned_at), status: p.status, to: '/quality' })
      }
    }
    return rows.slice(0, 8)
  }, [projects])

  const recent = useMemo(() =>
    [...projects].sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? '')).slice(0, 5),
    [projects])

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'ダッシュボード' }]} title="ダッシュボード" description="施工管理部 ／ 本日の工事状況サマリー" />

      {/* KPI */}
      <div className="mb-4 grid grid-cols-8 gap-2.5">
        {kpis.map((k) => (
          <button key={k.label} onClick={() => navigate(k.to)} className="flex flex-col items-start rounded border border-line bg-white p-3.5 text-left shadow-panel transition-colors hover:border-sysken-300">
            <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded ${toneBg[k.tone]}`}><k.icon size={19} /></div>
            <p className="text-[12.5px] text-ink-soft">{k.label}</p>
            <p className="mt-0.5"><span className={`text-[28px] font-bold leading-none ${toneText[k.tone]}`}>{k.value ?? (sumLoading ? '…' : 0)}</span><span className="ml-0.5 text-[13px] text-ink-soft">{k.unit}</span></p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* 左：工程進捗＋遅延・注意案件 */}
        <div className="col-span-2 space-y-4">
          <Panel title="案件別 工程進捗（予定 vs 実績）">
            {projLoading ? (
              <p className="py-6 text-center text-[13px] text-ink-soft">読み込み中…</p>
            ) : progressRows.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-soft">案件が登録されていません。</p>
            ) : (
              <div className="space-y-3">
                {progressRows.map((p) => (
                  <div key={p.id}>
                    <div className="mb-1 flex items-center justify-between text-[13px]">
                      <span className="font-medium text-ink">{p.name}</span>
                      <span className="text-ink-soft">実績 {p.actual}% ／ 予定 {p.plan}%{p.actual < p.plan && <span className="ml-1 font-medium text-ng">(-{p.plan - p.actual})</span>}</span>
                    </div>
                    <Progress value={p.actual} plan={p.plan} showLabel={false} height={10} />
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {/* 遅延・注意案件 */}
          <Panel title="遅延・注意案件" bodyClassName="p-0"
            action={<span className="text-[12px] text-ink-soft">要対応 {alerts.length} 件</span>}>
            {alerts.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13px] text-ink-soft">対応が必要な案件はありません。</p>
            ) : (
              <table className="grid-table text-[13px]">
                <thead className="bg-canvas text-[12.5px] text-ink-soft">
                  <tr>{['重要度', '案件名', '問題内容', '責任者', '完了予定', 'ステータス', ''].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {alerts.map((a, i) => (
                    <tr key={`${a.id}-${i}`} className="cursor-pointer hover:bg-canvas" onClick={() => navigate(a.to)}>
                      <td className="px-3"><Badge tone={a.level === '高' ? 'ng' : a.level === '中' ? 'warn' : 'muted'} dot>{a.level}</Badge></td>
                      <td className="px-3 font-medium text-ink">{a.name}</td>
                      <td className="px-3 text-ink-soft">{a.issue}</td>
                      <td className="px-3 text-ink-soft">{a.owner}</td>
                      <td className="px-3 tabular-nums text-ink-soft">{a.due}</td>
                      <td className="px-3"><StatusBadge status={a.status} /></td>
                      <td className="px-3 text-[12.5px] text-sysken-600">詳細</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>
        </div>

        {/* 右：環境・通知 */}
        <div className="space-y-4">
          <WeatherPanel />

          <Panel title="通知・注意事項" action={<button onClick={() => navigate('/notifications')} className="flex items-center gap-0.5 text-xs text-sysken-600">すべて<ArrowUpRight size={13} /></button>} bodyClassName="p-0">
            {notifications.length === 0 ? (
              <p className="px-3 py-8 text-center text-[13px] text-ink-soft">通知はありません。</p>
            ) : (
              <ul className="thin-scroll max-h-44 divide-y divide-line overflow-y-auto">
                {notifications.slice(0, 6).map((n) => (
                  <li key={n.id} onClick={() => navigate(n.link)} className="flex cursor-pointer items-start gap-2 px-3 py-2 hover:bg-canvas">
                    <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${n.important ? 'bg-ng' : n.read ? 'bg-slate-300' : 'bg-sysken-500'}`} />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-ink">{n.title}</p>
                      <p className="text-[11px] text-slate-400">{n.at}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {/* 案件一覧 */}
        <Panel title="案件一覧" className="col-span-2" bodyClassName="p-0" action={<button onClick={() => navigate('/projects')} className="flex items-center gap-0.5 text-xs text-sysken-600">案件一覧へ<ArrowUpRight size={13} /></button>}>
          <div className="thin-scroll overflow-x-auto">
            <table className="grid-table text-[13px]">
              <thead className="bg-canvas text-[12.5px] text-ink-soft">
                <tr>{['案件番号', '工事名', '顧客', 'エリア', '現場責任者', '完了予定', '進捗', 'ステータス', '写真', '品質'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {projects.length === 0 && (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-ink-soft">{projLoading ? '読み込み中…' : '案件が登録されていません。'}</td></tr>
                )}
                {projects.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-canvas" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td className="px-3 tabular-nums text-ink-soft">{p.construction_number}</td>
                    <td className="px-3 font-medium text-ink">{p.name}</td>
                    <td className="px-3 text-ink-soft">{p.customer ?? '—'}</td>
                    <td className="px-3 text-ink-soft">{p.area ?? '—'}</td>
                    <td className="px-3 text-ink-soft">{p.manager ?? '—'}</td>
                    <td className="px-3 tabular-nums text-ink-soft">{ymd5(p.finish_planned_at)}</td>
                    <td className="w-28 px-3"><Progress value={p.actual_progress} plan={p.planned_progress} height={7} /></td>
                    <td className="px-3"><StatusBadge status={p.status} /></td>
                    <td className="px-3 text-center">{p.unconfirmed_photos > 0 ? <Badge tone="warn">{p.unconfirmed_photos}</Badge> : <span className="text-ink-soft">0</span>}</td>
                    <td className="px-3 text-center">{p.quality_checks > 0 ? <Badge tone="warn">{p.quality_checks}</Badge> : <span className="text-ink-soft">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* 最近更新 */}
        <Panel title="最近更新された案件" bodyClassName="p-0">
          {recent.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-soft">案件がありません。</p>
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((p) => (
                <li key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer px-3 py-2.5 hover:bg-canvas">
                  <p className="truncate text-[13px] font-medium text-ink">{p.name}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">進捗 {p.actual_progress}% ／ {p.manager ?? '—'}</p>
                  <p className="flex items-center gap-1 text-[11px] text-slate-400"><Clock size={11} />{p.updated_at ? p.updated_at.slice(0, 16).replace('T', ' ') : '—'}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}

// 気象情報は未連携。架空のリアルタイム気象を表示せず、Empty State を出す。
// 将来 weather_records / 外部気象API 接続時に data を差し込める構造にしておく。
function WeatherPanel({ data }: { data?: { weather: string; temp: string; wbgt: number } | null }) {
  if (!data) {
    return (
      <Panel title="本日の現場環境">
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center text-ink-soft">
          <CloudOff size={26} />
          <p className="text-[13px]">気象情報は未連携です</p>
          <p className="text-[11.5px]">気象データ連携後、天気・気温・熱中症指数・注意報を表示します。</p>
        </div>
      </Panel>
    )
  }
  return (
    <Panel title="本日の現場環境">
      <div className="grid grid-cols-2 gap-2 text-[13px]">
        <div className="rounded border border-line bg-canvas px-2 py-1.5"><p className="text-[11px] text-ink-soft">天気</p><p className="font-medium text-ink">{data.weather}</p></div>
        <div className="rounded border border-line bg-canvas px-2 py-1.5"><p className="text-[11px] text-ink-soft">気温</p><p className="font-medium text-ink">{data.temp}</p></div>
      </div>
    </Panel>
  )
}
