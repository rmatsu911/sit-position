// ============ 共通 ============
export type Tone = 'ok' | 'warn' | 'ng' | 'info' | 'muted'

// ============ 案件 ============
export type ProjectStatus =
  | '未着工'
  | '準備中'
  | '施工中'
  | '確認待ち'
  | '一時停止'
  | '遅延'
  | '完了'
  | '中止'

export interface Project {
  id: string
  code: string // 案件番号
  name: string // 工事名
  client: string // 顧客
  clientType: string
  area: string // エリア
  location: string // 工事場所
  category: string // 工事区分
  department: string // 担当部署
  manager: string // 現場責任者
  status: ProjectStatus
  progressPlan: number // 予定進捗
  progressActual: number // 実績進捗
  startDate: string // YYYY-MM-DD
  dueDate: string
  budgetPlan: number
  budgetUsed: number
  contractAmount: number
  costPlan: number
  costActual: number
  unconfirmedPhotos: number
  qualityChecks: number
  updatedAt: string // YYYY/MM/DD HH:mm
  delayed: boolean
}

// ============ 工程 (WBS/ガント) ============
export type TaskStatus = '未着手' | '施工中' | '完了' | '一時停止' | '遅延'

/** 入力・表示の粒度。日時が正で、これは粒度の判定にのみ使う。 */
export type SchedulePrecision = 'day' | 'half_day' | 'time'

export interface WbsTask {
  id: string
  wbs: string // 1 / 1.1 / 1.2 ...
  name: string
  workType: string // 工種
  crew: string // 担当班
  manager: string // 責任者
  // 期間は [開始, 終了) の半開区間（ISO日時・Asia/Tokyo基準）。
  // 終了は exclusive のため、1日工程は 00:00〜翌00:00、午前のみは 00:00〜12:00 になる。
  // 日程が未設定の工程もある。架空の日付で埋めず null のまま扱う。
  planStartAt: string | null
  planEndAt: string | null
  actualStartAt: string | null
  actualEndAt: string | null
  /** 入力・表示の粒度（日単位 / 0.5日単位 / 任意時刻） */
  precision: SchedulePrecision
  planDays: number | null // 予定日数（0.5刻み）。日程未設定なら null
  planProgress: number // 予定進捗 0-100
  progress: number // 実績進捗 0-100
  planPeople: number
  actualPeople: number
  status: TaskStatus
  predecessors: string[] // 先行工程 WBS
  predecessorIds: string[] // 先行工程のID（正本。WBSは表示用）
  notes: string | null
  delayReason: string | null
  // 担当情報の参照先。表示名（workType/crew/manager）はAPIが解決した値で、
  // 編集時はこちらのIDを送る。未設定は null のまま。
  workTypeId: number | null
  processTypeId: number | null
  teamId: number | null
  managerId: number | null
  companyId: number | null
  /** 親工程のID（parent_task_id が正本。WBSの文字列では判定しない） */
  parentId: string | null
  /** 階層の深さ（0=最上位）。2階層に限定しない */
  level: number
  /** 子工程を持つか（WBSにドットがあるかでは判定しない） */
  isParent: boolean
  critical?: boolean
}

// ============ 施工写真 ============
export type PhotoConfirm = '未確認' | '確認済み' | '再撮影依頼'
export interface Photo {
  id: string
  no: string
  projectId: string
  takenAt: string // YYYY/MM/DD HH:mm
  photographer: string
  place: string
  gps: string
  workType: string
  process: string
  equipment: string
  tags: string[]
  comment: string
  confirm: PhotoConfirm
  uploaded: boolean
  aiCandidate: string
  favorite: boolean
  colorKey: string // プレースホルダ画像の色分け
  imageUrl?: string | null // 原本画像URL（アップロード実写真。無ければプレースホルダ表示）
  thumbUrl?: string | null // サムネイルURL
}

// ============ 品質管理 ============
export type QualityJudge = '合格' | '注意' | '不合格' | '未判定'
export type QualityStatus =
  | '確認待ち'
  | '情報不足'
  | '未提出'
  | '警告'
  | '確認済み'
  | '再撮影依頼'
  | '承認済み'
export interface QualityItem {
  id: string
  projectId: string
  process: string
  inspectItem: string
  photoId: string
  judge: QualityJudge
  comment: string
  worker: string
  checker: string
  updatedAt: string
  dueDate: string
  status: QualityStatus
}

// ============ 現場日報 ============
export type ReportStatus = '下書き' | '提出済み' | '確認中' | '差し戻し' | '承認済み'
export interface DailyReport {
  id: string
  projectId: string
  date: string // YYYY-MM-DD
  weather: string
  temperature: string
  place: string
  crew: string
  manager: string
  startTime: string
  endTime: string
  planPeople: number
  actualPeople: number
  work: string
  process: string
  materials: string
  tools: string
  vehicles: string
  kyContent: string
  hazard: string
  safetyCheck: string
  qualityCheck: string
  problem: string
  tomorrow: string
  note: string
  author: string
  checker: string
  approver: string
  status: ReportStatus
  taskIds?: number[] // 紐付け工程
  photoIds?: number[] // 紐付け写真
}

// ============ 要員 ============
export type WorkStatus = '稼働' | '待機' | '休暇' | '移動中'
export interface Worker {
  id: string
  name: string
  org: string
  crew: string
  role: string
  licenses: string[]
  assignedTo: string // 案件名 or 待機
  schedule: WorkStatus[] // 7日分
  status: WorkStatus
  continuousDays: number
  vacation: string
  note: string
}

// ============ 工事台帳 ============
export interface LedgerRow {
  id: string
  workNo: string
  contractNo: string
  name: string
  client: string
  category: string
  area: string
  contractAmount: number
  costPlan: number
  costActual: number
  profitRate: number
  startDate: string
  dueDate: string
  finishDate: string | null
  manager: string
  progress: number
  billing: string
  documents: string
  status: ProjectStatus
}

// ============ 図面 ============
export type DrawingApproval = '承認済み' | '確認中' | '差し戻し' | '未提出'
export interface Drawing {
  id: string
  no: string
  name: string
  type: string
  rev: string
  updatedAt: string
  updatedBy: string
  approval: DrawingApproval
}

// ============ 通知 ============
export type NotifyKind =
  | '写真未提出'
  | '品質確認待ち'
  | '工程遅延'
  | '日報未提出'
  | '承認依頼'
  | '再撮影依頼'
  | '図面更新'
  | '担当者変更'
  | '資格期限接近'
  | '要員重複'
  | '提出期限接近'
  | '天候注意'
  | '熱中症注意'
export interface Notification {
  id: string
  kind: NotifyKind
  title: string
  body: string
  project: string
  at: string // YYYY/MM/DD HH:mm
  read: boolean
  important: boolean
  link: string // 遷移先ルート
}
