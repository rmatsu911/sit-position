import { useLocation } from 'react-router-dom'
import { Bell, Search, ChevronDown } from 'lucide-react'
import { formatDate } from '../lib/format'

const titles: Record<string, string> = {
  '/': 'ダッシュボード',
  '/projects': '案件管理',
  '/members': 'メンバー',
  '/schedule': 'スケジュール',
  '/reports': 'レポート',
  '/settings': '設定',
}

const today = '2026-07-21'

export default function Topbar() {
  const { pathname } = useLocation()
  const title = titles[pathname] ?? '業務管理システム'

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-8">
      <div>
        <h1 className="text-lg font-bold text-slate-800">{title}</h1>
        <p className="text-xs text-slate-400">{formatDate(today, 'yyyy年M月d日(E)')}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative">
          <Search
            size={18}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="案件・メンバーを検索"
            className="w-72 rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm outline-none placeholder:text-slate-400 focus:border-brand-400 focus:bg-white"
          />
        </div>

        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
        >
          <Bell size={20} />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500" />
        </button>

        <div className="flex items-center gap-3 rounded-lg border border-slate-200 py-1.5 pl-2 pr-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
            佐
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-slate-700">佐藤 健一</p>
            <p className="text-xs text-slate-400">営業部 / 部長</p>
          </div>
          <ChevronDown size={16} className="text-slate-400" />
        </div>
      </div>
    </header>
  )
}
