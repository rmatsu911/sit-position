import { useState } from 'react'
import { Card } from '../components/ui'

function Toggle({ defaultOn = false, label, desc }: { defaultOn?: boolean; label: string; desc: string }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <p className="text-xs text-slate-400">{desc}</p>
      </div>
      <button
        type="button"
        onClick={() => setOn((v) => !v)}
        className={`relative h-6 w-11 rounded-full transition-colors ${on ? 'bg-brand-500' : 'bg-slate-300'}`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            on ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

export default function Settings() {
  return (
    <div className="grid grid-cols-2 gap-5">
      <Card title="プロフィール設定">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">氏名</label>
            <input
              defaultValue="佐藤 健一"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">メールアドレス</label>
            <input
              defaultValue="sato@example.co.jp"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500">部署</label>
            <select className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400">
              <option>営業部</option>
              <option>開発部</option>
              <option>デザイン部</option>
              <option>マーケティング部</option>
            </select>
          </div>
          <button
            type="button"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
          >
            変更を保存
          </button>
        </div>
      </Card>

      <Card title="通知設定">
        <div className="divide-y divide-slate-100">
          <Toggle defaultOn label="タスク期限の通知" desc="期限が近づいたタスクをお知らせします" />
          <Toggle defaultOn label="案件ステータス変更" desc="担当案件の状態が変わると通知します" />
          <Toggle label="週次レポートメール" desc="毎週月曜に集計レポートを送信します" />
          <Toggle defaultOn label="メンション通知" desc="コメントでメンションされたとき通知します" />
        </div>
      </Card>

      <Card title="表示設定" className="col-span-2">
        <div className="divide-y divide-slate-100">
          <Toggle defaultOn label="コンパクト表示" desc="一覧の行間を詰めて表示します" />
          <Toggle label="サイドバーを自動折りたたみ" desc="画面幅に応じてサイドバーを折りたたみます" />
        </div>
      </Card>
    </div>
  )
}
