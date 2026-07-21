import type {
  CategoryShare,
  Member,
  MonthlySales,
  Project,
  ScheduleEvent,
  Task,
} from '../types'

export const members: Member[] = [
  { id: 'M001', name: '佐藤 健一', department: '営業部', role: '部長', email: 'sato@example.co.jp', status: '稼働中', activeTasks: 4 },
  { id: 'M002', name: '鈴木 美咲', department: '開発部', role: 'リーダー', email: 'suzuki@example.co.jp', status: '稼働中', activeTasks: 7 },
  { id: 'M003', name: '高橋 大輔', department: '開発部', role: 'エンジニア', email: 'takahashi@example.co.jp', status: '離席中', activeTasks: 5 },
  { id: 'M004', name: '田中 由美', department: 'デザイン部', role: 'デザイナー', email: 'tanaka@example.co.jp', status: '稼働中', activeTasks: 3 },
  { id: 'M005', name: '伊藤 翔太', department: '営業部', role: '主任', email: 'ito@example.co.jp', status: '休暇中', activeTasks: 2 },
  { id: 'M006', name: '渡辺 彩', department: 'マーケティング部', role: 'マネージャー', email: 'watanabe@example.co.jp', status: '稼働中', activeTasks: 6 },
  { id: 'M007', name: '山本 拓也', department: '開発部', role: 'エンジニア', email: 'yamamoto@example.co.jp', status: '稼働中', activeTasks: 4 },
  { id: 'M008', name: '中村 麻衣', department: 'カスタマーサポート', role: 'スタッフ', email: 'nakamura@example.co.jp', status: '離席中', activeTasks: 3 },
]

export const projects: Project[] = [
  { id: 'P-2041', name: '基幹システム刷新プロジェクト', client: '株式会社ミライ商事', owner: '鈴木 美咲', status: '進行中', priority: '高', progress: 68, budget: 24000000, startDate: '2026-04-01', dueDate: '2026-09-30' },
  { id: 'P-2042', name: 'コーポレートサイトリニューアル', client: 'グリーンフーズ株式会社', owner: '田中 由美', status: '進行中', priority: '中', progress: 45, budget: 6800000, startDate: '2026-05-15', dueDate: '2026-08-20' },
  { id: 'P-2043', name: '在庫管理アプリ開発', client: 'サンライズ物流', owner: '高橋 大輔', status: '進行中', priority: '高', progress: 82, budget: 12500000, startDate: '2026-03-10', dueDate: '2026-08-05' },
  { id: 'P-2044', name: 'マーケティング分析基盤構築', client: '株式会社ブルースカイ', owner: '渡辺 彩', status: '保留', priority: '中', progress: 30, budget: 9200000, startDate: '2026-06-01', dueDate: '2026-11-30' },
  { id: 'P-2045', name: 'モバイルアプリUI改善', client: 'テックウェーブ株式会社', owner: '田中 由美', status: '完了', priority: '低', progress: 100, budget: 4300000, startDate: '2026-01-20', dueDate: '2026-05-31' },
  { id: 'P-2046', name: '営業支援ツール導入', client: '株式会社ミライ商事', owner: '佐藤 健一', status: '未着手', priority: '中', progress: 0, budget: 7600000, startDate: '2026-08-01', dueDate: '2026-12-15' },
  { id: 'P-2047', name: 'ECサイト決済連携', client: 'グリーンフーズ株式会社', owner: '山本 拓也', status: '進行中', priority: '高', progress: 55, budget: 5400000, startDate: '2026-05-01', dueDate: '2026-09-10' },
  { id: 'P-2048', name: '社内ヘルプデスク改善', client: '自社', owner: '中村 麻衣', status: '完了', priority: '低', progress: 100, budget: 1800000, startDate: '2026-02-01', dueDate: '2026-04-30' },
]

export const tasks: Task[] = [
  { id: 'T-001', title: '要件定義書レビュー', projectId: 'P-2041', assignee: '鈴木 美咲', status: '進行中', priority: '高', dueDate: '2026-07-24' },
  { id: 'T-002', title: 'データベース設計', projectId: 'P-2041', assignee: '山本 拓也', status: '進行中', priority: '高', dueDate: '2026-07-28' },
  { id: 'T-003', title: 'トップページデザイン制作', projectId: 'P-2042', assignee: '田中 由美', status: '進行中', priority: '中', dueDate: '2026-07-23' },
  { id: 'T-004', title: 'API結合テスト', projectId: 'P-2043', assignee: '高橋 大輔', status: '進行中', priority: '高', dueDate: '2026-07-22' },
  { id: 'T-005', title: '分析要件ヒアリング', projectId: 'P-2044', assignee: '渡辺 彩', status: '保留', priority: '中', dueDate: '2026-07-30' },
  { id: 'T-006', title: '決済フロー実装', projectId: 'P-2047', assignee: '山本 拓也', status: '進行中', priority: '高', dueDate: '2026-07-25' },
  { id: 'T-007', title: '営業ツール選定資料作成', projectId: 'P-2046', assignee: '佐藤 健一', status: '未着手', priority: '中', dueDate: '2026-08-04' },
  { id: 'T-008', title: 'リリース手順書作成', projectId: 'P-2043', assignee: '高橋 大輔', status: '未着手', priority: '中', dueDate: '2026-07-31' },
  { id: 'T-009', title: 'ユーザー受け入れテスト', projectId: 'P-2045', assignee: '田中 由美', status: '完了', priority: '低', dueDate: '2026-05-28' },
  { id: 'T-010', title: 'キックオフ会議準備', projectId: 'P-2046', assignee: '伊藤 翔太', status: '未着手', priority: '低', dueDate: '2026-07-29' },
]

export const scheduleEvents: ScheduleEvent[] = [
  { id: 'E-01', title: '基幹システム定例会議', date: '2026-07-21', category: '会議', time: '10:00' },
  { id: 'E-02', title: 'ミライ商事 訪問', date: '2026-07-22', category: '訪問', time: '14:00' },
  { id: 'E-03', title: 'API結合テスト 締切', date: '2026-07-22', category: '締切', time: '18:00' },
  { id: 'E-04', title: 'トップページ 締切', date: '2026-07-23', category: '締切', time: '17:00' },
  { id: 'E-05', title: '全社ミーティング', date: '2026-07-24', category: '社内', time: '09:30' },
  { id: 'E-06', title: '決済連携レビュー', date: '2026-07-25', category: '会議', time: '15:00' },
  { id: 'E-07', title: 'グリーンフーズ 打合せ', date: '2026-07-28', category: '訪問', time: '11:00' },
  { id: 'E-08', title: '月次報告会', date: '2026-07-31', category: '社内', time: '16:00' },
]

export const monthlySales: MonthlySales[] = [
  { month: '1月', 売上: 18200000, 目標: 17000000 },
  { month: '2月', 売上: 16400000, 目標: 17000000 },
  { month: '3月', 売上: 21500000, 目標: 19000000 },
  { month: '4月', 売上: 19800000, 目標: 20000000 },
  { month: '5月', 売上: 23100000, 目標: 21000000 },
  { month: '6月', 売上: 22400000, 目標: 22000000 },
  { month: '7月', 売上: 25600000, 目標: 23000000 },
]

export const categoryShare: CategoryShare[] = [
  { name: 'システム開発', value: 42 },
  { name: 'Web制作', value: 26 },
  { name: 'コンサルティング', value: 18 },
  { name: '保守運用', value: 14 },
]

export const weeklyActivity = [
  { day: '月', 対応件数: 32, 完了件数: 24 },
  { day: '火', 対応件数: 28, 完了件数: 21 },
  { day: '水', 対応件数: 41, 完了件数: 33 },
  { day: '木', 対応件数: 35, 完了件数: 30 },
  { day: '金', 対応件数: 47, 完了件数: 38 },
  { day: '土', 対応件数: 12, 完了件数: 10 },
  { day: '日', 対応件数: 6, 完了件数: 5 },
]
