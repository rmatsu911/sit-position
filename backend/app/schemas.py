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
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    report_date: date
    weather: str | None = None
    temperature: str | None = None
    worker_count: int | None = None
    work_description: str | None = None
    status: str


class DailyReportCreate(BaseModel):
    project_id: int
    site_id: int | None = None
    report_date: date
    weather: str | None = None
    temperature: str | None = None
    worker_count: int | None = None
    work_description: str | None = None
    ky_description: str | None = None
    problem: str | None = None
    next_day_plan: str | None = None


class DailyReportStatusUpdate(BaseModel):
    status: str  # DRAFT / SUBMITTED / REVIEWING / RETURNED / APPROVED


# ===== 品質 =====
class QualityCheckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    photo_id: int | None = None
    rule_id: int | None = None
    ai_result: str | None = None
    human_result: str | None = None
    status: str
    comment: str | None = None


# ===== 写真 =====
class PhotoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    project_id: int
    task_id: int | None = None
    original_url: str | None = None
    thumbnail_url: str | None = None
    original_filename: str | None = None
    taken_at: datetime | None = None
    confirmation_status: str
    comment: str | None = None


# ===== AI =====
class AiJobOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    photo_id: int
    job_type: str
    status: str
    queued_at: datetime | None = None
