/**
 * ガントの共通部品（ヘッダー・バー・凡例）。
 *
 * 案件工程（Schedule.tsx）と横断工程（CrossSchedule.tsx）が同じ実装を使う。
 * 座標は必ず `timeline`（src/lib/timeline.ts）から取るため、ヘッダー・バー・
 * 今日線・依存線・ドラッグがすべて同じ基準になる。
 */
import {
  formatJst, formatPeriod, groupSlots, nowJst, shiftDays, splitEndAt, splitStartAt, toJstIsoString,
  type Timeline,
} from '../../lib/timeline'
import type { WbsTask } from '../../types'
import { weekdayLabel } from './ganttUtils'

/** 1行の高さ(px)。左の一覧と右のガントで必ず同じ値を使い、縦位置を揃える。 */
export const ROW_H = 32

export const statusColor: Record<string, string> = {
  完了: '#2e8b57',
  施工中: '#005bac',
  遅延: '#d64545',
  一時停止: '#e6a700',
  未着手: '#94a3b8',
}

/**
 * 一覧の日付セル表示。0.5日単位の工程だけ「午前／午後」を併記する。
 * 終了は exclusive のため、表示用に日付＋区分へ戻してから整形する。
 */
export function edgeLabel(iso: string, edge: 'start' | 'end', precision: WbsTask['precision']): string {
  const { dateKey, half } = edge === 'start' ? splitStartAt(iso) : splitEndAt(iso)
  const date = formatJst(dateKey, 'MM-dd')
  return precision === 'half_day' ? `${date} ${half === 'AM' ? '午前' : '午後'}` : date
}

/** 上段の見出しをどの単位でまとめるか（列と同じ slots が根拠なのでずれない）。 */
function groupUnitOf(timeline: Timeline): 'day' | 'month' | 'year' | null {
  switch (timeline.scale) {
    case 'hour3': return 'day'
    case 'day':
    case 'week': return 'month'
    case 'month': return 'year'
    case 'year': return null
  }
}

/** 下段の列ラベル。 */
function slotLabel(timeline: Timeline, start: Date): { main: string; sub?: string } {
  const dw = timeline.slotWidth
  switch (timeline.scale) {
    case 'hour3':
      return { main: `${start.getHours()}` }
    case 'week':
      return { main: formatJst(start, 'd') }
    case 'month':
      return { main: formatJst(start, 'M月') }
    case 'year':
      return { main: formatJst(start, 'yyyy年') }
    case 'day': {
      // 列幅が狭いときは 1日・月曜だけ日付を出し、さらに広いときだけ曜日も出す
      const showNum = dw >= 12 || start.getDate() === 1 || start.getDay() === 1
      return { main: showNum ? String(start.getDate()) : '', sub: dw >= 24 ? weekdayLabel(start) : undefined }
    }
  }
}

/** ガントのヘッダー。バーと同じ timeline.slots から作るため両者がずれない。 */
export function GanttHeader({ timeline }: { timeline: Timeline }) {
  const dw = timeline.slotWidth
  const unit = groupUnitOf(timeline)
  const groups = unit ? groupSlots(timeline, unit) : []
  return (
    <div className="sticky top-0 z-20 bg-canvas">
      {!!groups.length && (
        <div className="flex h-6 border-b border-line">
          {groups.map((g, i) => (
            <div key={i} className="flex items-center overflow-hidden border-r border-line px-2 text-[12px] font-semibold text-ink" style={{ width: g.span * dw }}>
              {g.label}
            </div>
          ))}
        </div>
      )}
      <div className="flex h-10 border-b border-line">
        {timeline.slots.map((s) => {
          const label = slotLabel(timeline, s.start)
          return (
            <div
              key={s.index}
              className={`flex flex-col items-center justify-center gap-0.5 overflow-hidden border-r border-line/70 ${s.isHoliday ? 'bg-red-50 text-ng' : s.isWeekend ? 'bg-slate-50 text-slate-400' : 'text-ink-soft'}`}
              style={{ width: dw }}
            >
              {!!label.main && <span className="text-[11px] font-medium leading-none tabular-nums">{label.main}</span>}
              {label.sub && <span className="text-[11px] leading-none">{label.sub}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 列の縦グリッド（週末・祝日の着色を含む）。 */
export function GanttGrid({ timeline, height }: { timeline: Timeline; height: number }) {
  const dw = timeline.slotWidth
  return (
    <>
      {timeline.slots.map((s) => (
        <div
          key={s.index}
          className={`absolute top-0 border-r border-line/70 ${s.isHoliday ? 'bg-red-50/50' : s.isWeekend ? 'bg-slate-50/70' : ''}`}
          style={{ left: s.index * dw, width: dw, height }}
        >
          {timeline.scale === 'day' && dw >= 24 && (
            <div className="absolute top-0 h-full border-r border-dashed border-line/40" style={{ left: dw / 2 }} />
          )}
        </div>
      ))}
    </>
  )
}

/** 現在日時の縦線（表示範囲内のときのみ）。 */
export function TodayLine({ timeline, height }: { timeline: Timeline; height: number }) {
  if (timeline.todayX === null) return null
  return (
    <div className="today-line pointer-events-none absolute top-0 z-10 border-l-2 border-ng" style={{ left: timeline.todayX, height }}>
      <span className="absolute -top-0 -translate-x-1/2 rounded-b bg-ng px-1 text-[9px] text-white">本日</span>
    </div>
  )
}

/** 工程1件分のバー（予定・実績・基準工程・マイルストン・進捗塗り）。 */
export function GanttRow({
  task: t, row, timeline, preview, onStartDrag, onContext, onSelect, onOpenProgress,
}: {
  task: WbsTask
  row: number
  timeline: Timeline
  preview: { ds: number; de: number } | null
  onStartDrag: (e: React.PointerEvent, t: WbsTask, mode: 'move' | 'resize') => void
  onContext: (e: React.MouseEvent) => void
  onSelect: () => void
  onOpenProgress: () => void
}) {
  const dw = timeline.slotWidth
  const ds = preview?.ds ?? 0
  const de = preview?.de ?? 0
  // ドラッグ中はプレビュー分だけ日付をずらしてから座標化する（区分=午前/午後は保たれる）
  const planBar = timeline.spanOf(shiftDays(t.planStartAt, ds), shiftDays(t.planEndAt, de))
  const baseBar = timeline.spanOf(t.planStartAt, t.planEndAt)
  const planLeft = planBar.left
  const planW = planBar.width
  const top = row * ROW_H

  if (t.isMilestone) {
    return (
      <div className="absolute" style={{ top: top + 5, left: planLeft + dw / 2 - 7 }} onContextMenu={onContext} onClick={onSelect}>
        <div className="h-3.5 w-3.5 rotate-45 bg-ng" title={`${t.name}（マイルストン）`} />
      </div>
    )
  }

  const color = statusColor[t.status] ?? '#005bac'

  // 実績バー（終了実績が無い＝進行中は本日まで伸ばす）
  let actualEl = null
  if (t.actualStartAt) {
    const aEndAt = t.actualEndAt ?? toJstIsoString(nowJst())
    const actualBar = timeline.spanOf(t.actualStartAt, aEndAt)
    actualEl = (
      <div className="absolute rounded-sm" style={{ top: top + 18, left: actualBar.left, width: actualBar.width, height: 7, background: '#2e8b57', opacity: 0.9 }}
        title={`実績 ${formatPeriod(t.actualStartAt, aEndAt, t.precision)}`} />
    )
  }

  if (t.isParent) {
    return (
      <>
        <div className="absolute" style={{ top: top + 8, left: planLeft, width: planW, height: 8 }} onContextMenu={onContext} onClick={onSelect}>
          <div className="h-2 w-full bg-sysken-700" style={{ clipPath: 'polygon(0 0,100% 0,100% 60%,calc(100% - 5px) 100%,5px 100%,0 60%)' }} />
        </div>
        {actualEl}
      </>
    )
  }

  return (
    <>
      {/* 基準工程（薄い線・ドラッグ前の予定位置） */}
      <div className="absolute rounded-sm bg-slate-300" style={{ top: top + 3, left: baseBar.left, width: baseBar.width, height: 3, opacity: 0.7 }} />
      {/* 予定バー */}
      <div
        className={`group absolute flex items-center rounded-sm ${t.status === '遅延' ? 'ring-1 ring-ng' : ''}`}
        style={{ top: top + 6, left: planLeft, width: planW, height: 11, background: color, opacity: 0.9, cursor: 'grab' }}
        onPointerDown={(e) => onStartDrag(e, t, 'move')}
        onContextMenu={onContext}
        onClick={onSelect}
        onDoubleClick={onOpenProgress}
        title={`${t.name} ｜ 予定 ${formatPeriod(t.planStartAt, t.planEndAt, t.precision)}（${t.planDays}日） ｜ 進捗${t.progress}% ｜ ${t.actualPeople || t.planPeople}名`}
      >
        {/* 進捗塗り */}
        <div className="absolute left-0 top-0 h-full rounded-l-sm bg-black/25" style={{ width: `${t.progress}%` }} />
        {/* 人数表示 */}
        {planW > 40 && <span className="relative z-10 px-1 text-[9px] text-white">{t.actualPeople || t.planPeople}名</span>}
        {/* リサイズハンドル */}
        <div className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100" style={{ background: 'rgba(255,255,255,0.6)' }} onPointerDown={(e) => onStartDrag(e, t, 'resize')} />
      </div>
      {actualEl}
    </>
  )
}

/** 依存線（先行工程のバー右端 → 後続工程の開始位置）。 */
export function DependencyLines({
  lines, width, height,
}: {
  lines: { x1: number; y1: number; x2: number; y2: number; critical: boolean }[]
  width: number
  height: number
}) {
  return (
    <svg className="pointer-events-none absolute left-0 top-0" width={width} height={height}>
      {lines.map((l, i) => {
        const midX = l.x2 - 8
        return (
          <g key={i}>
            <path
              d={`M${l.x1},${l.y1} L${midX},${l.y1} L${midX},${l.y2} L${l.x2},${l.y2}`}
              fill="none"
              stroke={l.critical ? '#d64545' : '#94a3b8'}
              strokeWidth={1.2}
            />
            <path d={`M${l.x2},${l.y2} l-5,-3 l0,6 z`} fill={l.critical ? '#d64545' : '#94a3b8'} />
          </g>
        )
      })}
    </svg>
  )
}

export function GanttLegend({ note }: { note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line bg-canvas px-3 py-1.5 text-[11px] text-ink-soft">
      <LegendChip color="#005bac" label="予定バー" />
      <LegendChip color="#2e8b57" label="実績バー" />
      <span className="flex items-center gap-1"><span className="inline-block h-1 w-5 bg-slate-400" />基準工程</span>
      <span className="flex items-center gap-1"><span className="text-ng">◆</span> マイルストン</span>
      <span className="flex items-center gap-1"><span className="inline-block h-3 w-0.5 bg-ng" /> 本日</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 border border-ng bg-red-50" /> 遅延</span>
      <span className="flex items-center gap-1"><span className="inline-block h-2 w-4 bg-slate-50 ring-1 ring-line" /> 土日・祝</span>
      {note && <span className="ml-auto">{note}</span>}
    </div>
  )
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1"><span className="inline-block h-2 w-5 rounded-sm" style={{ background: color }} />{label}</span>
}
