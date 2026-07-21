import type { WbsTask } from '../types'

// 工程管理のガント表示範囲
export const ganttRange = {
  start: '2026-06-01',
  end: '2026-08-12',
  today: '2026-07-21',
}

// 祝日（範囲内・ダミー）
export const holidays: string[] = ['2026-07-20'] // 海の日

// 熊本中央局 光設備更改工事 の工程（通信工事らしい20工程＋5親工程）
export const wbsTasks: WbsTask[] = [
  // 親1 準備工
  { id: 't1', wbs: '1', name: '準備工', workType: '準備', crew: '第一班', manager: '山田 太郎', planStart: '2026-06-01', planEnd: '2026-06-12', actualStart: '2026-06-01', actualEnd: '2026-06-12', planDays: 10, progress: 100, planPeople: 12, actualPeople: 12, status: '完了', predecessors: [], level: 0, isParent: true },
  { id: 't1-1', wbs: '1.1', name: '事前現地調査', workType: '調査', crew: '第一班', manager: '山田 太郎', planStart: '2026-06-01', planEnd: '2026-06-03', actualStart: '2026-06-01', actualEnd: '2026-06-03', planDays: 3, progress: 100, planPeople: 2, actualPeople: 2, status: '完了', predecessors: [], level: 1, isParent: false },
  { id: 't1-2', wbs: '1.2', name: '道路使用許可確認', workType: '調整', crew: '第一班', manager: '山田 太郎', planStart: '2026-06-03', planEnd: '2026-06-06', actualStart: '2026-06-03', actualEnd: '2026-06-06', planDays: 3, progress: 100, planPeople: 1, actualPeople: 1, status: '完了', predecessors: ['1.1'], level: 1, isParent: false },
  { id: 't1-3', wbs: '1.3', name: '資材搬入', workType: '運搬', crew: '第二班', manager: '佐藤 花子', planStart: '2026-06-08', planEnd: '2026-06-10', actualStart: '2026-06-08', actualEnd: '2026-06-10', planDays: 3, progress: 100, planPeople: 4, actualPeople: 4, status: '完了', predecessors: ['1.2'], level: 1, isParent: false },
  { id: 't1-4', wbs: '1.4', name: 'KY活動（着工前）', workType: '安全', crew: '第一班', manager: '山田 太郎', planStart: '2026-06-11', planEnd: '2026-06-12', actualStart: '2026-06-11', actualEnd: '2026-06-12', planDays: 2, progress: 100, planPeople: 6, actualPeople: 6, status: '完了', predecessors: ['1.3'], level: 1, isParent: false },

  // 親2 敷設・設置工
  { id: 't2', wbs: '2', name: '敷設・設置工', workType: '土木・敷設', crew: '第一班', manager: '田中 一郎', planStart: '2026-06-15', planEnd: '2026-07-11', actualStart: '2026-06-15', actualEnd: '2026-07-11', planDays: 22, progress: 100, planPeople: 40, actualPeople: 42, status: '完了', predecessors: ['1'], level: 0, isParent: true, critical: true },
  { id: 't2-1', wbs: '2.1', name: '高所作業車配置', workType: '準備', crew: '第一班', manager: '田中 一郎', planStart: '2026-06-15', planEnd: '2026-06-16', actualStart: '2026-06-15', actualEnd: '2026-06-16', planDays: 2, progress: 100, planPeople: 3, actualPeople: 3, status: '完了', predecessors: ['1.4'], level: 1, isParent: false },
  { id: 't2-2', wbs: '2.2', name: '既設設備確認', workType: '調査', crew: '第一班', manager: '田中 一郎', planStart: '2026-06-16', planEnd: '2026-06-19', actualStart: '2026-06-16', actualEnd: '2026-06-19', planDays: 3, progress: 100, planPeople: 4, actualPeople: 4, status: '完了', predecessors: ['2.1'], level: 1, isParent: false },
  { id: 't2-3', wbs: '2.3', name: '光ケーブル敷設', workType: '敷設', crew: '第一班', manager: '田中 一郎', planStart: '2026-06-22', planEnd: '2026-07-04', actualStart: '2026-06-22', actualEnd: '2026-07-05', planDays: 10, progress: 100, planPeople: 24, actualPeople: 26, status: '完了', predecessors: ['2.2'], level: 1, isParent: false, critical: true },
  { id: 't2-4', wbs: '2.4', name: 'クロージャ設置', workType: '敷設', crew: '第一班', manager: '田中 一郎', planStart: '2026-07-06', planEnd: '2026-07-11', actualStart: '2026-07-07', actualEnd: '2026-07-11', planDays: 5, progress: 100, planPeople: 9, actualPeople: 9, status: '完了', predecessors: ['2.3'], level: 1, isParent: false, critical: true },

  // 親3 接続・試験工（現在進行中）
  { id: 't3', wbs: '3', name: '接続・試験工', workType: '接続', crew: '第二班', manager: '高橋 誠', planStart: '2026-07-13', planEnd: '2026-07-28', actualStart: '2026-07-13', actualEnd: null, planDays: 13, progress: 55, planPeople: 30, actualPeople: 22, status: '施工中', predecessors: ['2'], level: 0, isParent: true, critical: true },
  { id: 't3-1', wbs: '3.1', name: '光ファイバ融着', workType: '接続', crew: '第二班', manager: '高橋 誠', planStart: '2026-07-13', planEnd: '2026-07-18', actualStart: '2026-07-13', actualEnd: '2026-07-18', planDays: 5, progress: 100, planPeople: 12, actualPeople: 12, status: '完了', predecessors: ['2.4'], level: 1, isParent: false, critical: true },
  { id: 't3-2', wbs: '3.2', name: '接続損失測定', workType: '試験', crew: '第二班', manager: '高橋 誠', planStart: '2026-07-18', planEnd: '2026-07-22', actualStart: '2026-07-20', actualEnd: null, planDays: 4, progress: 60, planPeople: 6, actualPeople: 4, status: '遅延', predecessors: ['3.1'], level: 1, isParent: false, critical: true },
  { id: 't3-3', wbs: '3.3', name: 'ONU設置', workType: '宅内', crew: '第三班', manager: '鈴木 健', planStart: '2026-07-21', planEnd: '2026-07-24', actualStart: '2026-07-21', actualEnd: null, planDays: 3, progress: 20, planPeople: 6, actualPeople: 4, status: '施工中', predecessors: ['3.1'], level: 1, isParent: false },
  { id: 't3-4', wbs: '3.4', name: '光成端', workType: '接続', crew: '第二班', manager: '高橋 誠', planStart: '2026-07-24', planEnd: '2026-07-28', actualStart: null, actualEnd: null, planDays: 4, progress: 0, planPeople: 6, actualPeople: 0, status: '未着手', predecessors: ['3.2'], level: 1, isParent: false, critical: true },

  // 親4 切替工
  { id: 't4', wbs: '4', name: '切替工', workType: '切替', crew: '第一班', manager: '伊藤 直樹', planStart: '2026-07-29', planEnd: '2026-08-02', actualStart: null, actualEnd: null, planDays: 4, progress: 0, planPeople: 16, actualPeople: 0, status: '未着手', predecessors: ['3'], level: 0, isParent: true, critical: true },
  { id: 't4-1', wbs: '4.1', name: '切替作業', workType: '切替', crew: '第一班', manager: '伊藤 直樹', planStart: '2026-07-29', planEnd: '2026-07-31', actualStart: null, actualEnd: null, planDays: 2, progress: 0, planPeople: 10, actualPeople: 0, status: '未着手', predecessors: ['3.4'], level: 1, isParent: false, critical: true },
  { id: 't4-2', wbs: '4.2', name: '通信試験', workType: '試験', crew: '第二班', manager: '高橋 誠', planStart: '2026-07-31', planEnd: '2026-08-02', actualStart: null, actualEnd: null, planDays: 2, progress: 0, planPeople: 6, actualPeople: 0, status: '未着手', predecessors: ['4.1'], level: 1, isParent: false, critical: true },

  // 親5 完成・検査工
  { id: 't5', wbs: '5', name: '完成・検査工', workType: '検査', crew: '管理課', manager: '山田 太郎', planStart: '2026-08-03', planEnd: '2026-08-10', actualStart: null, actualEnd: null, planDays: 6, progress: 0, planPeople: 12, actualPeople: 0, status: '未着手', predecessors: ['4'], level: 0, isParent: true },
  { id: 't5-1', wbs: '5.1', name: '施工写真整理', workType: '整理', crew: '管理課', manager: '報告 担当', planStart: '2026-08-03', planEnd: '2026-08-04', actualStart: null, actualEnd: null, planDays: 1, progress: 0, planPeople: 2, actualPeople: 0, status: '未着手', predecessors: ['4.2'], level: 1, isParent: false },
  { id: 't5-2', wbs: '5.2', name: '品質確認', workType: '品質', crew: '品質課', manager: '品質 管理者', planStart: '2026-08-04', planEnd: '2026-08-05', actualStart: null, actualEnd: null, planDays: 1, progress: 0, planPeople: 2, actualPeople: 0, status: '未着手', predecessors: ['5.1'], level: 1, isParent: false },
  { id: 't5-3', wbs: '5.3', name: '完成図書作成', workType: '書類', crew: '管理課', manager: '報告 担当', planStart: '2026-08-05', planEnd: '2026-08-07', actualStart: null, actualEnd: null, planDays: 2, progress: 0, planPeople: 2, actualPeople: 0, status: '未着手', predecessors: ['5.2'], level: 1, isParent: false },
  { id: 't5-4', wbs: '5.4', name: '顧客確認', workType: '確認', crew: '管理課', manager: '山田 太郎', planStart: '2026-08-07', planEnd: '2026-08-08', actualStart: null, actualEnd: null, planDays: 1, progress: 0, planPeople: 2, actualPeople: 0, status: '未着手', predecessors: ['5.3'], level: 1, isParent: false },
  { id: 't5-5', wbs: '5.5', name: '完成検査', workType: '検査', crew: '管理課', manager: '山田 太郎', planStart: '2026-08-08', planEnd: '2026-08-09', actualStart: null, actualEnd: null, planDays: 1, progress: 0, planPeople: 3, actualPeople: 0, status: '未着手', predecessors: ['5.4'], level: 1, isParent: false, critical: true },
  { id: 't5-6', wbs: '5.6', name: '引き渡し', workType: 'マイルストン', crew: '管理課', manager: '山田 太郎', planStart: '2026-08-10', planEnd: '2026-08-10', actualStart: null, actualEnd: null, planDays: 0, progress: 0, planPeople: 1, actualPeople: 0, status: '未着手', predecessors: ['5.5'], level: 1, isParent: false, isMilestone: true, critical: true },
]

// 工期予測（固定ダミー）
export const forecast = {
  progressActual: 72,
  progressPlan: 80,
  originalDue: '2026-08-10',
  forecastDue: '2026-08-14',
  diffDays: 4,
  remainingTasks: 9,
  delayedTasks: 1,
  requiredPeople: 30,
  weatherImpact: '中（降雨・強風で+1日想定）',
  riskLevel: '中',
}

// 工期予測グラフ用（週次 予定/実績/予測）
export const forecastSeries = [
  { week: '6/1', plan: 8, actual: 8, predict: null as number | null },
  { week: '6/8', plan: 18, actual: 17, predict: null },
  { week: '6/15', plan: 30, actual: 29, predict: null },
  { week: '6/22', plan: 45, actual: 44, predict: null },
  { week: '6/29', plan: 58, actual: 55, predict: null },
  { week: '7/6', plan: 68, actual: 64, predict: null },
  { week: '7/13', plan: 76, actual: 70, predict: null },
  { week: '7/20', plan: 80, actual: 72, predict: 72 },
  { week: '7/27', plan: 88, actual: null, predict: 82 },
  { week: '8/3', plan: 95, actual: null, predict: 91 },
  { week: '8/10', plan: 100, actual: null, predict: 97 },
  { week: '8/14', plan: 100, actual: null, predict: 100 },
]
