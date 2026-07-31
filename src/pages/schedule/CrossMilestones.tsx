import { Flag } from 'lucide-react'
import { ScheduleComingSoon } from './ComingSoon'

/** 横断マイルストーン（複数案件の重要日の比較）。Phase 3 で実装予定。 */
export default function CrossMilestones() {
  return (
    <ScheduleComingSoon
      title="横断マイルストーン"
      icon={Flag}
      description="複数案件の契約・着工・検査・完工などの重要日を並べて比較する画面です。現在はマイルストーンを保持するデータ構造が無いため、まずDB設計から実装します。"
      planned={[
        'マイルストーンのDB化（現在は工程名からの暫定判定のみ）',
        '案件フロー・案件ラベル・担当役割・キーワードによる絞り込み',
        '検索条件の保存・削除・クリア',
        'Excel出力（既存の帳票出力基盤を利用）',
        '条件に合う案件が無い場合の空状態表示',
      ]}
    />
  )
}
