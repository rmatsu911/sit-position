import { useNavigate } from 'react-router-dom'
import {
  FolderKanban, Hammer, CalendarCheck, AlertTriangle, Camera, ShieldCheck,
  Users, CloudSun, Thermometer, Wind, ArrowUpRight, Clock,
} from 'lucide-react'
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from 'recharts'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { StatusBadge, Badge } from '../components/ui/Badge'
import { Progress } from '../components/ui/Progress'
import { projects, dashboardKpi, progressChart, todayEnv } from '../data/projects'
import { notifications } from '../data/notifications'
import { useDashboardSummary } from '../api/dashboard'
import type { DashboardSummary } from '../api/dashboard'

// KPIの表示メタ（値は集計APIから取得。取得前は固定値をフォールバック表示）
const kpiMeta = [
  { key: 'total', label: '全案件数', unit: '件', icon: FolderKanban, tone: 'info', to: '/projects' },
  { key: 'active', label: '進行中', unit: '件', icon: Hammer, tone: 'info', to: '/projects?status=施工中' },
  { key: 'workingToday', label: '本日作業中', unit: '件', icon: Clock, tone: 'info', to: '/projects' },
  { key: 'finishToday', label: '今日完了予定', unit: '件', icon: CalendarCheck, tone: 'ok', to: '/projects' },
  { key: 'delayed', label: '遅延案件', unit: '件', icon: AlertTriangle, tone: 'ng', to: '/projects?status=遅延' },
  { key: 'photoPending', label: '写真未提出', unit: '枚', icon: Camera, tone: 'warn', to: '/photos' },
  { key: 'qualityWaiting', label: '品質確認待ち', unit: '件', icon: ShieldCheck, tone: 'warn', to: '/quality' },
  { key: 'peopleToday', label: '本日の要員', unit: '名', icon: Users, tone: 'info', to: '/personnel' },
] as const

const toneText: Record<string, string> = { info: 'text-sysken-600', ok: 'text-ok', warn: 'text-warn', ng: 'text-ng' }
const toneBg: Record<string, string> = { info: 'bg-sysken-50 text-sysken-600', ok: 'bg-emerald-50 text-ok', warn: 'bg-amber-50 text-warn', ng: 'bg-red-50 text-ng' }

// 遅延・注意案件
const alertCases = [
  { id: 'a1', level: '高', name: '熊本中央局 光設備更改工事', issue: '接続損失測定が4日遅延', owner: '高橋 誠', due: '2026/07/22', status: '施工中', to: '/projects/p1' },
  { id: 'a2', level: '中', name: '八代エリア FTTH増設工事', issue: '施工写真3枚未提出', owner: '山田 太郎', due: '2026/07/21', status: '未着手', to: '/photos' },
  { id: 'a3', level: '中', name: '合志市 基地局設備更新工事', issue: '要員不足の可能性', owner: '田中 一郎', due: '2026/07/23', status: '確認待ち', to: '/personnel' },
  { id: 'a4', level: '高', name: '天草地区 通信設備復旧工事', issue: '工程遅延（15%遅れ）', owner: '渡辺 修', due: '2026/07/24', status: '遅延', to: '/projects/p7' },
  { id: 'a5', level: '低', name: '玉名局 クロージャ更新工事', issue: '完成図書の提出期限接近', owner: '高橋 誠', due: '2026/07/25', status: '確認待ち', to: '/reports' },
]

export default function Dashboard() {
  const navigate = useNavigate()
  const { data: summary } = useDashboardSummary()
  const src: DashboardSummary = summary ?? (dashboardKpi as unknown as DashboardSummary)
  const kpis = kpiMeta.map((m) => ({ ...m, value: src[m.key as keyof DashboardSummary] ?? 0 }))
  const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'ダッシュボード' }]} title="ダッシュボード" description="施工管理部 ／ 本日の工事状況サマリー" />

      {/* KPI */}
      <div className="mb-4 grid grid-cols-8 gap-2.5">
        {kpis.map((k) => (
          <button key={k.label} onClick={() => navigate(k.to)} className="flex flex-col items-start rounded border border-line bg-white p-3.5 text-left shadow-panel transition-colors hover:border-sysken-300">
            <div className={`mb-2 flex h-9 w-9 items-center justify-center rounded ${toneBg[k.tone]}`}><k.icon size={19} /></div>
            <p className="text-[12.5px] text-ink-soft">{k.label}</p>
            <p className="mt-0.5"><span className={`text-[28px] font-bold leading-none ${toneText[k.tone]}`}>{k.value}</span><span className="ml-0.5 text-[13px] text-ink-soft">{k.unit}</span></p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* 左：工程進捗＋遅延・注意案件 */}
        <div className="col-span-2 space-y-4">
          <Panel title="案件別 工程進捗（予定 vs 実績）">
            <div className="space-y-3">
              {progressChart.map((p) => (
                <div key={p.name}>
                  <div className="mb-1 flex items-center justify-between text-[13px]">
                    <span className="font-medium text-ink">{p.name}</span>
                    <span className="text-ink-soft">実績 {p.actual}% ／ 予定 {p.plan}%{p.actual < p.plan && <span className="ml-1 font-medium text-ng">(-{p.plan - p.actual})</span>}</span>
                  </div>
                  <Progress value={p.actual} plan={p.plan} showLabel={false} height={10} />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-3 border-t border-line pt-2 text-[11px] text-ink-soft">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-sysken-500" />実績</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 rounded-sm bg-warn" />予定遅れ</span>
              <span className="flex items-center gap-1"><span className="inline-block h-3 w-0.5 bg-ink/40" />予定進捗ライン</span>
            </div>
          </Panel>

          {/* 遅延・注意案件 */}
          <Panel title="遅延・注意案件" bodyClassName="p-0"
            action={<span className="text-[12px] text-ink-soft">要対応 {alertCases.length} 件</span>}>
            <table className="grid-table text-[13px]">
              <thead className="bg-canvas text-[12.5px] text-ink-soft">
                <tr>{['重要度', '案件名', '問題内容', '担当者', '対応期限', 'ステータス', ''].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {alertCases.map((a) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-canvas" onClick={() => navigate(a.to)}>
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
          </Panel>
        </div>

        {/* 右：注意・環境 */}
        <div className="space-y-4">
          <Panel title="本日の現場環境">
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <Env icon={CloudSun} label="天気" value={todayEnv.weather} />
              <Env icon={Thermometer} label="気温" value={todayEnv.temp} />
              <Env icon={AlertTriangle} label="熱中症" value={`WBGT ${todayEnv.wbgt}`} tone="warn" />
              <Env icon={Wind} label="風" value="やや強い" tone="warn" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
              {todayEnv.advisory.map((a) => <Badge key={a} tone="warn" dot>{a}</Badge>)}
              <Badge tone="ng" dot>作業中止対象：高所作業（強風時）</Badge>
            </div>
          </Panel>

          <Panel title="通知・注意事項" action={<button onClick={() => navigate('/notifications')} className="flex items-center gap-0.5 text-xs text-sysken-600">すべて<ArrowUpRight size={13} /></button>} bodyClassName="p-0">
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
          </Panel>
        </div>
      </div>

      {/* 簡易ガント（今週） */}
      <Panel title="今週の主要工程（簡易ガント）" className="mt-4">
        <MiniGantt />
      </Panel>

      <div className="mt-4 grid grid-cols-3 gap-4">
        {/* 案件一覧 */}
        <Panel title="案件一覧" className="col-span-2" bodyClassName="p-0" action={<button onClick={() => navigate('/projects')} className="flex items-center gap-0.5 text-xs text-sysken-600">案件一覧へ<ArrowUpRight size={13} /></button>}>
          <div className="thin-scroll overflow-x-auto">
            <table className="grid-table text-[13px]">
              <thead className="bg-canvas text-[12.5px] text-ink-soft">
                <tr>{['案件番号', '工事名', '顧客', 'エリア', '現場責任者', '完了予定', '進捗', 'ステータス', '写真', '品質'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="cursor-pointer hover:bg-canvas" onClick={() => navigate(`/projects/${p.id}`)}>
                    <td className="px-3 tabular-nums text-ink-soft">{p.code}</td>
                    <td className="px-3 font-medium text-ink">{p.name}</td>
                    <td className="px-3 text-ink-soft">{p.client}</td>
                    <td className="px-3 text-ink-soft">{p.area}</td>
                    <td className="px-3 text-ink-soft">{p.manager}</td>
                    <td className="px-3 tabular-nums text-ink-soft">{p.dueDate.slice(5)}</td>
                    <td className="w-28 px-3"><Progress value={p.progressActual} plan={p.progressPlan} height={7} /></td>
                    <td className="px-3"><StatusBadge status={p.status} /></td>
                    <td className="px-3 text-center">{p.unconfirmedPhotos > 0 ? <Badge tone="warn">{p.unconfirmedPhotos}</Badge> : <span className="text-ink-soft">0</span>}</td>
                    <td className="px-3 text-center">{p.qualityChecks > 0 ? <Badge tone="warn">{p.qualityChecks}</Badge> : <span className="text-ink-soft">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* 最近更新 */}
        <Panel title="最近更新された案件" bodyClassName="p-0">
          <ul className="divide-y divide-line">
            {recent.map((p) => (
              <li key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="cursor-pointer px-3 py-2.5 hover:bg-canvas">
                <p className="truncate text-[13px] font-medium text-ink">{p.name}</p>
                <p className="mt-0.5 text-xs text-ink-soft">進捗を{p.progressActual}%に更新 ／ {p.manager}</p>
                <p className="flex items-center gap-1 text-[11px] text-slate-400"><Clock size={11} />{p.updatedAt}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}

function Env({ icon: Icon, label, value, tone }: { icon: typeof CloudSun; label: string; value: string; tone?: 'warn' }) {
  return (
    <div className="flex items-center gap-2 rounded border border-line bg-canvas px-2 py-1.5">
      <Icon size={18} className={tone === 'warn' ? 'text-warn' : 'text-sysken-500'} />
      <div className="min-w-0"><p className="text-[11px] text-ink-soft">{label}</p><p className={`truncate font-medium ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{value}</p></div>
    </div>
  )
}

// 今週の簡易ガント（AM/PM）
const weekData = [
  { day: '7/21', dow: '月', am: '融着', pm: '測定', plan: 90, actual: 82, delay: false },
  { day: '7/22', dow: '火', am: '測定', pm: 'ONU', plan: 80, actual: 60, delay: true },
  { day: '7/23', dow: '水', am: 'ONU', pm: '成端', plan: 70, actual: 0, delay: false },
  { day: '7/24', dow: '木', am: '成端', pm: '成端', plan: 60, actual: 0, delay: false },
  { day: '7/25', dow: '金', am: '切替', pm: '試験', plan: 50, actual: 0, delay: false },
]
function MiniGantt() {
  return (
    <div className="grid grid-cols-2 gap-6">
      <table className="grid-table text-xs">
        <thead className="text-ink-soft"><tr><th className="px-2 py-1 text-left">日付</th><th className="px-2 py-1 text-left">曜日</th><th className="px-2 py-1 text-left">AM</th><th className="px-2 py-1 text-left">PM</th><th className="px-2 py-1 text-left">予定/実績</th><th className="px-2 py-1 text-left">状態</th></tr></thead>
        <tbody>
          {weekData.map((d) => (
            <tr key={d.day} className="hover:bg-canvas">
              <td className="px-2 py-1.5 tabular-nums">{d.day}</td>
              <td className="px-2 py-1.5">{d.dow}</td>
              <td className="px-2 py-1.5"><Badge tone="info">{d.am}</Badge></td>
              <td className="px-2 py-1.5"><Badge tone="info">{d.pm}</Badge></td>
              <td className="px-2 py-1.5 tabular-nums text-ink-soft">{d.plan}% / {d.actual}%</td>
              <td className="px-2 py-1.5">{d.delay ? <Badge tone="ng" dot>遅延</Badge> : d.actual > 0 ? <Badge tone="info" dot>施工中</Badge> : <Badge tone="muted">予定</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={weekData} margin={{ top: 6, right: 8, left: -10, bottom: 0 }} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#667085' }} axisLine={false} tickLine={false} unit="%" />
            <Tooltip contentStyle={{ borderRadius: 4, border: '1px solid #d6dce3', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="plan" name="予定" fill="#cbd5e1" radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Bar dataKey="actual" name="実績" fill="#005bac" radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
