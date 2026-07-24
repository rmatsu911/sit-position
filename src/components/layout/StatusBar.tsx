import { Database, List } from 'lucide-react'
import { APP_VERSION } from '../../lib/env'

// 実運用フッター。デモ表示・環境ラベルは行わない。
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
      <span className="ml-auto">v{APP_VERSION}</span>
    </footer>
  )
}
