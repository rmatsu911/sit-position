import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { User, Bell, Palette, Building2, ShieldCheck, Database, MonitorPlay, Play, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '../components/layout/Breadcrumb'
import { Panel } from '../components/ui/common'
import { useApp, useDemoReset } from '../context/AppContext'
import { useAuth } from '../auth/AuthContext'
import { APP_ENV, APP_VERSION, ENV_LABEL, IS_DEV_VISIBLE } from '../lib/env'

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '管理者', PROJECT_MANAGER: '案件管理者', FIELD_WORKER: '現場担当者', QUALITY_MANAGER: '品質管理者', VIEWER: '閲覧者',
}

const allTabs = [
  { id: 'demo', label: '発表用デモ', icon: MonitorPlay, devOnly: true },
  { id: 'profile', label: 'プロフィール', icon: User, devOnly: false },
  { id: 'notify', label: '通知', icon: Bell, devOnly: false },
  { id: 'display', label: '表示', icon: Palette, devOnly: false },
  { id: 'org', label: '組織・部署', icon: Building2, devOnly: false },
  { id: 'security', label: 'セキュリティ', icon: ShieldCheck, devOnly: false },
  { id: 'data', label: 'システム情報', icon: Database, devOnly: false },
] as const
const tabs = allTabs.filter((t) => IS_DEV_VISIBLE || !t.devOnly)

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
  const { toast, demoMode, setDemoMode } = useApp()
  const { user } = useAuth()
  const navigate = useNavigate()
  const resetDemo = useDemoReset()
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
          {tab === 'demo' && (
            <div className="space-y-4">
              <Panel title="発表用デモモード">
                <div className="flex items-center justify-between rounded border border-line bg-canvas px-4 py-3">
                  <div>
                    <p className="text-[14px] font-semibold text-ink">発表用デモモード</p>
                    <p className="mt-0.5 text-[12.5px] text-ink-soft">展示会・発表向けに、重要箇所を分かりやすく表示します。サンプル案件は「熊本中央局 光設備更改工事」に統一されます。</p>
                  </div>
                  <button
                    onClick={() => { setDemoMode(!demoMode); toast(demoMode ? 'デモモードを終了しました' : '発表用デモモードを有効にしました', 'ok') }}
                    className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${demoMode ? 'bg-sysken-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${demoMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <ul className="mt-3 space-y-1.5 text-[13px] text-ink">
                  {[
                    'サンプル案件を「熊本中央局 光設備更改工事」に統一',
                    'デモで使用する通知を上部に表示',
                    '予期しない空データ画面を表示しない',
                    '削除などの危険操作は実データを消さず、演出のみ実行',
                    '操作後の状態をいつでもリセット可能',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2">
                      <CheckCircle2 size={16} className={`mt-0.5 shrink-0 ${demoMode ? 'text-ok' : 'text-slate-300'}`} />
                      {t}
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title="デモの初期化">
                <p className="mb-3 text-[13px] text-ink-soft">
                  「デモを最初から開始」を押すと、ダッシュボード表示・AIパネル閉・通知未読・工程進捗初期値・品質確認待ち・日報下書き・写真フィルター解除・全モーダル閉じた状態に戻します。
                </p>
                <button
                  className="btn-primary"
                  onClick={() => { resetDemo(); navigate('/dashboard') }}
                >
                  <Play size={16} />デモを最初から開始
                </button>
              </Panel>
            </div>
          )}
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
          {tab === 'data' && (
            <Panel title="システム情報">
              <dl className="max-w-lg divide-y divide-line text-[13px]">
                <div className="flex justify-between py-2.5"><dt className="text-ink-soft">アプリバージョン</dt><dd className="font-medium text-ink">v{APP_VERSION}</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-ink-soft">実行環境</dt><dd className="text-ink">{ENV_LABEL[APP_ENV]}</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-ink-soft">構成</dt><dd className="text-ink">React / FastAPI / PostgreSQL / File Storage / AI Worker</dd></div>
                <div className="flex justify-between py-2.5"><dt className="text-ink-soft">AI（物体検出）</dt><dd className="text-ink">YOLO 接続基盤（学習済みモデル配置後に有効化）</dd></div>
              </dl>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
