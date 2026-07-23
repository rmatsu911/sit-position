import { Database, List } from 'lucide-react'
import { APP_ENV, APP_VERSION, ENV_LABEL, IS_DEV_VISIBLE } from '../../lib/env'

// 実運用フッター。デモ表示は行わない。開発/検証環境でのみ環境ラベルを表示する。
export function StatusBar({ count }: { count?: number }) {
  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-canvas px-4 text-[12px] text-ink-soft">
      <span className="flex items-center gap-1">
        <Database size={12} />
        PostgreSQL
      </span>
      {count !== undefined && (
        <span className="flex items-center gap-1">
          <List size={12} />
          表示件数：{count}件
        </span>
      )}
      {IS_DEV_VISIBLE && (
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-warn">{ENV_LABEL[APP_ENV]}</span>
      )}
      <span className="ml-auto">v{APP_VERSION}</span>
    </footer>
  )
}
