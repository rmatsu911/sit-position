/**
 * 工程管理画面（ガント）の表示設定。
 *
 * 日付→座標の計算は `src/lib/timeline.ts` に集約している。
 * ここには画面固有の見た目の設定（行高・ズーム倍率）だけを置く。
 */
import { addDays, format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { toJst } from '../../lib/timeline'

/** ガントのズーム。列は日単位のまま、幅だけを変えて表示範囲を広げる。 */
export type ViewMode = 'day' | 'week' | 'month'

/** ズームごとの列幅(px)。 */
export const dayWidthByMode: Record<ViewMode, number> = {
  day: 34,
  week: 15,
  month: 7,
}

/** 1行の高さ(px)。左表とガントで共有し、行位置を同期させる。 */
export const ROW_H = 32

/** 曜日ラベル（日本語）。 */
export function weekdayLabel(d: Date): string {
  return format(d, 'E', { locale: ja })
}

/** `yyyy-MM-dd` に日数を加算する（ドラッグ移動用）。 */
export function addDaysIso(iso: string, n: number): string {
  return format(addDays(toJst(iso), n), 'yyyy-MM-dd')
}
