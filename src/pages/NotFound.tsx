import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-5xl font-bold text-sysken-500">404</p>
      <p className="mt-3 text-base font-semibold text-ink">ページが見つかりません</p>
      <p className="mt-1 text-[13px] text-ink-soft">
        お探しの画面は移動または削除された可能性があります。
      </p>
      <Link to="/dashboard" className="btn-primary mt-5">
        <Home size={16} />
        ダッシュボードへ戻る
      </Link>
    </div>
  )
}
