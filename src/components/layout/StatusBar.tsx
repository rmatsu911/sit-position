import { Circle, Database, Save, List } from 'lucide-react'

export function StatusBar({ count }: { count?: number }) {
  return (
    <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-canvas px-4 text-[12px] text-ink-soft">
      <span className="flex items-center gap-1">
        <Circle size={9} className="fill-warn text-warn" />
        接続状態：デモ環境
      </span>
      <span className="flex items-center gap-1">
        <Database size={12} />
        データ：サンプル
      </span>
      <span className="flex items-center gap-1">
        <Save size={12} />
        最終保存：2026/07/21 15:30
      </span>
      {count !== undefined && (
        <span className="flex items-center gap-1">
          <List size={12} />
          表示件数：{count}件
        </span>
      )}
      <span className="ml-auto">バージョン：Demo 1.0</span>
    </footer>
  )
}
