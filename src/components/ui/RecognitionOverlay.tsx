import { boxColor, type RecogBox } from '../../data/aiPreview'

// AIの物体検出結果を写真上に重ねて表示する（検出枠＋ラベル＋検出率）。
export function RecognitionOverlay({ boxes, showPct = true }: { boxes: RecogBox[]; showPct?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="h-full w-full" viewBox="0 0 100 75" preserveAspectRatio="none">
        {boxes.map((b) => {
          const c = boxColor[b.kind]
          const label = showPct ? `${b.label} ${b.pct}%` : b.label
          return (
            <g key={b.no}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={c} fillOpacity={0.08} stroke={c} strokeWidth={0.9} rx={1} />
              <circle cx={b.x} cy={b.y} r={3.4} fill={c} />
              <text x={b.x} y={b.y + 1.2} fontSize={3.6} fill="#fff" textAnchor="middle" fontWeight="bold">{b.no}</text>
              <rect x={b.x + 4.5} y={b.y - 2.6} width={label.length * 2.7 + 3} height={5} rx={1} fill={c} />
              <text x={b.x + 6} y={b.y + 1.1} fontSize={3.2} fill="#fff">{label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// 凡例
export function RecognitionLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-soft">
      <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm border" style={{ borderColor: boxColor.cable, background: `${boxColor.cable}14` }} />光ケーブル系</span>
      <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm border" style={{ borderColor: boxColor.closure, background: `${boxColor.closure}14` }} />クロージャ系</span>
      <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm border" style={{ borderColor: boxColor.check, background: `${boxColor.check}14` }} />確認対象</span>
    </div>
  )
}
