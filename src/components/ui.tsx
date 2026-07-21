import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { Priority, ProjectStatus } from '../types'

export function Card({
  children,
  className = '',
  title,
  action,
}: {
  children: ReactNode
  className?: string
  title?: string
  action?: ReactNode
}) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {title && (
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = 'brand',
}: {
  label: string
  value: string
  sub?: string
  icon: LucideIcon
  tone?: 'brand' | 'green' | 'amber' | 'rose'
}) {
  const tones: Record<string, string> = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
  }
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${tones[tone]}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  )
}

const statusStyles: Record<ProjectStatus, string> = {
  進行中: 'bg-brand-50 text-brand-700 border-brand-200',
  完了: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  保留: 'bg-amber-50 text-amber-700 border-amber-200',
  未着手: 'bg-slate-100 text-slate-600 border-slate-200',
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusStyles[status]}`}
    >
      {status}
    </span>
  )
}

const priorityStyles: Record<Priority, string> = {
  高: 'bg-rose-50 text-rose-700 border-rose-200',
  中: 'bg-amber-50 text-amber-700 border-amber-200',
  低: 'bg-slate-100 text-slate-600 border-slate-200',
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${priorityStyles[priority]}`}
    >
      {priority}
    </span>
  )
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-brand-500"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-medium text-slate-600">
        {value}%
      </span>
    </div>
  )
}
