export interface AiFeature {
  title: string
  future: string // 将来実装する機能
  data: string // 使用予定データ
  effect: string // 期待される効果
}

// 画面(route)ごとのAIサポートパネル内容（すべて「準備中」ダミー）
export const aiPanelByRoute: Record<string, { heading: string; items: AiFeature[] }> = {
  '/dashboard': {
    heading: 'AI全体分析',
    items: [
      { title: '本日の注意事項', future: '全案件の状況から本日注意すべき事項を自動抽出', data: '工程・天候・要員・品質データ', effect: '朝礼前の状況把握を数分で完了' },
      { title: '遅延候補の予測', future: '進捗トレンドから遅延リスクの高い案件を予測', data: '実績進捗・要員稼働・天候履歴', effect: '遅延の早期発見と是正' },
      { title: '確認待ちの優先度付け', future: '確認待ち項目を重要度順に自動整理', data: '品質判定・提出期限・工程', effect: '管理者の確認業務を効率化' },
      { title: 'AI全体分析', future: '全社の施工データを横断分析し傾向を可視化', data: '全案件の蓄積データ', effect: '経営判断の支援' },
    ],
  },
  '/schedule': {
    heading: 'AI工程支援',
    items: [
      { title: 'AI工期予測', future: '実績と天候から完了予定日を予測', data: '予定/実績工程・天候・要員', effect: '工期遅延の事前把握' },
      { title: '遅延予測', future: 'クリティカル工程の遅延を予測し警告', data: '進捗・依存関係・人員', effect: 'クリティカルパス管理の高度化' },
      { title: '人員最適化', future: '工程に応じた最適な要員配置を提案', data: '要員資格・稼働・工程', effect: '過不足のない人員配置' },
      { title: '天候影響分析', future: '天候予報から作業可否と影響日数を試算', data: '気象データ・工種', effect: '天候リスクの定量化' },
    ],
  },
  '/photos': {
    heading: 'AI画像支援',
    items: [
      { title: 'AI画像分類', future: '写真の設備種別・工程を自動分類', data: '施工写真・工程情報', effect: '写真整理の自動化' },
      { title: '設備分類', future: '光ケーブル・クロージャ等を判別', data: '画像特徴量', effect: '検索性の向上' },
      { title: '写真不足検知', future: '工程に必要な写真の不足を検知', data: '工程別 撮影基準', effect: '撮り忘れの防止' },
      { title: '重複写真検知', future: '類似・重複写真を自動検出', data: '画像類似度', effect: '整理工数の削減' },
    ],
  },
  '/quality': {
    heading: 'AI品質支援',
    items: [
      { title: 'AI品質チェック', future: '施工写真から品質基準の適合を判定', data: '施工写真・検査基準', effect: '品質確認の均質化' },
      { title: '異常箇所検知', future: '写真から異常箇所を検出しマーキング', data: '施工写真・良否事例', effect: '見落とし防止' },
      { title: '完成状態比較', future: '施工中と完成見本を比較し差異を提示', data: '施工/見本写真', effect: '手戻りの削減' },
      { title: '再撮影候補', future: '不鮮明・不足写真を再撮影候補として提示', data: '画像品質評価', effect: '再訪問の削減' },
    ],
  },
  '/daily-report': {
    heading: 'AI日報支援',
    items: [
      { title: '日報要約', future: '入力内容から要点を自動要約', data: '日報テキスト', effect: '確認・承認の効率化' },
      { title: 'リスク抽出', future: '記述からリスク・課題を自動抽出', data: '日報・過去事例', effect: 'リスクの早期共有' },
      { title: '翌日作業提案', future: '進捗と工程から翌日の作業を提案', data: '工程・実績', effect: '段取りの支援' },
    ],
  },
  '/personnel': {
    heading: 'AI要員支援',
    items: [
      { title: '人員最適配置', future: '資格・稼働状況から最適配置を提案', data: '要員資格・工程・稼働', effect: '配置検討の時短' },
      { title: '資格条件確認', future: '工程に必要な資格の充足を自動確認', data: '資格・工種要件', effect: '資格不足の防止' },
      { title: '過剰配置検知', future: '重複・過剰配置を自動検知', data: '配置・稼働', effect: '人件費の最適化' },
    ],
  },
}

export const defaultAiPanel = {
  heading: 'AIサポート',
  items: [
    { title: 'AI支援機能', future: '本システムに段階的にAI機能を追加予定', data: '蓄積された施工データ', effect: '施工管理業務の負担軽減' },
  ],
}
