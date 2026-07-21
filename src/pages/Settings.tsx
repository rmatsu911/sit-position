import { useState } from 'react'
import { User, Bell, Palette, Building2, ShieldCheck, Database } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { useApp } from '../context/AppContext'

const tabs = [
  { id: 'profile', label: 'プロフィール', icon: User },
  { id: 'notify', label: '通知', icon: Bell },
  { id: 'display', label: '表示', icon: Palette },
  { id: 'org', label: '組織・部署', icon: Building2 },
  { id: 'security', label: 'セキュリティ', icon: ShieldCheck },
  { id: 'data', label: 'データ', icon: Database },
] as const

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button onClick={onChange} className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-sysken-500' : 'bg-slate-300'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  )
}

function Line({ label, desc, on, set }: { label: string; desc: string; on: boolean; set: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-3 last:border-0">
      <div><p className="text-[13px] font-medium text-ink">{label}</p><p className="text-xs text-ink-soft">{desc}</p></div>
      <Toggle on={on} onChange={set} />
    </div>
  )
}

export default function Settings() {
  const { toast } = useApp()
  const [tab, setTab] = useState<string>('profile')
  const [flags, setFlags] = useState<Record<string, boolean>>({
    n1: true, n2: true, n3: false, n4: true, n5: true,
    d1: true, d2: false, d3: true,
  })
  const set = (k: string) => setFlags((f) => ({ ...f, [k]: !f[k] }))

  return (
    <div>
      <PageHeader breadcrumb={[{ label: '設定' }]} title="設定" description="システム設定・個人設定" />
      <div className="flex gap-4">
        <div className="w-52 shrink-0">
          <Panel bodyClassName="p-1">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)} className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-[13px] ${tab === t.id ? 'bg-sysken-50 font-medium text-sysken-700' : 'text-ink hover:bg-canvas'}`}>
                <t.icon size={16} className={tab === t.id ? 'text-sysken-500' : 'text-ink-soft'} />{t.label}
              </button>
            ))}
          </Panel>
        </div>

        <div className="min-w-0 flex-1">
          {tab === 'profile' && (
            <Panel title="プロフィール設定">
              <div className="grid max-w-2xl grid-cols-2 gap-4">
                <div><label className="label">氏名</label><input className="field" defaultValue="山田 太郎" /></div>
                <div><label className="label">社員番号</label><input className="field" defaultValue="SK-100234" /></div>
                <div><label className="label">メールアドレス</label><input className="field" defaultValue="yamada@example.co.jp" /></div>
                <div><label className="label">内線</label><input className="field" defaultValue="2201" /></div>
                <div><label className="label">部署</label><select className="field"><option>施工管理部 第一課</option><option>施工管理部 第二課</option><option>施工管理部 第三課</option></select></div>
                <div><label className="label">役割</label><select className="field"><option>工事長</option><option>現場責任者</option><option>技術者</option><option>品質管理担当</option></select></div>
                <div className="col-span-2"><label className="label">保有資格</label><input className="field" defaultValue="職長・安全衛生責任者 / 光ファイバ融着 / 普通自動車免許" /></div>
              </div>
              <div className="mt-4"><button className="btn-primary" onClick={() => toast('プロフィールを保存しました', 'ok')}>変更を保存</button></div>
            </Panel>
          )}
          {tab === 'notify' && (
            <Panel title="通知設定">
              <div className="max-w-2xl">
                <Line label="工程遅延の通知" desc="担当案件の工程が遅延したとき通知します" on={flags.n1} set={() => set('n1')} />
                <Line label="写真未提出の通知" desc="提出期限が近い写真をお知らせします" on={flags.n2} set={() => set('n2')} />
                <Line label="週次レポートメール" desc="毎週月曜に集計レポートを送信します" on={flags.n3} set={() => set('n3')} />
                <Line label="承認依頼の通知" desc="日報・報告書の承認依頼を通知します" on={flags.n4} set={() => set('n4')} />
                <Line label="資格期限・要員アラート" desc="資格期限や過剰配置を通知します" on={flags.n5} set={() => set('n5')} />
              </div>
              <div className="mt-4"><button className="btn-primary" onClick={() => toast('通知設定を保存しました', 'ok')}>変更を保存</button></div>
            </Panel>
          )}
          {tab === 'display' && (
            <Panel title="表示設定">
              <div className="max-w-2xl">
                <Line label="コンパクト表示" desc="一覧の行間を詰めて表示します" on={flags.d1} set={() => set('d1')} />
                <Line label="サイドバーを自動折りたたみ" desc="画面幅に応じてサイドバーを折りたたみます" on={flags.d2} set={() => set('d2')} />
                <Line label="工程管理を日表示で開く" desc="工程管理画面を既定で日表示にします" on={flags.d3} set={() => set('d3')} />
              </div>
              <p className="mt-4 rounded border border-line bg-canvas px-3 py-2 text-xs text-ink-soft">本システムはダークモードを使用しません（現場での視認性を優先）。</p>
            </Panel>
          )}
          {tab === 'org' && (
            <Panel title="組織・部署">
              <table className="grid-table max-w-2xl text-[13px]">
                <thead className="bg-canvas text-xs text-ink-soft"><tr>{['部署', '責任者', '人数', '担当案件数'].map((h) => <th key={h} className="px-3 py-2 text-left font-semibold">{h}</th>)}</tr></thead>
                <tbody>
                  {[['施工管理部 第一課', '山田 太郎', 12, 3], ['施工管理部 第二課', '佐藤 花子', 10, 3], ['施工管理部 第三課', '渡辺 修', 8, 2], ['品質管理課', '品質 管理者', 4, '—']].map((r) => (
                    <tr key={r[0] as string} className="hover:bg-canvas"><td className="px-3 py-1.5 font-medium">{r[0]}</td><td className="px-3">{r[1]}</td><td className="px-3 tabular-nums">{r[2]}名</td><td className="px-3 tabular-nums">{r[3]}</td></tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
          {tab === 'security' && (
            <Panel title="セキュリティ">
              <div className="max-w-2xl space-y-3 text-[13px]">
                <div className="rounded border border-line bg-canvas px-3 py-2"><p className="font-medium text-ink">認証方式</p><p className="text-ink-soft">デモ環境のため認証は無効化されています。</p></div>
                <div className="flex items-center justify-between rounded border border-line px-3 py-2"><span>パスワード変更</span><button className="btn-default btn-xs" onClick={() => toast('デモ環境では変更できません')}>変更</button></div>
                <div className="flex items-center justify-between rounded border border-line px-3 py-2"><span>操作ログの保持期間</span><span className="text-ink-soft">90日</span></div>
              </div>
            </Panel>
          )}
          {tab === 'data' && (
            <Panel title="データ">
              <div className="max-w-2xl space-y-3 text-[13px]">
                <div className="rounded border border-dashed border-sysken-300 bg-sysken-50 px-3 py-2 text-sysken-700">現在の接続：デモ環境（サンプルデータ）。バックエンド・データベースには接続していません。</div>
                <div className="flex items-center justify-between rounded border border-line px-3 py-2"><span>サンプルデータの再読み込み</span><button className="btn-default btn-xs" onClick={() => toast('サンプルデータを再読み込みしました', 'ok')}>再読み込み</button></div>
                <div className="flex items-center justify-between rounded border border-line px-3 py-2"><span>エクスポート（全案件）</span><button className="btn-default btn-xs" onClick={() => toast('エクスポートを開始しました（デモ）')}>エクスポート</button></div>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
