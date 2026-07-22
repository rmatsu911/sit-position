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
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
          {action}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
