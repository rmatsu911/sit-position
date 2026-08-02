import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import type { Tone } from '../../types'

const icon: Record<Tone, typeof Info> = {
  ok: CheckCircle2,
  warn: AlertTriangle,
  ng: XCircle,
  info: Info,
  muted: Info,
}

const bar: Record<Tone, string> = {
  ok: 'border-l-ok',
  warn: 'border-l-warn',
  ng: 'border-l-ng',
  info: 'border-l-sysken-500',
  muted: 'border-l-slate-400',
}

const iconColor: Record<Tone, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  ng: 'text-ng',
  info: 'text-sysken-500',
  muted: 'text-slate-500',
}

export function ToastHost() {
  const { toasts, dismissToast } = useApp()
  return (
    <div className="pointer-events-none fixed bottom-8 right-6 z-[60] flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = icon[t.tone]
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-80 items-start gap-2.5 rounded border border-line border-l-4 ${bar[t.tone]} bg-white px-4 py-3 shadow-pop`}
          >
            <Icon size={18} className={`mt-0.5 shrink-0 ${iconColor[t.tone]}`} />
            <p className="flex-1 text-[13px] text-ink">{t.message}</p>
            <button
              onClick={() => dismissToast(t.id)}
              className="rounded p-0.5 text-ink-soft hover:bg-line/60"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
