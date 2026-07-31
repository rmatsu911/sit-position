import { LayoutGrid } from 'lucide-react'
import { ScheduleComingSoon } from './ComingSoon'

/** 横断工程（複数案件の俯瞰）。Phase 2 で実装予定。 */
export default function CrossSchedule() {
  return (
    <ScheduleComingSoon
      title="横断工程"
      icon={LayoutGrid}
      description="複数の案件の工程をまとめて比較する画面です。案件単位の詳細工程（案件工程タブ）とは用途が異なるため、別画面として用意します。"
      planned={[
        '案件別／担当者別／担当会社別にグルーピングして比較',
        '3時間・日・週・月・年の表示粒度切替と期間移動',
        '案件フロー・工程状態・業種・担当者による絞り込み',
        '検索条件の保存と呼び出し（ユーザーごと）',
        'AIによる遅延予測・要員競合の表示（未解析時は解析待ちと表示）',
      ]}
    />
  )
}
