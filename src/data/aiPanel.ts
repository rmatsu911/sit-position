/**
 * AI機能の「何をする機能か」という説明文。
 *
 * ここにあるのは説明だけで、**実装済みかどうか・接続できているかどうかは含めない**。
 * 状態は `GET /ai/status` が実データ（学習済みモデル・推論ジョブ）から判定する。
 * キーはAPIの `features[].key` と一致させる。
 */
export interface AiFeatureDetail {
  future: string // 機能概要
  data: string // 利用データ
  effect: string // 効果
}

export const aiFeatureDetails: Record<string, AiFeatureDetail> = {
  photo_classification: {
    future: '施工写真をAIが認識し、設備種別・工種・工程の分類結果を提示。タグ付け・整理を自動化します。',
    data: '施工写真、工程情報、設備マスタ',
    effect: '写真整理の自動化と検索性の向上。撮り忘れ・重複の抑制。',
  },
  quality_check: {
    future: '施工写真を検査基準と照合し、余長・固定・タグ・完成状態などの検出結果と品質判定を提示します。',
    data: '施工写真、検査基準、完成基準写真',
    effect: '品質確認の均質化と検出漏れの防止。確認作業の効率化。',
  },
  completion_compare: {
    future: '確認対象写真と完成基準写真をAIが比較し、差異箇所を検出します。',
    data: '施工写真、完成基準写真',
    effect: '手戻り・再訪問の削減。仕上がりの均一化。',
  },
  duration_forecast: {
    future: '実績進捗・天候・要員稼働をAIが解析し、完了予定日と遅延リスクを予測します。',
    data: '予定/実績工程、天候履歴、要員稼働',
    effect: '遅延の早期把握と是正判断の迅速化。',
  },
  staffing_forecast: {
    future: '工程に必要な資格・人数と要員の稼働・保有資格を照合し、最適な配置を算出します。',
    data: '要員資格、稼働予定、工程別必要人数',
    effect: '過不足のない人員配置と過剰勤務の抑制。',
  },
  construction_advice: {
    future: '過去事例と施工基準をAIが検索・照合し、施工判断の根拠を提示します。',
    data: '過去案件、施工基準、相談履歴',
    effect: '判断の均質化。若手・応援要員の早期戦力化。',
  },
  report_generation: {
    future: '工程・写真・日報のデータからAIが施工管理表・各種帳票を作成します。',
    data: '工程実績、施工写真、現場日報',
    effect: '帳票作成の工数削減と記載内容の均質化。',
  },
}

export const aiPanelHeading = 'AI機能'
export const aiPanelIntro =
  '各機能の状態は、学習済みモデルと推論ジョブの実際の記録から判定しています。'
  + '「未実装」は機能そのものがまだ無いこと、「モデル未配置」「サービス未接続」は'
  + '実装はあるが動かせる状態にないことを表します。'
