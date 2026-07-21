import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ExternalLink, Truck, Wrench, HardHat, AlertTriangle, Clock } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel, EmptyState } from '../components/ui/common'
import { StatusBadge, Badge } from '../components/ui/Badge'
import { Progress } from '../components/ui/Progress'
import { PhotoPlaceholder } from '../components/ui/PhotoPlaceholder'
import { projectById, todayEnv } from '../data/projects'
import { photos } from '../data/photos'
import { manYen } from '../lib/format'
import NotFound from './NotFound'

const TABS = ['概要', '作業内容', '工程', '施工写真', '図面', '現場日報', '品質', '要員', '資材', '報告書', '操作履歴'] as const
type Tab = (typeof TABS)[number]

const routeByTab: Partial<Record<Tab, string>> = {
  工程: '/schedule', 施工写真: '/photos', 図面: '/drawings', 現場日報: '/daily-report', 品質: '/quality', 要員: '/personnel', 報告書: '/reports',
}

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const p = projectById(id ?? '')
  const [tab, setTab] = useState<Tab>('概要')

  if (!p) return <NotFound />

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: '案件一覧', to: '/projects' }, { label: p.name }]}
        title={p.name}
        description={`${p.code} ／ ${p.client} ／ ${p.location}`}
        actions={<><StatusBadge status={p.status} /><button className="btn-primary" onClick={() => navigate('/schedule')}>工程管理を開く</button></>}
      />

      {/* 基本情報 */}
      <Panel className="mb-3">
        <div className="grid grid-cols-6 gap-x-6 gap-y-3 text-[13px]">
          <KV label="工事名" value={p.name} />
          <KV label="案件番号" value={p.code} />
          <KV label="顧客" value={p.client} />
          <KV label="工事場所" value={p.location} />
          <KV label="工事区分" value={p.category} />
          <KV label="担当部署" value={p.department} />
          <KV label="開始日" value={p.startDate} />
          <KV label="終了予定日" value={p.dueDate} />
          <KV label="現場責任者" value={p.manager} />
          <KV label="予定予算" value={manYen(p.budgetPlan)} />
          <KV label="使用予算" value={manYen(p.budgetUsed)} />
          <KV label="更新日時" value={p.updatedAt} />
          <div className="col-span-3">
            <p className="mb-1 text-[11px] text-ink-soft">全体進捗率</p>
            <Progress value={p.progressActual} plan={p.progressPlan} height={12} />
          </div>
        </div>
      </Panel>

      {/* タブ */}
      <div className="mb-3 flex flex-wrap gap-0.5 border-b border-line">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] font-medium ${tab === t ? 'border-sysken-500 text-sysken-700' : 'border-transparent text-ink-soft hover:text-ink'}`}>{t}</button>
        ))}
      </div>

      {tab === '概要' && <Overview manager={p.manager} />}
      {tab === '作業内容' && <WorkContent />}
      {tab === '資材' && <Materials />}
      {tab === '操作履歴' && <History />}
      {(['工程', '施工写真', '図面', '現場日報', '品質', '要員', '報告書'] as Tab[]).includes(tab) && (
        <LinkTab tab={tab} to={routeByTab[tab]!} onGo={() => navigate(routeByTab[tab]!)} projectId={p.id} />
      )}
    </div>
  )
}

function KV({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-ink-soft">{label}</p><p className="mt-0.5 font-medium text-ink">{value}</p></div>
}

function Overview({ manager }: { manager: string }) {
  const list = [
    { icon: Truck, label: '使用車両', value: '高所作業車 1台、資材運搬車 1台' },
    { icon: Wrench, label: '必要工具', value: 'OTDR、融着接続機、光パワーメータ' },
    { icon: HardHat, label: '作業班', value: '第二班（4名）' },
  ]
  return (
    <div className="grid grid-cols-3 gap-4">
      <Panel title="工事概要" className="col-span-2">
        <p className="text-[13px] leading-relaxed text-ink">
          熊本中央局における光設備の更改工事。既設ケーブル・クロージャの撤去更新、光ファイバの融着接続、接続損失測定、ONU設置、切替作業および通信試験までを実施する。局内工事と宅内工事を含み、切替時は無停止での作業品質が求められる。
        </p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <Info label="現在の工程" value="接続・試験工（接続損失測定）" />
          <Info label="今日の作業内容" value="接続損失測定の継続 / ONU設置準備" />
          <Info label="本日の作業場所" value="局舎1F MDF室 / 局前 電柱区間" />
          <Info label="現場責任者" value={manager} />
          <Info label="作業開始時刻" value="08:00" />
          <Info label="終了予定時刻" value="17:00" />
        </div>
        <div className="mt-3 space-y-2">
          {list.map((l) => (
            <div key={l.label} className="flex items-center gap-2 rounded border border-line bg-canvas px-3 py-1.5 text-[13px]">
              <l.icon size={16} className="text-sysken-500" /><span className="text-ink-soft">{l.label}：</span><span className="text-ink">{l.value}</span>
            </div>
          ))}
        </div>
      </Panel>
      <div className="space-y-4">
        <Panel title="危険予知・環境">
          <ul className="space-y-1.5 text-[13px]">
            <li className="flex items-start gap-1.5"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />局前道路の通行車両に注意、交通誘導員配置</li>
            <li className="flex items-start gap-1.5"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-warn" />高所作業時の墜落防止（フルハーネス）</li>
          </ul>
          <div className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-2 text-xs">
            <div><span className="text-ink-soft">天候：</span>{todayEnv.weather}</div>
            <div><span className="text-ink-soft">熱中症指数：</span><span className="font-medium text-warn">WBGT {todayEnv.wbgt}</span></div>
          </div>
        </Panel>
        <Panel title="未対応事項">
          <ul className="space-y-1.5 text-[13px] text-ink">
            <li className="flex items-center gap-1.5"><Badge tone="ng">要対応</Badge>接続損失測定の遅延</li>
            <li className="flex items-center gap-1.5"><Badge tone="warn">確認</Badge>ONU設置写真の再撮影</li>
            <li className="flex items-center gap-1.5"><Badge tone="warn">確認</Badge>ケーブル余長の品質確認</li>
          </ul>
        </Panel>
        <Panel title="必要資材">
          <ul className="space-y-1 text-[13px] text-ink-soft">
            <li>光成端箱 2 / パッチコード 12 / 融着スリーブ 20</li>
          </ul>
        </Panel>
        <div className="rounded border border-line bg-white p-3 text-xs text-ink-soft shadow-panel">
          <p className="flex items-center gap-1"><Clock size={13} />直近の更新：2026/07/21 15:12 ／ {manager}</p>
        </div>
      </div>
    </div>
  )
}

function WorkContent() {
  return (
    <Panel title="作業内容">
      <ol className="space-y-2 text-[13px]">
        {['接続損失測定の継続（局前区間）', '融着点の測定データ記録', 'ONU設置準備（宅内A棟）', '完成写真の撮影・整理'].map((w, i) => (
          <li key={i} className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-sysken-500 text-[11px] text-white">{i + 1}</span>{w}</li>
        ))}
      </ol>
    </Panel>
  )
}

function Materials() {
  const rows = [
    { name: '光成端箱', spec: '24芯', plan: 4, used: 2, unit: '台' },
    { name: 'パッチコード', spec: 'SC/APC 2m', plan: 24, used: 12, unit: '本' },
    { name: '融着スリーブ', spec: '60mm', plan: 60, used: 40, unit: '個' },
    { name: 'クロージャ', spec: '中容量', plan: 3, used: 3, unit: '台' },
    { name: 'ケーブル固定金具', spec: '—', plan: 40, used: 28, unit: '個' },
  ]
  return (
    <Panel title="資材" bodyClassName="p-0">
      <table className="grid-table text-[13px]">
        <thead className="bg-canvas text-xs text-ink-soft"><tr>{['資材名', '仕様', '予定数', '使用数', '残', '単位'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="hover:bg-canvas"><td className="px-3 py-1.5 font-medium">{r.name}</td><td className="px-3 text-ink-soft">{r.spec}</td><td className="px-3 tabular-nums">{r.plan}</td><td className="px-3 tabular-nums">{r.used}</td><td className="px-3 tabular-nums text-ink-soft">{r.plan - r.used}</td><td className="px-3 text-ink-soft">{r.unit}</td></tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

function History() {
  const rows = [
    { at: '2026/07/21 15:12', user: '高橋 誠', act: '接続損失測定の進捗を60%に更新' },
    { at: '2026/07/21 11:00', user: 'システム', act: '写真未提出の通知を生成' },
    { at: '2026/07/21 09:32', user: '品質 管理者', act: 'ONU設置写真に再撮影依頼' },
    { at: '2026/07/20 16:40', user: '田中 一郎', act: 'クロージャ設置を完了に変更' },
    { at: '2026/07/20 08:05', user: '伊藤 直樹', act: '切替手順図を更新' },
  ]
  return (
    <Panel title="操作履歴" bodyClassName="p-0">
      <ul className="divide-y divide-line">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
            <span className="w-36 shrink-0 tabular-nums text-ink-soft">{r.at}</span>
            <span className="w-24 shrink-0 text-ink">{r.user}</span>
            <span className="text-ink-soft">{r.act}</span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function LinkTab({ tab, onGo, projectId }: { tab: Tab; to: string; onGo: () => void; projectId: string }) {
  const sample = photos.filter((p) => p.projectId === projectId).slice(0, 6)
  return (
    <Panel title={tab} action={<button className="btn-default btn-xs" onClick={onGo}><ExternalLink size={14} />{tab}画面を開く</button>}>
      {tab === '施工写真' ? (
        <div className="grid grid-cols-6 gap-3">
          {sample.map((p) => (
            <div key={p.id} className="overflow-hidden rounded border border-line">
              <PhotoPlaceholder type={p.colorKey} no={p.no} className="aspect-[4/3] w-full" />
              <div className="px-2 py-1"><StatusBadge status={p.confirm} /></div>
            </div>
          ))}
        </div>
      ) : tab === '工程' ? (
        <div className="text-[13px] text-ink">
          <p className="mb-2">現在の工程：<span className="font-medium">接続・試験工（接続損失測定）</span> ／ 全体進捗 72%（予定80%）</p>
          <div className="flex items-center gap-2"><Badge tone="ng" dot>遅延あり</Badge><Badge tone="info">クリティカル工程進行中</Badge></div>
          <p className="mt-3 text-ink-soft">詳細なWBS・ガントチャートは工程管理画面でご確認ください。</p>
        </div>
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
