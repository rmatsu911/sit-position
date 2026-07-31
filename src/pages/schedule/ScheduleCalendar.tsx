import { CalendarDays } from 'lucide-react'
import { ScheduleComingSoon } from './ComingSoon'

/** 工程・マイルストーン・期限を統合表示するカレンダー。Phase 3 で実装予定。 */
export default function ScheduleCalendar() {
  return (
    <ScheduleComingSoon
      title="カレンダー"
      icon={CalendarDays}
      description="工程・マイルストーン・日報予定・検査・提出期限を1つのカレンダーへ統合表示する画面です。表示するデータは既存の業務データを参照し、カレンダー専用のデータは持ちません。"
      planned={[
        '月表示／週表示の切替と前月・当月・翌月の移動',
        '工程・マイルストーン・図面提出期限・品質再確認期限の統合表示',
        '予定をクリックして元データ（工程・図面・品質）へ遷移',
        '案件の閲覧権限が無い予定は表示しない',
      ]}
    />
  )
}
