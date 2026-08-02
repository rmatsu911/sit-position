export function Progress({
  value,
  plan,
  showLabel = true,
  height = 8,
}: {
  value: number
  plan?: number
  showLabel?: boolean
  height?: number
}) {
  const behind = plan !== undefined && value < plan
  return (
    <div className="flex items-center gap-2">
      <div
        className="relative w-full overflow-hidden rounded-full bg-slate-100"
        style={{ height }}
      >
        <div
          className={`h-full rounded-full ${behind ? 'bg-warn' : 'bg-sysken-500'}`}
          style={{ width: `${Math.min(100, value)}%` }}
        />
        {plan !== undefined && (
          <div
            className="absolute top-0 h-full w-0.5 bg-ink/40"
            style={{ left: `${Math.min(100, plan)}%` }}
            title={`予定 ${plan}%`}
          />
        )}
      </div>
      {showLabel && (
        <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-ink-soft">
          {value}%
        </span>
      )}
    </div>
  )
}
