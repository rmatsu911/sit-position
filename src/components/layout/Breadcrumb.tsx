import { Link } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'
import type { ReactNode } from 'react'

export interface Crumb {
  label: string
  to?: string
}

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-ink-soft">
      <Link to="/dashboard" className="flex items-center gap-1 hover:text-sysken-600">
        <Home size={13} />
      </Link>
      {items.map((c, i) => {
        const last = i === items.length - 1
        return (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={13} className="text-slate-300" />
            {c.to && !last ? (
              <Link to={c.to} className="hover:text-sysken-600 hover:underline">
                {c.label}
              </Link>
            ) : (
              <span className={last ? 'font-medium text-ink' : ''}>{c.label}</span>
            )}
          </span>
        )
      })}
    </nav>
  )
}

export function PageHeader({
  breadcrumb,
  title,
  actions,
  description,
}: {
  breadcrumb: Crumb[]
  title: string
  actions?: ReactNode
  description?: ReactNode
}) {
  return (
    <div className="mb-4">
      <Breadcrumb items={breadcrumb} />
      <div className="mt-1.5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-ink">{title}</h1>
          {description && <p className="mt-0.5 text-xs text-ink-soft">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  )
}
