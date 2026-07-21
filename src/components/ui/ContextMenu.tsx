import { useEffect } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  onClick: () => void
  danger?: boolean
  divider?: boolean
}

export function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}) {
  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('click', handler)
    window.addEventListener('contextmenu', handler)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('contextmenu', handler)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - items.length * 32 - 16)

  return (
    <div
      className="fixed z-[65] min-w-[210px] rounded border border-line bg-white py-1 shadow-pop"
      style={{ left, top }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="my-1 border-t border-line" />
        ) : (
          <button
            key={i}
            onClick={() => {
              it.onClick()
              onClose()
            }}
            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-canvas ${
              it.danger ? 'text-ng' : 'text-ink'
            }`}
          >
            {it.icon && <it.icon size={15} />}
            {it.label}
          </button>
        ),
      )}
    </div>
  )
}
