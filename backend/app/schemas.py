from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ===== 認証 =====
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    name: str
    role: str
    department_id: int | None = None
    company_id: int | None = None


# ===== マスタ =====
class MasterItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    sort_order: int = 0
    active: bool = True


# ===== 案件 =====
class ProjectBase(BaseModel):
    construction_number: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    customer: str | None = None
    customer_type: str | None = None
    construction_type_id: int | None = None
    area: str | None = None
    location: str | None = None
    address: str | None = None
    branch_id: int | None = None
    department_id: int | None = None
    manager_id: int | None = None
    start_planned_at: date | None = None
    finish_planned_at: date | None = None
    contract_amount: float | None = None
    budget_planned: float | None = None
    budget_used: float | None = None
    planned_progress: int = 0
    actual_progress: int = 0
    status: str = "未着工"


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = None
    customer: str | None = None
    customer_type: str | None = None
    construction_type_id: int | None = None
    area: str | None = None
    location: str | None = None
    address: str | None = None
    branch_id: int | None = None
    department_id: int | None = None
    manager_id: int | None = None
    start_planned_at: date | None = None
    finish_planned_at: date | None = None
    start_actual_at: date | None = None
    finish_actual_at: date | None = None
    contract_amount: float | None = None
    budget_planned: float | None = None
    budget_used: float | None = None
    planned_progress: int | None = None
    actual_progress: int | None = None
    status: str | None = None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    construction_number: str
    name: str
    customer: str | None = None
    customer_type: str | None = None
    construction_type: str | None = None
    area: str | None = None
    location: str | None = None
    department: str | None = None
    manager: str | None = None
    status: str
    planned_progress: int
    actual_progress: int
    start_planned_at: date | None = None
    finish_planned_at: date | None = None
    contract_amount: float | None = None
    budget_planned: float | None = None
    budget_used: float | None = None
    unconfirmed_photos: int = 0
    quality_checks: int = 0
    updated_at: datetime | None = None


# ===== Site / Asset =====
class SiteCreate(BaseModel):
    project_id: int
    name: str
    address: str | None = None
    description: str | None = None


class SiteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    name: str
    address: str | None = None
    description: str | None = None


class AssetCreate(BaseModel):
    project_id: int
    site_id: int | None = None
    asset_type_id: int | None = None
    asset_code: str | None = None
    name: str
    manufacturer: str | None = None
    model_number: str | None = None
    status: str | None = None
    description: str | None = None


class AssetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    site_id: int | None = None
    asset_type_id: int | None = None
    asset_code: str | None = None
    name: str
    manufacturer: str | None = None
    model_number: str | None = None
    status: str | None = None


# ===== 工程 =====
class TaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    parent_task_id: int | None = None
    wbs_code: str | None = None
    name: str
    work_type: str | None = None
    process_type: str | None = None
    crew: str | None = None
    manager: str | None = None
    manager_id: int | None = None
    company: str | None = None
    company_id: int | None = None
    site_id: int | None = None
    planned_start_at: datetime | None = None
    planned_finish_at: datetime | None = None
    actual_start_at: datetime | None = None
    actual_finish_at: datetime | None = None
    planned_progress: int
    actual_progress: int
    planned_workers: int
    actual_workers: int
    status: str
    delay_reason: str | None = None
    notes: str | None = None
    schedule_precision: str = "day"
    dependencies: list[int] = Field(default_factory=list)


class TaskCreate(BaseModel):
    parent_task_id: int | None = None
    site_id: int | None = None
    wbs_code: str | None = None
    name: str
    work_type_id: int | None = None
    process_type_id: int | None = None
    planned_start_at: datetime | None = None
    planned_finish_at: datetime | None = None
    planned_progress: int = 0
    actual_progress: int = 0
    planned_workers: int = 0
    actual_workers: int = 0
    manager_id: int | None = None
    company_id: int | None = None
    status: str = "未着手"
    delay_reason: str | None = None
    notes: str | None = None
    schedule_precision: str = "day"
    dependency_ids: list[int] = Field(default_factory=list)


class TaskUpdate(BaseModel):
    parent_task_id: int | None = None
    site_id: int | None = None
    wbs_code: str | None = None
    name: str | None = None
    work_type_id: int | None = None
    process_type_id: int | None = None
    planned_start_at: datetime | None = None
    planned_finish_at: datetime | None = None
    actual_start_at: datetime | None = None
    actual_finish_at: datetime | None = None
    planned_progress: int | None = None
    actual_progress: int | None = None
    planned_workers: int | None = None
    actual_workers: int | None = None
    manager_id: int | None = None
    company_id: int | None = None
    status: str | None = None
    delay_reason: str | None = None
    notes: str | None = None
    schedule_precision: str | None = None
    dependency_ids: list[int] | None = None
    change_reason: str | None = None


# ===== 日報 =====
class DailyReportOut(BaseModel):
    id: int
    project_id: int
    site_id: int | None = None
    report_date: date
    weather: str | None = None
    temperature: str | None = None
    place: str | None = None
    crew: str | None = None
    manager: str | None = None
    start_time: str | None = None
    finish_time: str | None = None
    plan_workers: int | None = None
    actual_workers: int | None = None
    work_description: str | None = None
    process: str | None = None
    materials: str | None = None
    tools: str | None = None
    vehicles: str | None = None
    ky_description: str | None = None
    hazard: str | None = None
    safety_check: str | None = None
    quality_check: str | None = None
    problem: str | None = None
    next_day_plan: str | None = None
    note: str | None = None
    author: str | None = None
    checker: str | None = None
    approver: str | None = None
    status: str
    task_ids: list[int] = []
    photo_ids: list[int] = []


class DailyReportUpsert(BaseModel):
    project_id: int
    site_id: int | None = None
    report_date: date
    weather: str | None = None
    temperature: str | None = None
    place: str | None = None
    crew: str | None = None
    start_time: str | None = None
    finish_time: str | None = None
    plan_workers: int | None = None
    actual_workers: int | None = None
    work_description: str | None = None
    process: str | None = None
    materials: str | None = None
    tools: str | None = None
    vehicles: str | None = None
    ky_description: str | None = None
    hazard: str | None = None
    safety_check: str | None = None
    quality_check: str | None = None
    problem: str | None = None
    next_day_plan: str | None = None
    note: str | None = None


class DailyReportStatusUpdate(BaseModel):
    status: str  # DRAFT / SUBMITTED / REVIEWING / RETURNED / APPROVED


class DailyReportLinks(BaseModel):
    task_ids: list[int] | None = None
    photo_ids: list[int] | None = None


# ===== 品質 =====
class QualityCheckOut(BaseModel):
    id: int
    project_id: int
    site_id: int | None = None
    asset_id: int | None = None
    task_id: int | None = None
    photo_id: int | None = None
    rule_id: int | None = None
    inspect_item: str | None = None
    process: str | None = None
    judge: str
    worker: str | None = None
    checker: str | None = None
    due_date: date | None = None
    ai_result: str | None = None
    human_result: str | None = None
    status: str
    comment: str | None = None
    updated_at: datetime | None = None
    photo_thumbnail_url: str | None = None


class QualityActionUpdate(BaseModel):
    status: str | None = None
    judge: str | None = None
    comment: str | None = None


# ===== 写真 =====
class PhotoOut(BaseModel):
    id: int
    project_id: int
    site_id: int | None = None
    asset_id: int | None = None
    task_id: int | None = None
    photo_type_id: int | None = None
    no: str | None = None
    taken_at: datetime | None = None
    photographer: str | None = None
    place: str | None = None
    gps: str | None = None
    work_type: str | None = None
    process: str | None = None
    equipment: str | None = None
    tags: list[str] = []
    comment: str | None = None
    confirm: str
    favorite: bool = False
    ai_candidate: str | None = None
    original_url: str | None = None
    thumbnail_url: str | None = None
    uploaded: bool = True


class PhotoUpdate(BaseModel):
    tags: list[str] | None = None
    comment: str | None = None
    favorite: bool | None = None
    photo_type_id: int | None = None
    confirmed_work_type_id: int | None = None
    confirmed_process_type_id: int | None = None
    confirmed_asset_type_id: int | None = None


class PhotoConfirmUpdate(BaseModel):
    confirmation_status: str  # 未確認 / 確認済み / 再撮影依頼


# ===== AI =====
class AiJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    photo_id: int
    job_type: str
    status: str
    queued_at: datetime | None = None


class DetectionOut(BaseModel):
    label: str
    confidence: float
    kind: str
    bbox: list[float] | None = None  # 表示座標系 [x, y, w, h]（viewBox 100x75）
    bbox_norm: list[float] | None = None  # 正規化 [x, y, w, h]（0-1・左上原点）
    prediction_id: int | None = None
    class_id: int | None = None
    code: str | None = None
    feedback: str | None = None  # 既に付いた人間フィードバックの verdict


class PhotoAiOut(BaseModel):
    detections: list[DetectionOut] = []
    recognition: dict = {}
    source: str  # "ai_predictions" | "seed-demo" | "none"
    model: str | None = None
    model_version: str | None = None
    model_status: str | None = None  # ACTIVE / MODEL_NOT_AVAILABLE / DEMO ...


# ===== AI フィードバック（Ver.0.2）=====
class PredictionFeedbackIn(BaseModel):
    verdict: str  # correct（正しい）/ reclassify（クラス修正）/ false_positive（誤検出）
    corrected_label: str | None = None
    comment: str | None = None


class MissedFeedbackIn(BaseModel):
    label: str  # 未検出だった設備の表示名 or コード
    comment: str | None = None


class AiModelOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    model_type: str
    version: str
    dataset_version: str | None = None
    trained_at: datetime | None = None
    status: str


# ===== 要員・資格（Ver.0.1.2）=====
class WorkerOut(BaseModel):
    id: int
    name: str
    org: str | None = None
    crew: str | None = None
    role: str | None = None
    licenses: list[str] = []
    assignedTo: str | None = None
    schedule: list[str] = []
    status: str
    continuousDays: int = 0
    vacation: str | None = None
    note: str | None = None


class WorkerQualificationOut(BaseModel):
    name: str
    acquired_at: date | None = None
    expires_at: date | None = None
    certificate_no: str | None = None


class WorkerAssignmentOut(BaseModel):
    project_id: int
    project: str | None = None
    task_id: int | None = None
    task: str | None = None
    assigned_from: date | None = None
    assigned_to: date | None = None
    role: str | None = None
    status: str | None = None


class WorkerDetailOut(WorkerOut):
    company: str | None = None
    team: str | None = None
    qualifications: list[WorkerQualificationOut] = []
    assignments: list[WorkerAssignmentOut] = []


# ===== 工事台帳（Ver.0.1.2）=====
class LedgerRowOut(BaseModel):
    id: int
    workNo: str
    contractNo: str | None = None
    name: str
    client: str | None = None
    category: str | None = None
    area: str | None = None
    contractAmount: float | None = None
    costPlan: float | None = None
    costActual: float | None = None
    profitRate: float | None = None
    startDate: date | None = None
    dueDate: date | None = None
    finishDate: date | None = None
    manager: str | None = None
    progress: int = 0
    billing: str | None = None
    documents: str | None = None
    status: str


class LedgerUpdate(BaseModel):
    contract_no: str | None = None
    cost_planned: float | None = None
    cost_actual: float | None = None
    billing_status: str | None = None
    document_status: str | None = None


# ===== 図面・書類（Ver.0.1.2）=====
class DocumentVersionOut(BaseModel):
    id: int
    rev: str
    original_filename: str | None = None
    note: str | None = None
    updated_by: str | None = None
    updated_at: datetime | None = None
    file_url: str | None = None
    mime_type: str | None = None


class DocumentOut(BaseModel):
    id: int
    project_id: int | None = None
    no: str
    name: str
    type: str | None = None
    rev: str | None = None
    updatedAt: datetime | None = None
    updatedBy: str | None = None
    approval: str


class DocumentDetailOut(DocumentOut):
    versions: list[DocumentVersionOut] = []


class DocumentUpdate(BaseModel):
    name: str | None = None
    doc_type: str | None = None
    status: str | None = None


# ===== 通知（Ver.0.1.2）=====
class NotificationOut(BaseModel):
    id: int
    kind: str
    title: str
    body: str | None = None
    project: str | None = None
    at: datetime | None = None
    read: bool = False
    important: bool = False
    link: str | None = None


# ===== ダッシュボード集計（Ver.0.1.2）=====
class DashboardSummaryOut(BaseModel):
    total: int = 0
    active: int = 0
    delayed: int = 0
    workingToday: int = 0
    finishToday: int = 0
    photoPending: int = 0
    qualityWaiting: int = 0
    reportPending: int = 0
    peopleToday: int = 0


# ===== 要員配置（Ver.0.1.3）=====
class WorkerAssignmentCreate(BaseModel):
    project_id: int
    task_id: int | None = None
    assigned_from: date | None = None
    assigned_to: date | None = None
    role: str | None = None


class AssignmentCheckRow(BaseModel):
    task_id: int
    task_name: str
    planned_workers: int
    assigned_count: int
    ok: bool


# ===== 資材（Ver.0.1.3）=====
class ProjectMaterialOut(BaseModel):
    id: int
    project_id: int
    material_id: int
    name: str
    code: str | None = None
    model_number: str | None = None
    manufacturer: str | None = None
    unit: str | None = None
    task_id: int | None = None
    task: str | None = None
    qty_planned: float | None = None
    qty_used: float | None = None
    arrival_planned: date | None = None
    arrival_actual: date | None = None
    status: str | None = None


class ProjectMaterialCreate(BaseModel):
    project_id: int
    name: str
    code: str | None = None
    model_number: str | None = None
    manufacturer: str | None = None
    unit: str | None = None
    task_id: int | None = None
    qty_planned: float | None = None
    qty_used: float | None = None
    arrival_planned: date | None = None
    arrival_actual: date | None = None
    status: str | None = None


# ===== 試験記録（Ver.0.1.3）=====
class TestRecordOut(BaseModel):
    id: int
    project_id: int
    site_id: int | None = None
    asset_id: int | None = None
    asset: str | None = None
    task_id: int | None = None
    task: str | None = None
    test_type: str
    measured_at: datetime | None = None
    tester: str | None = None
    measured_value: str | None = None
    unit: str | None = None
    standard_value: str | None = None
    judge: str
    instrument: str | None = None
    attachment_url: str | None = None
    comment: str | None = None


class TestRecordCreate(BaseModel):
    project_id: int
    site_id: int | None = None
    asset_id: int | None = None
    task_id: int | None = None
    test_type: str
    measured_at: datetime | None = None
    measured_value: str | None = None
    unit: str | None = None
    standard_value: str | None = None
    judge: str = "未判定"
    instrument: str | None = None
    comment: str | None = None


# ===== 横断工程表（複数案件の工程を1画面で確認する）=====
class CrossTaskOut(BaseModel):
    """既存 TaskOut に、横断表示で必要な案件・組織・担当会社の情報を加えたもの。

    日時は既存工程と同じ [開始, 終了) の半開区間（Asia/Tokyo）で返す。
    横断工程表は独自データを持たず、この形で既存 tasks を横断表示するだけ。
    """
    id: int
    project_id: int
    project_name: str
    project_number: str
    construction_type_id: int | None = None
    construction_type: str | None = None
    department_id: int | None = None
    department: str | None = None
    parent_task_id: int | None = None
    wbs_code: str | None = None
    name: str
    work_type: str | None = None
    process_type: str | None = None
    manager_id: int | None = None
    manager: str | None = None
    company_id: int | None = None
    company: str | None = None
    site_id: int | None = None
    planned_start_at: datetime | None = None
    planned_finish_at: datetime | None = None
    actual_start_at: datetime | None = None
    actual_finish_at: datetime | None = None
    planned_progress: int
    actual_progress: int
    planned_workers: int
    actual_workers: int
    status: str
    delay_reason: str | None = None
    notes: str | None = None
    schedule_precision: str = "day"
    dependencies: list[int] = Field(default_factory=list)
    is_delayed: bool = False
    # 絞り込みに一致した工程か。False は WBS の親子関係を保つために補われた祖先工程。
    matched: bool = True


class SystemDetectionOut(BaseModel):
    """確定計算による検知結果。AI予測ではない（推論・確率を含まない）。"""
    kind: str          # schedule_overrun / manager_overlap / company_overlap / unassigned / actual_missing
    label: str
    severity: str      # high / medium / low
    message: str
    task_ids: list[int] = Field(default_factory=list)


class CrossScheduleOut(BaseModel):
    tasks: list[CrossTaskOut]
    total: int          # 絞り込みに一致した工程数（補われた祖先を除く）
    truncated: bool     # 上限件数で打ち切られたか
    limit: int
    range_from: datetime | None = None  # 対象工程の実期間（固定値ではない）
    range_to: datetime | None = None
    detections: list[SystemDetectionOut] = Field(default_factory=list)


class IdNameOut(BaseModel):
    id: int
    name: str


class CrossProjectOption(BaseModel):
    id: int
    name: str
    construction_number: str
    construction_type_id: int | None = None
    department_id: int | None = None
    status: str


class CrossScheduleOptions(BaseModel):
    """絞り込みの選択肢。権限と案件スコープを適用した範囲だけを返す。"""
    projects: list[CrossProjectOption]
    construction_types: list[IdNameOut]
    departments: list[IdNameOut]
    managers: list[IdNameOut]
    companies: list[IdNameOut]
    statuses: list[str]


# ===== 保存検索条件 =====
class SavedSearchOut(BaseModel):
    id: int
    screen: str
    name: str
    conditions: dict
    created_at: datetime | None = None
    updated_at: datetime | None = None


class SavedSearchCreate(BaseModel):
    screen: str
    name: str
    conditions: dict


class SavedSearchUpdate(BaseModel):
    name: str | None = None
    conditions: dict | None = None


# ===== マイルストーン（案件の重要日）=====
class MilestoneOut(BaseModel):
    """工程(tasks)とは別レコードの重要日。

    工程は期間 [開始, 終了) を持つが、マイルストーンは「その日」を指す一点。
    遅延は planned_at と actual_at の確定計算で求め、状態としては持たない。
    """
    # 登録済みレコードであることを示す（未設定候補は candidate）
    record_kind: str = "milestone"
    id: int
    project_id: int
    project_name: str
    project_number: str
    construction_type_id: int | None = None
    construction_type: str | None = None
    department_id: int | None = None
    department: str | None = None
    milestone_type_id: int | None = None
    milestone_type: str | None = None
    milestone_type_order: int = 0
    name: str
    planned_at: datetime | None = None
    actual_at: datetime | None = None
    status: str
    responsible_id: int | None = None
    responsible: str | None = None
    # 担当会社。担当者の所属からの導出ではなく独立した正データ
    company_id: int | None = None
    company: str | None = None
    # 関連工程。関連付けが無い場合は工程との関係を推測しない
    related_task_id: int | None = None
    related_task_wbs: str | None = None
    related_task_name: str | None = None
    # 入力粒度（day / half_day）。AM/PM専用列は持たず、日時とこの列だけで表す
    schedule_precision: str = "day"
    notes: str | None = None
    # ここから下は確定計算の結果（推論ではない）。DBの status とは別物。
    is_completed: bool = False          # 実績が入っている
    is_overdue: bool = False            # 実績未入力かつ予定日が基準日より前（当日は含めない）
    was_delayed: bool = False           # 完了したが実績日が予定日より後だった
    delay_days: int = 0                 # 完了時=実績日-予定日 / 未完了時=期限超過日数
    remaining_days: int | None = None   # 未完了かつ当日以降のときの残日数
    is_due_soon: bool = False           # 実績未入力かつ残日数が指定日数以内
    actual_missing: bool = False        # 予定日を過ぎているのに実績が未入力
    related_task_conflict: bool = False  # 関連工程の期間から外れている


class MilestoneCreate(BaseModel):
    project_id: int
    milestone_type_id: int | None = None
    name: str
    planned_at: datetime | None = None
    actual_at: datetime | None = None
    status: str = "予定"
    responsible_id: int | None = None
    company_id: int | None = None
    related_task_id: int | None = None
    schedule_precision: str = "day"
    notes: str | None = None


class MilestoneUpdate(BaseModel):
    milestone_type_id: int | None = None
    name: str | None = None
    planned_at: datetime | None = None
    actual_at: datetime | None = None
    status: str | None = None
    responsible_id: int | None = None
    company_id: int | None = None
    related_task_id: int | None = None
    schedule_precision: str | None = None
    notes: str | None = None
    change_reason: str | None = None


class MilestoneCandidateOut(BaseModel):
    """まだ登録されていない標準種別（未設定候補）。

    登録済みレコードと混同しないよう record_kind で区別し、実在するID・
    予定日・実績日・状態・担当者・担当会社は一切設定しない。
    """
    record_kind: str = "candidate"
    project_id: int
    project_name: str
    project_number: str
    milestone_type_id: int
    milestone_type: str
    milestone_type_order: int = 0


class MilestoneListOut(BaseModel):
    milestones: list[MilestoneOut]
    candidates: list[MilestoneCandidateOut]
    registered_count: int   # 絞り込み後の登録済み件数
    candidate_count: int    # 未設定候補の件数（登録済みとは別に数える）
    total: int              # 上限適用前の件数
    returned_count: int     # 実際に返した件数
    truncated: bool
    limit: int
    calculated_at: date     # 確定計算の基準日（Asia/Tokyo）
    due_soon_days: int


class MilestoneProjectOption(BaseModel):
    id: int
    name: str
    construction_number: str
    status: str


class MilestoneTaskOption(BaseModel):
    id: int
    wbs_code: str | None = None
    name: str
    project_id: int


class MilestoneOptions(BaseModel):
    projects: list[MilestoneProjectOption]
    milestone_types: list[IdNameOut]
    statuses: list[str]
    responsibles: list[IdNameOut]
    companies: list[IdNameOut]
    related_tasks: list[MilestoneTaskOption]
    calculated_at: date
