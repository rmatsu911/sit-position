import { Loader2, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-sysken-500" />
}

export function LoadingBlock({ label = '読み込み中...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-ink-soft">
      <Spinner size={26} />
      <p className="text-[13px]">{label}</p>
    </div>
  )
}

export function EmptyState({ label = 'データがありません' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-ink-soft">
      <Inbox size={30} className="text-slate-300" />
      <p className="text-[13px]">{label}</p>
    </div>
  )
}

export function Panel({
  title,
  action,
  children,
  className = '',
  bodyClassName = 'p-4',
}: {
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="text-[13px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}

/** AIダミー用の「準備中」バッジ */
export function PreparingTag({ label = '準備中' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-sysken-300 bg-sysken-50 px-1.5 py-0.5 text-[11px] font-medium text-sysken-700">
      <span className="h-1.5 w-1.5 rounded-full bg-sysken-400" />
      {label}
    </span>
  )
}
