import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center py-24 text-center">
      <p className="text-6xl font-bold text-brand-500">404</p>
      <p className="mt-3 text-lg font-semibold text-slate-700">ページが見つかりません</p>
      <p className="mt-1 text-sm text-slate-400">
        お探しのページは移動または削除された可能性があります。
      </p>
      <Link
        to="/"
        className="mt-6 flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600"
      >
        <Home size={16} />
        ダッシュボードへ戻る
      </Link>
    </div>
  )
}
