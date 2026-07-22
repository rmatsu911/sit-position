import { boxColor, type RecogBox } from '../../data/aiPreview'

// 画像認識イメージ（参考表示）の枠を写真上に重ねる。実際の推論は行わない。
export function RecognitionOverlay({ boxes, note = true }: { boxes: RecogBox[]; note?: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0">
      <svg className="h-full w-full" viewBox="0 0 100 75" preserveAspectRatio="none">
        {boxes.map((b) => {
          const c = boxColor[b.kind]
          return (
            <g key={b.no}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={c} fillOpacity={0.08} stroke={c} strokeWidth={0.9} rx={1} />
              <circle cx={b.x} cy={b.y} r={3.4} fill={c} />
              <text x={b.x} y={b.y + 1.2} fontSize={3.6} fill="#fff" textAnchor="middle" fontWeight="bold">{b.no}</text>
              <rect x={b.x + 4.5} y={b.y - 2.6} width={b.label.length * 3.0 + 3} height={5} rx={1} fill={c} />
              <text x={b.x + 6} y={b.y + 1.1} fontSize={3.2} fill="#fff">{b.label}</text>
            </g>
          )
        })}
      </svg>
      {note && (
        <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1.5 py-0.5 text-[10px] text-white">
          表示は検証用データに基づく参考表示です。
        </span>
      )}
    </div>
  )
}

// 凡例
export function RecognitionLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12px] text-ink-soft">
      <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm border" style={{ borderColor: boxColor.cable, background: `${boxColor.cable}14` }} />光ケーブル系（分類候補）</span>
      <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm border" style={{ borderColor: boxColor.closure, background: `${boxColor.closure}14` }} />クロージャ系（分類候補）</span>
      <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm border" style={{ borderColor: boxColor.check, background: `${boxColor.check}14` }} />確認候補</span>
    </div>
  )
}
