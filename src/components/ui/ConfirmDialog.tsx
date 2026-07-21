import { AlertTriangle } from 'lucide-react'
import { useApp } from '../../context/AppContext'

export function ConfirmDialog() {
  const { confirmState, resolveConfirm } = useApp()
  if (!confirmState) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-ink/40" onClick={() => resolveConfirm(false)} />
      <div className="relative z-10 w-[420px] rounded bg-white shadow-pop">
        <div className="flex items-start gap-3 p-5">
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              confirmState.danger ? 'bg-red-50 text-ng' : 'bg-sysken-50 text-sysken-500'
            }`}
          >
            <AlertTriangle size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-ink">{confirmState.title}</h2>
            <p className="mt-1 text-[13px] text-ink-soft">{confirmState.message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-line bg-canvas px-5 py-3">
          <button className="btn-default" onClick={() => resolveConfirm(false)}>
            {confirmState.cancelLabel}
          </button>
          <button
            className={confirmState.danger ? 'btn-danger' : 'btn-primary'}
            onClick={() => resolveConfirm(true)}
          >
            {confirmState.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
