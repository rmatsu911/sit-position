/**
 * 工程管理画面（ガント）の小さな表示ヘルパー。
 *
 * 日付→座標の計算と表示単位（3時間/日/週/月/年）は `src/lib/timeline.ts` に、
 * 表示単位の切替UIと行高は `./GanttParts.tsx` に集約している。
 * 以前ここにあった `ViewMode` / `dayWidthByMode` は「列は日単位のまま幅だけ変える」
 * ズームで、3時間・年を選べなかったため廃止した。
 */
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

/** 曜日ラベル（日本語）。 */
export function weekdayLabel(d: Date): string {
  return format(d, 'E', { locale: ja })
}
