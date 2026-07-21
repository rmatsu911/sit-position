import { X } from 'lucide-react'
import type { ReactNode } from 'react'

const sizeClass: Record<string, string> = {
  sm: 'w-[420px]',
  md: 'w-[620px]',
  lg: 'w-[860px]',
  xl: 'w-[1100px]',
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: keyof typeof sizeClass
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        className={`relative z-10 max-h-[88vh] ${sizeClass[size]} overflow-hidden rounded bg-white shadow-pop`}
      >
        <header className="flex items-center justify-between border-b border-line bg-canvas px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-ink-soft hover:bg-line/60"
            aria-label="閉じる"
          >
            <X size={18} />
          </button>
        </header>
        <div className="thin-scroll max-h-[calc(88vh-108px)] overflow-y-auto p-5">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-canvas px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
