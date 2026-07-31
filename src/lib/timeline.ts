/**
 * 工程表（ガント）の時間軸エンジン。
 *
 * 目的: 日付→座標の変換をこのファイル1箇所へ集約する。
 * ヘッダーの列とバーの位置が必ず同じ基準（同じ slots 配列）を参照するため、
 * 「ヘッダーとバーがずれる」種類の不具合を構造的に防ぐ。
 *
 * 方針:
 *  - タイムゾーンは Asia/Tokyo に統一する。日本標準時は年間を通じて UTC+9 で
 *    夏時間が無いため、外部ライブラリ無しで固定オフセット変換できる。
 *  - 列（slot）の境界は date-fns のカレンダー演算で作る。`index * 86400000` のような
 *    固定ミリ秒の積み上げはしない（月・年は長さが一定でないため）。
 *  - 座標は列インデックス＋列内の按分で求めるため、月/年のように長さが可変の
 *    単位でも正しい位置になる。
 */
import {
  addDays, addHours, addMonths, addWeeks, addYears,
  format, startOfDay, startOfMonth, startOfWeek, startOfYear,
} from 'date-fns'
import { ja } from 'date-fns/locale'

/** 表示単位。3時間 / 日 / 週 / 月 / 年。 */
export type TimeScale = 'hour3' | 'day' | 'week' | 'month' | 'year'

/** 日本標準時のUTCオフセット（分）。日本に夏時間は無いため固定値でよい。 */
export const JST_OFFSET_MINUTES = 9 * 60

/** 単位ごとの既定の列幅(px)。呼び出し側で上書きできる。 */
export const DEFAULT_SLOT_WIDTH: Record<TimeScale, number> = {
  hour3: 18,
  day: 34,
  week: 60,
  month: 90,
  year: 120,
}

/**
 * バーの最小幅(px)。完全に消えるのを防ぐためだけの下限で、これで長さを
 * ごまかさない（0.5日は必ず1日の半分の実寸で描く）。
 *
 * 月表示では 1日 ≒ 3px になるため、下限が 3px あると 0.5日バーが 1日バーと
 * 同じ幅に膨らんでしまう。実寸の比率を保てるよう 1px にしている。
 */
export const MIN_BAR_WIDTH = 1

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

export type DateInput = Date | string

/**
 * 任意の日時を「JSTの壁時計」を表す Date へ変換する。
 *
 * 返る Date のローカルゲッター（getFullYear/getHours など）が JST の値になるため、
 * 以降のカレンダー演算・表示はブラウザのタイムゾーンに影響されない。
 *
 * - `yyyy-MM-dd` の日付のみ文字列は「JSTのその日の 00:00」として扱う
 *   （UTC midnight と解釈して前日にずれるのを防ぐ）
 * - タイムゾーン付きの日時文字列・Date は絶対時刻としてJSTへ変換する
 */
export function toJst(value: DateInput): Date {
  if (typeof value === 'string' && DATE_ONLY.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d, 0, 0, 0, 0)
  }
  const d = typeof value === 'string' ? new Date(value) : value
  return new Date(d.getTime() + (JST_OFFSET_MINUTES + d.getTimezoneOffset()) * 60_000)
}

/**
 * JST壁時計の Date を、JSTオフセット付きのISO文字列へ戻す。
 *
 * `toJst()` は「絶対時刻 → JST壁時計」の一方向変換で冪等ではないため、
 * 値を返す関数は Date ではなくこの形式の文字列を返し、再変換の事故を防ぐ。
 */
export function toJstIsoString(jstWall: Date): string {
  return `${format(jstWall, "yyyy-MM-dd'T'HH:mm:ss")}+09:00`
}

/** JST壁時計の Date を `yyyy-MM-dd` などの書式で表示する。 */
export function formatJst(value: DateInput, pattern: string): string {
  return format(toJst(value), pattern, { locale: ja })
}

/** JSTでの `yyyy-MM-dd`。 */
export function jstDateKey(value: DateInput): string {
  return formatJst(value, 'yyyy-MM-dd')
}

/** 現在時刻（JST壁時計）。 */
export function nowJst(): Date {
  return toJst(new Date())
}

// ===== 工程期間の粒度（日単位 / 0.5日単位 / 任意時刻） =====

/**
 * 入力・表示の粒度。日時が正であり、これは「どの粒度で入力・表示するか」の
 * 判定にだけ使う（日時と二重管理しない）。
 */
export type SchedulePrecision = 'day' | 'half_day' | 'time'

/** 午前 = 00:00〜12:00 / 午後 = 12:00〜翌0:00 */
export type HalfDay = 'AM' | 'PM'

/** 期間は [開始, 終了) の半開区間で扱う。終了は exclusive。 */
export interface SchedulePeriod {
  /** 開始日時（inclusive・ISO文字列） */
  startAt: string
  /** 終了日時（exclusive・ISO文字列） */
  endAt: string
}

/**
 * JSTの日付（`yyyy-MM-dd`）＋区分から、開始日時（inclusive）のISO文字列を作る。
 * 午前＝その日の 00:00、午後＝その日の 12:00。
 */
export function startAtOf(dateKey: string, half: HalfDay = 'AM'): string {
  return `${dateKey}T${half === 'PM' ? '12' : '00'}:00:00+09:00`
}

/**
 * JSTの日付（`yyyy-MM-dd`）＋区分から、終了日時（exclusive）のISO文字列を作る。
 * 「午前まで」＝ その日の 12:00、「午後まで」＝ 翌日の 00:00。
 */
export function endAtOf(dateKey: string, half: HalfDay = 'PM'): string {
  if (half === 'AM') return `${dateKey}T12:00:00+09:00`
  return `${format(addDays(toJst(dateKey), 1), 'yyyy-MM-dd')}T00:00:00+09:00`
}

/** 開始日時（inclusive）から、日付と区分へ戻す。 */
export function splitStartAt(value: DateInput): { dateKey: string; half: HalfDay } {
  const d = toJst(value)
  return { dateKey: format(d, 'yyyy-MM-dd'), half: d.getHours() >= 12 ? 'PM' : 'AM' }
}

/**
 * 終了日時（exclusive）から、日付と区分へ戻す。
 * 12:00 → その日の「午前まで」、翌0:00 → 前日の「午後まで」。
 */
export function splitEndAt(value: DateInput): { dateKey: string; half: HalfDay } {
  const d = toJst(value)
  if (d.getHours() === 0 && d.getMinutes() === 0) {
    // 翌日 00:00 = 前日の午後まで
    return { dateKey: format(addDays(d, -1), 'yyyy-MM-dd'), half: 'PM' }
  }
  return { dateKey: format(d, 'yyyy-MM-dd'), half: 'AM' }
}

/**
 * 日時を n 日ずらす（JSTのカレンダー日単位）。
 * 時刻（午前=00:00 / 午後=12:00 の区分）は保たれるため、ガントのドラッグ移動で
 * 半日工程の区分が失われない。
 *
 * n には 0.5 のような端数も渡せる（0.5日刻みのドラッグ用）。整数部はカレンダー
 * 日で進め、端数だけ時間を足す。日本標準時に夏時間は無いため時間加算で正確。
 */
export function shiftDays(value: DateInput, n: number): string {
  const whole = Math.trunc(n)
  const fraction = n - whole
  let d = addDays(toJst(value), whole)
  if (fraction !== 0) d = addHours(d, fraction * 24)
  return toJstIsoString(d)
}

/** 粒度に応じたドラッグの刻み（日）。day = 1日 / half_day = 0.5日。 */
export function snapStepOf(precision: SchedulePrecision): number {
  return precision === 'half_day' ? 0.5 : 1
}

/** ピクセルの移動量を、粒度の刻みに合わせた日数へ丸める。 */
export function snapDelta(dx: number, slotWidth: number, precision: SchedulePrecision): number {
  const step = snapStepOf(precision)
  return Math.round(dx / slotWidth / step) * step
}

/**
 * 期間の長さを「日数」で返す（0.5刻み）。
 * 同日の午前のみ／午後のみ = 0.5、同日の午前〜午後 = 1。
 */
export function durationInDays(startAt: DateInput, endAt: DateInput): number {
  const s = toJst(startAt).getTime()
  const e = toJst(endAt).getTime()
  return Math.max(0, (e - s) / 86_400_000)
}

/** 期間が 0.5日単位（12:00 境界を含む）かどうか。表示の判定に使う。 */
export function isHalfDayPeriod(startAt: DateInput, endAt: DateInput): boolean {
  const s = toJst(startAt)
  const e = toJst(endAt)
  const onBoundary = (d: Date) => d.getMinutes() === 0 && (d.getHours() === 0 || d.getHours() === 12)
  if (!onBoundary(s) || !onBoundary(e)) return false
  return s.getHours() === 12 || e.getHours() === 12
}

/** 期間を「6/1 午後 〜 6/3 午前」のような日本語表記にする。 */
export function formatPeriod(
  startAt: DateInput,
  endAt: DateInput,
  precision: SchedulePrecision,
  pattern = 'MM-dd',
): string {
  const s = splitStartAt(startAt)
  const e = splitEndAt(endAt)
  const sd = format(toJst(s.dateKey), pattern)
  const ed = format(toJst(e.dateKey), pattern)
  if (precision !== 'half_day') return sd === ed ? sd : `${sd}〜${ed}`
  const label = (h: HalfDay) => (h === 'AM' ? '午前' : '午後')
  return sd === ed && s.half === e.half
    ? `${sd} ${label(s.half)}`
    : `${sd} ${label(s.half)}〜${ed} ${label(e.half)}`
}

/** 単位の先頭へ丸める。 */
function alignToScale(d: Date, scale: TimeScale): Date {
  switch (scale) {
    case 'hour3':
      return addHours(startOfDay(d), Math.floor(d.getHours() / 3) * 3)
    case 'day':
      return startOfDay(d)
    case 'week':
      return startOfWeek(d, { weekStartsOn: 1 }) // 月曜始まり
    case 'month':
      return startOfMonth(d)
    case 'year':
      return startOfYear(d)
  }
}

/** 次の単位の先頭へ進める（カレンダー演算。固定ミリ秒を足さない）。 */
function stepScale(d: Date, scale: TimeScale): Date {
  switch (scale) {
    case 'hour3':
      return addHours(d, 3)
    case 'day':
      return addDays(d, 1)
    case 'week':
      return addWeeks(d, 1)
    case 'month':
      return addMonths(d, 1)
    case 'year':
      return addYears(d, 1)
  }
}

export interface TimelineSlot {
  index: number
  /** 列の開始（JST壁時計・この時刻を含む） */
  start: Date
  /** 列の終了（JST壁時計・この時刻を含まない） */
  end: Date
  isWeekend: boolean
  isHoliday: boolean
  /** 現在時刻がこの列に含まれるか */
  isCurrent: boolean
}

export interface TimelineOptions {
  scale: TimeScale
  /** 表示開始（この日時を含む単位から） */
  from: DateInput
  /** 表示終了（この日時を含む単位まで） */
  to: DateInput
  /** 列幅(px)。省略時は単位ごとの既定値 */
  slotWidth?: number
  /** 休日（`yyyy-MM-dd`） */
  holidays?: readonly string[]
  /** 「現在」。テスト用に固定したい場合に指定 */
  now?: DateInput
  /** 生成する列数の上限（描画負荷の安全弁） */
  maxSlots?: number
}

export interface BarSpan {
  left: number
  width: number
  /** 表示範囲と全く重ならない場合 false */
  visible: boolean
}

export interface Timeline {
  scale: TimeScale
  slotWidth: number
  slots: TimelineSlot[]
  /** 表示範囲の開始（最初の列の開始） */
  start: Date
  /** 表示範囲の終了（最後の列の終了・含まない） */
  end: Date
  totalWidth: number
  /** 日時 → x座標(px)。範囲外は端にクランプする。 */
  xOf(value: DateInput): number
  /**
   * 期間 → バーの位置と幅。
   * `inclusiveEndDay` を true にすると終了日を「その日の終わりまで」として扱う
   * （日付のみで期間を持つ既存の工程データ向け）。
   */
  spanOf(start: DateInput, end: DateInput, options?: { inclusiveEndDay?: boolean }): BarSpan
  /** 現在時刻のx座標。表示範囲外なら null。 */
  todayX: number | null
}

/** 時間軸を生成する。 */
export function createTimeline(options: TimelineOptions): Timeline {
  const { scale } = options
  const slotWidth = options.slotWidth ?? DEFAULT_SLOT_WIDTH[scale]
  const maxSlots = options.maxSlots ?? 2000
  const holidays = new Set(options.holidays ?? [])
  const now = options.now ? toJst(options.now) : nowJst()

  const from = alignToScale(toJst(options.from), scale)
  const to = toJst(options.to)

  const slots: TimelineSlot[] = []
  let cursor = from
  while (cursor.getTime() <= to.getTime() && slots.length < maxSlots) {
    const next = stepScale(cursor, scale)
    const day = cursor.getDay()
    slots.push({
      index: slots.length,
      start: cursor,
      end: next,
      isWeekend: scale === 'day' || scale === 'hour3' ? day === 0 || day === 6 : false,
      isHoliday: scale === 'day' || scale === 'hour3' ? holidays.has(format(cursor, 'yyyy-MM-dd')) : false,
      isCurrent: now.getTime() >= cursor.getTime() && now.getTime() < next.getTime(),
    })
    cursor = next
  }

  const start = slots.length ? slots[0].start : from
  const end = slots.length ? slots[slots.length - 1].end : from
  const totalWidth = slots.length * slotWidth

  // JST壁時計へ変換済みの Date から座標を出す内部関数。
  // 公開APIの xOf / spanOf は必ずここへ集約し、二重変換を起こさない。
  function xOfJst(d: Date): number {
    if (!slots.length) return 0
    const t = d.getTime()
    if (t <= start.getTime()) return 0
    if (t >= end.getTime()) return totalWidth
    // 該当列を二分探索し、列内は按分する（月/年など可変長でも正しい位置になる）
    let lo = 0
    let hi = slots.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (slots[mid].start.getTime() <= t) lo = mid
      else hi = mid - 1
    }
    const slot = slots[lo]
    const fraction = (t - slot.start.getTime()) / (slot.end.getTime() - slot.start.getTime())
    return (lo + fraction) * slotWidth
  }

  function xOf(value: DateInput): number {
    return xOfJst(toJst(value))
  }

  function spanOf(startValue: DateInput, endValue: DateInput, opts?: { inclusiveEndDay?: boolean }): BarSpan {
    const s = toJst(startValue)
    let e = toJst(endValue)
    if (opts?.inclusiveEndDay) e = addDays(startOfDay(e), 1) // 終了日の終わりまで含める
    if (e.getTime() <= s.getTime()) e = new Date(s.getTime() + 1)
    // 表示範囲と全く重ならない場合は描画しない
    if (e.getTime() <= start.getTime() || s.getTime() >= end.getTime()) {
      return { left: 0, width: 0, visible: false }
    }
    const left = xOfJst(s)
    const right = xOfJst(e)
    return { left, width: Math.max(MIN_BAR_WIDTH, right - left), visible: true }
  }

  const currentX = now.getTime() >= start.getTime() && now.getTime() < end.getTime() ? xOfJst(now) : null

  return { scale, slotWidth, slots, start, end, totalWidth, xOf, spanOf, todayX: currentX }
}

export interface SlotGroup {
  label: string
  /** まとめた列数 */
  span: number
  start: Date
}

/**
 * ヘッダーの上段用に、列を月/年などでまとめる。
 * バーと同じ `timeline.slots` を根拠にするため、ヘッダーとバーがずれない。
 */
export function groupSlots(timeline: Timeline, by: 'day' | 'month' | 'year'): SlotGroup[] {
  const pattern = by === 'day' ? 'M/d' : by === 'month' ? 'yyyy年M月' : 'yyyy年'
  const groups: SlotGroup[] = []
  for (const slot of timeline.slots) {
    const label = format(slot.start, pattern, { locale: ja })
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.span += 1
    else groups.push({ label, span: 1, start: slot.start })
  }
  return groups
}

/**
 * 工程の期間から表示範囲を決める。
 * データが無い場合は「今日」を中心にした既定の範囲を返す。
 */
export function rangeFromPeriods(
  periods: readonly { start?: string | null; end?: string | null }[],
  options?: { padDays?: number; includeToday?: boolean; now?: DateInput },
): { from: string; to: string } {
  const pad = options?.padDays ?? 7
  const now = options?.now ? toJst(options.now) : nowJst()
  const times: number[] = []
  for (const p of periods) {
    if (p.start) times.push(toJst(p.start).getTime())
    if (p.end) times.push(toJst(p.end).getTime())
  }
  if (!times.length) {
    return {
      from: toJstIsoString(addDays(startOfDay(now), -pad * 2)),
      to: toJstIsoString(addDays(startOfDay(now), pad * 4)),
    }
  }
  let min = Math.min(...times)
  let max = Math.max(...times)
  // 今日が範囲外だと「今日線」が見えなくなるため、既定では今日も含める
  if (options?.includeToday !== false) {
    min = Math.min(min, now.getTime())
    max = Math.max(max, now.getTime())
  }
  return {
    from: toJstIsoString(addDays(startOfDay(new Date(min)), -pad)),
    to: toJstIsoString(addDays(startOfDay(new Date(max)), pad)),
  }
}
