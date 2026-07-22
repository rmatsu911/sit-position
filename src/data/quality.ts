import type { QualityItem } from '../types'

export const qualityItems: QualityItem[] = [
  { id: 'q1', projectId: 'p1', process: '光ケーブル敷設', inspectItem: 'ケーブル余長・固定間隔', photoId: 'ph3', judge: '注意', comment: 'ケーブル余長が基準よりやや不足の可能性。再確認要。', worker: '田中 一郎', checker: '品質 管理者', updatedAt: '2026/07/21 10:12', dueDate: '2026-07-23', status: '確認待ち' },
  { id: 'q2', projectId: 'p1', process: 'クロージャ設置', inspectItem: '防水処理・固定状態', photoId: 'ph7', judge: '合格', comment: '防水処理良好。固定トルク確認済み。', worker: '田中 一郎', checker: '品質 管理者', updatedAt: '2026/07/20 16:40', dueDate: '2026-07-22', status: '承認済み' },
  { id: 'q3', projectId: 'p1', process: '光ファイバ融着', inspectItem: '接続損失値', photoId: 'ph11', judge: '合格', comment: '全芯 0.05dB以下。基準内。', worker: '高橋 誠', checker: '品質 管理者', updatedAt: '2026/07/19 14:05', dueDate: '2026-07-21', status: '確認済み' },
  { id: 'q4', projectId: 'p1', process: 'ONU設置', inspectItem: 'ラベル表示・タグ装着', photoId: 'ph13', judge: '不合格', comment: '設備タグ未装着。再撮影を依頼。', worker: '鈴木 健', checker: '品質 管理者', updatedAt: '2026/07/21 09:30', dueDate: '2026-07-22', status: '再撮影依頼' },
  { id: 'q5', projectId: 'p1', process: '既設設備確認', inspectItem: '撤去前状態記録', photoId: 'ph6', judge: '未判定', comment: '', worker: '田中 一郎', checker: '—', updatedAt: '2026/07/21 08:15', dueDate: '2026-07-24', status: '情報不足' },
  { id: 'q6', projectId: 'p1', process: '接続損失測定', inspectItem: '測定結果記録', photoId: 'ph4', judge: '未判定', comment: '測定写真が未提出。', worker: '高橋 誠', checker: '—', updatedAt: '2026/07/21 11:00', dueDate: '2026-07-23', status: '未提出' },
  { id: 'q7', projectId: 'p3', process: '地中管路敷設', inspectItem: '管路埋設深さ', photoId: 'ph9', judge: '注意', comment: '一部区間で埋設深さの確認が必要。', worker: '田中 一郎', checker: '品質 管理者', updatedAt: '2026/07/20 15:20', dueDate: '2026-07-24', status: '警告' },
  { id: 'q8', projectId: 'p5', process: 'クロージャ更新', inspectItem: '完成状態', photoId: 'ph2', judge: '合格', comment: '完成状態良好。', worker: '高橋 誠', checker: '品質 管理者', updatedAt: '2026/07/19 17:00', dueDate: '2026-07-22', status: '確認済み' },
]

export const qualitySummary = {
  確認待ち: 7,
  不足: 2,
  未提出: 3,
  警告: 1,
  確認済み: 9,
  再撮影依頼: 1,
  承認済み: 14,
}

// AI施工品質チェック（固定表示・番号付き検出枠）
export const anomalyFindings = [
  { no: 1, label: 'ケーブル余長不足', x: 16, y: 28, w: 30, h: 20 },
  { no: 2, label: '固定位置不良', x: 52, y: 24, w: 26, h: 18 },
  { no: 3, label: '表示タグ未装着', x: 40, y: 60, w: 28, h: 16 },
]

// AI検出結果（施工品質チェック）
export const detectionPoints = ['ケーブル余長不足', '固定位置不良', '表示タグ未装着']

// AI施工品質チェックの写真メタ情報
export const anomalyMeta = {
  project: '熊本中央局 光設備更改工事',
  process: 'クロージャ設置',
  equipment: '光接続クロージャ',
  photoNo: 'P-003',
  takenAt: '2026/07/21 10:12',
  photographer: '田中 一郎',
  checker: '品質 管理者',
  inspectItem: 'ケーブル余長・固定間隔・タグ装着',
  judge: '要修正',
  priority: '中',
  dueDate: '2026/07/23',
}
