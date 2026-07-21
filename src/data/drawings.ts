import type { Drawing } from '../types'

export const drawings: Drawing[] = [
  { id: 'd1', no: 'DWG-001', name: '熊本中央局 局内配線系統図', type: '系統図', rev: 'Rev.3', updatedAt: '2026/07/18 14:20', updatedBy: '山田 太郎', approval: '承認済み' },
  { id: 'd2', no: 'DWG-002', name: '局前 光ケーブル敷設平面図', type: '平面図', rev: 'Rev.2', updatedAt: '2026/07/19 09:10', updatedBy: '田中 一郎', approval: '承認済み' },
  { id: 'd3', no: 'DWG-003', name: 'クロージャ接続図', type: '接続図', rev: 'Rev.1', updatedAt: '2026/07/20 11:45', updatedBy: '高橋 誠', approval: '確認中' },
  { id: 'd4', no: 'DWG-004', name: 'MDF室 ラック実装図', type: '実装図', rev: 'Rev.2', updatedAt: '2026/07/17 16:30', updatedBy: '鈴木 健', approval: '承認済み' },
  { id: 'd5', no: 'DWG-005', name: '切替手順図', type: '手順図', rev: 'Rev.1', updatedAt: '2026/07/21 08:05', updatedBy: '伊藤 直樹', approval: '差し戻し' },
  { id: 'd6', no: 'DWG-006', name: '完成図（全体）', type: '完成図', rev: 'Rev.0', updatedAt: '2026/07/15 10:00', updatedBy: '報告 担当', approval: '未提出' },
]
