import { useState } from 'react'
import { User, Bell, Palette, Building2, ShieldCheck, Database } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { useApp } from '../context/AppContext'
import { useAuth } from '../auth/AuthContext'
import { SystemInfo } from '../components/system/SystemInfo'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '管理者', PROJECT_MANAGER: '案件管理者', FIELD_WORKER: '現場担当者', QUALITY_MANAGER: '品質管理者', VIEWER: '閲覧者',
}

const tabs = [
  { id: 'profile', label: 'プロフィール', icon: User },
  { id: 'notify', label: '通知', icon: Bell },
  { id: 'display', label: '表示', icon: Palette },
  { id: 'org', label: '組織・部署', icon: Building2 },
  { id: 'security', label: 'セキュリティ', icon: ShieldCheck },
  { id: 'data', label: 'システム情報', icon: Database },
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
  const { user } = useAuth()
  const [tab, setTab] = useState<string>(tabs[0].id)
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
            <Panel title="アカウント情報">
              <p className="mb-3 text-[13px] text-ink-soft">ログイン中のアカウント情報です。氏名・役割・所属の変更は管理者にご依頼ください。</p>
              <dl className="max-w-lg divide-y divide-line text-[13px]">
                <div className="flex justify-between py-2.5"><dt className="text-ink-soft">氏名</dt><dd className="font-medium text-ink">{user?.name ?? '—'}</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-ink-soft">メールアドレス</dt><dd className="text-ink">{user?.email ?? '—'}</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-ink-soft">役割</dt><dd className="text-ink">{user ? (ROLE_LABELS[user.role] ?? user.role) : '—'}</dd></div>
              </dl>
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
              <div className="max-w-2xl rounded border border-dashed border-line bg-canvas px-4 py-8 text-center text-[13px] text-ink-soft">
                組織・部署マスタは未整備です。部署・責任者・所属人数の管理機能が連携されると、ここに一覧が表示されます。
              </div>
            </Panel>
          )}
          {tab === 'security' && (
            <Panel title="セキュリティ">
              <div className="max-w-2xl space-y-3 text-[13px]">
                <div className="rounded border border-line bg-canvas px-3 py-2"><p className="font-medium text-ink">認証方式</p><p className="text-ink-soft">JWT（Bearer トークン）による認証。5ロールの権限とプロジェクトスコープをAPI側で認可します。</p></div>
                <div className="rounded border border-line px-3 py-2"><p className="font-medium text-ink">操作監査</p><p className="text-ink-soft">写真・品質・日報・工程反映・図面・要員配置・AIフィードバック等の重要操作を audit_logs に記録します。</p></div>
                <div className="flex items-center justify-between rounded border border-line px-3 py-2"><span>操作ログの保持期間</span><span className="text-ink-soft">90日</span></div>
              </div>
            </Panel>
          )}
          {tab === 'data' && <SystemInfo isAdmin={user?.role === 'ADMIN'} />}
        </div>
      </div>
    </div>
  )
}
