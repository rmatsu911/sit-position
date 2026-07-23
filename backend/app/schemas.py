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
    planned_start_at: datetime | None = None
    planned_finish_at: datetime | None = None
    actual_start_at: datetime | None = None
    actual_finish_at: datetime | None = None
    planned_progress: int
    actual_progress: int
    planned_workers: int
    actual_workers: int
    status: str


class TaskCreate(BaseModel):
    project_id: int
    parent_task_id: int | None = None
    wbs_code: str | None = None
    name: str
    work_type_id: int | None = None
    process_type_id: int | None = None
    planned_start_at: datetime | None = None
    planned_finish_at: datetime | None = None
    planned_progress: int = 0
    planned_workers: int = 0
    manager_id: int | None = None
    status: str = "未着手"


class TaskUpdate(BaseModel):
    name: str | None = None
    planned_start_at: datetime | None = None
    planned_finish_at: datetime | None = None
    actual_start_at: datetime | None = None
    actual_finish_at: datetime | None = None
    actual_progress: int | None = None
    actual_workers: int | None = None
    status: str | None = None
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
    bbox: list[float] | None = None


class PhotoAiOut(BaseModel):
    detections: list[DetectionOut] = []
    recognition: dict = {}
    source: str  # "ai_predictions" | "none"
