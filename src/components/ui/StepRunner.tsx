import { useEffect, useState } from 'react'
import { CheckCircle2, Info } from 'lucide-react'
import { Spinner } from './common'

// 逐次処理を演出するモーダル（報告書出力・AIダミー等で使用）
export function StepRunner({
  open,
  title,
  steps,
  finalNote,
  onClose,
  stepMs = 750,
}: {
  open: boolean
  title: string
  steps: string[]
  finalNote?: string
  onClose: () => void
  stepMs?: number
}) {
  const [done, setDone] = useState(0)

  useEffect(() => {
    if (!open) {
      setDone(0)
      return
    }
    setDone(0)
    let i = 0
    const timer = window.setInterval(() => {
      i += 1
      setDone(i)
      if (i >= steps.length) window.clearInterval(timer)
    }, stepMs)
    return () => window.clearInterval(timer)
  }, [open, steps.length, stepMs])

  if (!open) return null
  const finished = done >= steps.length

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-ink/40" />
      <div className="relative z-10 w-[480px] rounded bg-white shadow-pop">
        <header className="border-b border-line bg-canvas px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
        </header>
        <div className="space-y-2.5 p-5">
          {steps.map((s, i) => {
            const state = i < done ? 'done' : i === done ? 'run' : 'wait'
            return (
              <div key={i} className="flex items-center gap-2.5 text-[13px]">
                {state === 'done' ? (
                  <CheckCircle2 size={17} className="text-ok" />
                ) : state === 'run' ? (
                  <Spinner size={17} />
                ) : (
                  <span className="h-[17px] w-[17px] rounded-full border border-line" />
                )}
                <span className={state === 'wait' ? 'text-ink-soft' : 'text-ink'}>{s}</span>
              </div>
            )
          })}
          {finished && finalNote && (
            <div className="mt-3 flex items-start gap-2 rounded border border-line bg-canvas px-3 py-2 text-xs text-ink-soft">
              <Info size={14} className="mt-0.5 shrink-0 text-sysken-500" />
              <span>{finalNote}</span>
            </div>
          )}
        </div>
        <footer className="flex justify-end border-t border-line bg-canvas px-5 py-3">
          <button className="btn-primary disabled:opacity-50" disabled={!finished} onClick={onClose}>
            {finished ? '閉じる' : '処理中...'}
          </button>
        </footer>
      </div>
    </div>
  )
}
