"""SQLAlchemy 2.0 モデル定義（Ver.0.1）。

方針:
- 中核3階層 Project -> Site -> Asset に業務情報を関連付ける
- マスタは ID / 表示名を分離（将来AIも同じIDを返せる）
- 原本写真は不変。AIの結果は人間確定結果と分離
- 重要データは論理削除（deleted_at / deleted_by / delete_reason）
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base

# ===== ロール / ステータス定数 =====
ROLES = ("ADMIN", "PROJECT_MANAGER", "FIELD_WORKER", "QUALITY_MANAGER", "VIEWER")
JOB_STATUSES = ("QUEUED", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED")
REPORT_STATUSES = ("DRAFT", "SUBMITTED", "REVIEWING", "RETURNED", "APPROVED")


# ===== Mixin =====
class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class SoftDeleteMixin:
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    delete_reason: Mapped[str | None] = mapped_column(Text, nullable=True)


# ===== 組織・ユーザー =====
class Branch(Base, TimestampMixin):
    __tablename__ = "branches"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    name: Mapped[str] = mapped_column(String(120))


class Department(Base, TimestampMixin):
    __tablename__ = "departments"
    id: Mapped[int] = mapped_column(primary_key=True)
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"))
    name: Mapped[str] = mapped_column(String(120))


class Company(Base, TimestampMixin):
    __tablename__ = "companies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    is_partner: Mapped[bool] = mapped_column(Boolean, default=False)  # 協力会社


class User(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(32), default="VIEWER")
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ProjectMember(Base, TimestampMixin):
    """案件ごとのアクセス範囲（協力会社ユーザーは割当案件のみ閲覧可）。"""
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_member"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(32), default="VIEWER")


# ===== マスタ（ID/表示名分離）=====
class _MasterBase(TimestampMixin):
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class WorkType(Base, _MasterBase):
    __tablename__ = "work_types"


class ProcessType(Base, _MasterBase):
    __tablename__ = "process_types"


class AssetType(Base, _MasterBase):
    __tablename__ = "asset_types"


class PhotoType(Base, _MasterBase):
    __tablename__ = "photo_types"


class QualityRuleType(Base, _MasterBase):
    __tablename__ = "quality_rule_types"


class ConstructionType(Base, _MasterBase):
    __tablename__ = "construction_types"


# ===== 中核3階層 =====
class Project(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    construction_number: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    customer: Mapped[str | None] = mapped_column(String(200))
    customer_type: Mapped[str | None] = mapped_column(String(64))
    construction_type_id: Mapped[int | None] = mapped_column(ForeignKey("construction_types.id"))
    area: Mapped[str | None] = mapped_column(String(120))  # エリア
    location: Mapped[str | None] = mapped_column(String(255))  # 工事場所
    address: Mapped[str | None] = mapped_column(String(255))
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    branch_id: Mapped[int | None] = mapped_column(ForeignKey("branches.id"))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    start_planned_at: Mapped[date | None] = mapped_column(Date)
    finish_planned_at: Mapped[date | None] = mapped_column(Date)
    start_actual_at: Mapped[date | None] = mapped_column(Date)
    finish_actual_at: Mapped[date | None] = mapped_column(Date)
    contract_amount: Mapped[float | None] = mapped_column(Numeric(14, 2))
    budget_planned: Mapped[float | None] = mapped_column(Numeric(14, 2))
    budget_used: Mapped[float | None] = mapped_column(Numeric(14, 2))
    planned_progress: Mapped[int] = mapped_column(Integer, default=0)
    actual_progress: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="未着工")

    sites: Mapped[list["Site"]] = relationship(back_populates="project")


class Site(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "sites"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(255))
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    description: Mapped[str | None] = mapped_column(Text)

    project: Mapped[Project] = relationship(back_populates="sites")


class Asset(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "assets"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"), index=True)
    asset_type_id: Mapped[int | None] = mapped_column(ForeignKey("asset_types.id"))
    asset_code: Mapped[str | None] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(200))
    manufacturer: Mapped[str | None] = mapped_column(String(160))
    model_number: Mapped[str | None] = mapped_column(String(160))
    installed_at: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(String(32))
    description: Mapped[str | None] = mapped_column(Text)


# ===== 工程 =====
class Task(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"))
    parent_task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"))
    wbs_code: Mapped[str | None] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(200))
    work_type_id: Mapped[int | None] = mapped_column(ForeignKey("work_types.id"))
    process_type_id: Mapped[int | None] = mapped_column(ForeignKey("process_types.id"))
    planned_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    planned_finish_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_start_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_finish_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    planned_progress: Mapped[int] = mapped_column(Integer, default=0)
    actual_progress: Mapped[int] = mapped_column(Integer, default=0)
    planned_workers: Mapped[int] = mapped_column(Integer, default=0)
    actual_workers: Mapped[int] = mapped_column(Integer, default=0)
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(32), default="未着手")
    delay_reason: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class TaskDependency(Base, TimestampMixin):
    __tablename__ = "task_dependencies"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    depends_on_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    dependency_type: Mapped[str] = mapped_column(String(8), default="FS")  # FS/SS/FF/SF


class TaskChangeHistory(Base, TimestampMixin):
    """工程変更は上書きせず履歴を保存。"""
    __tablename__ = "task_change_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    field: Mapped[str] = mapped_column(String(64))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    changed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    change_reason: Mapped[str | None] = mapped_column(Text)


# ===== 施工写真（原本不変・メタ管理）=====
class Photo(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "photos"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"))
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"))
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"))
    photo_type_id: Mapped[int | None] = mapped_column(ForeignKey("photo_types.id"))

    original_file_path: Mapped[str] = mapped_column(String(500))
    thumbnail_path: Mapped[str | None] = mapped_column(String(500))
    original_filename: Mapped[str | None] = mapped_column(String(255))
    mime_type: Mapped[str | None] = mapped_column(String(64))
    file_size: Mapped[int | None] = mapped_column(Integer)
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    sha256: Mapped[str | None] = mapped_column(String(64), index=True)

    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    photographer_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    latitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[float | None] = mapped_column(Numeric(9, 6))
    comment: Mapped[str | None] = mapped_column(Text)

    # 人間が確定した結果（AIとは分離）
    confirmed_work_type_id: Mapped[int | None] = mapped_column(ForeignKey("work_types.id"))
    confirmed_process_type_id: Mapped[int | None] = mapped_column(ForeignKey("process_types.id"))
    confirmed_asset_type_id: Mapped[int | None] = mapped_column(ForeignKey("asset_types.id"))
    confirmation_status: Mapped[str] = mapped_column(String(32), default="未確認")
    confirmed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # 表示用（Ver.0.1.1）
    photo_no: Mapped[str | None] = mapped_column(String(32))
    place: Mapped[str | None] = mapped_column(String(200))
    tags: Mapped[str | None] = mapped_column(Text)  # JSON配列文字列
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)


# ===== AI（構造のみ。推論は未実装）=====
class AiModel(Base, TimestampMixin):
    __tablename__ = "ai_models"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    model_type: Mapped[str] = mapped_column(String(32))  # YOLO / ViT / OCR / LLM ...
    version: Mapped[str] = mapped_column(String(32))
    dataset_version: Mapped[str | None] = mapped_column(String(32))
    trained_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE")


class AiAnalysisJob(Base, TimestampMixin):
    __tablename__ = "ai_analysis_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id"), index=True)
    model_id: Mapped[int | None] = mapped_column(ForeignKey("ai_models.id"))
    job_type: Mapped[str] = mapped_column(String(32))  # detection / classification / ocr
    status: Mapped[str] = mapped_column(String(16), default="QUEUED")
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)


class AiPrediction(Base, TimestampMixin):
    __tablename__ = "ai_predictions"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("ai_analysis_jobs.id"), index=True)
    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id"), index=True)
    model_id: Mapped[int | None] = mapped_column(ForeignKey("ai_models.id"))
    prediction_type: Mapped[str] = mapped_column(String(32))
    predicted_class_id: Mapped[int | None] = mapped_column(Integer)  # マスタID
    predicted_label: Mapped[str | None] = mapped_column(String(120))
    confidence: Mapped[float | None] = mapped_column(Numeric(5, 4))
    bounding_box: Mapped[str | None] = mapped_column(Text)  # JSON文字列
    raw_result: Mapped[str | None] = mapped_column(Text)  # JSON文字列


class AiFeedback(Base, TimestampMixin):
    """AI結果と人間確定結果を分離保存。誤りも再学習データとして保持。"""
    __tablename__ = "ai_feedback"
    id: Mapped[int] = mapped_column(primary_key=True)
    prediction_id: Mapped[int] = mapped_column(ForeignKey("ai_predictions.id"), index=True)
    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id"))
    ai_result: Mapped[str | None] = mapped_column(Text)
    human_result: Mapped[str | None] = mapped_column(Text)
    accepted: Mapped[bool | None] = mapped_column(Boolean)
    corrected_value: Mapped[str | None] = mapped_column(Text)
    feedback_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    feedback_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    comment: Mapped[str | None] = mapped_column(Text)


class AiThresholdSetting(Base, TimestampMixin):
    """信頼度の閾値はコード固定せずDB管理（管理者が変更可）。"""
    __tablename__ = "ai_threshold_settings"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_type: Mapped[str] = mapped_column(String(32))
    auto_accept_threshold: Mapped[float] = mapped_column(Numeric(5, 4), default=0.90)
    review_threshold: Mapped[float] = mapped_column(Numeric(5, 4), default=0.70)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


# ===== 品質 =====
class QualityRule(Base, TimestampMixin):
    __tablename__ = "quality_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    work_type_id: Mapped[int | None] = mapped_column(ForeignKey("work_types.id"))
    process_type_id: Mapped[int | None] = mapped_column(ForeignKey("process_types.id"))
    asset_type_id: Mapped[int | None] = mapped_column(ForeignKey("asset_types.id"))
    check_name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str | None] = mapped_column(Text)
    required_photo_type_id: Mapped[int | None] = mapped_column(ForeignKey("photo_types.id"))
    reference_image_path: Mapped[str | None] = mapped_column(String(500))
    severity: Mapped[str] = mapped_column(String(16), default="中")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class QualityCheck(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "quality_checks"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"))
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"))
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"))
    photo_id: Mapped[int | None] = mapped_column(ForeignKey("photos.id"))
    rule_id: Mapped[int | None] = mapped_column(ForeignKey("quality_rules.id"))
    inspect_item: Mapped[str | None] = mapped_column(String(200))
    process: Mapped[str | None] = mapped_column(String(120))
    judge: Mapped[str] = mapped_column(String(16), default="未判定")
    due_date: Mapped[date | None] = mapped_column(Date)
    worker_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    ai_result: Mapped[str | None] = mapped_column(Text)
    human_result: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="確認待ち")
    checked_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    comment: Mapped[str | None] = mapped_column(Text)


# ===== 日報 =====
class DailyReport(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "daily_reports"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"))
    report_date: Mapped[date] = mapped_column(Date)
    weather: Mapped[str | None] = mapped_column(String(64))
    temperature: Mapped[str | None] = mapped_column(String(32))
    start_time: Mapped[str | None] = mapped_column(String(16))
    finish_time: Mapped[str | None] = mapped_column(String(16))
    manager_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    worker_count: Mapped[int | None] = mapped_column(Integer)
    work_description: Mapped[str | None] = mapped_column(Text)
    ky_description: Mapped[str | None] = mapped_column(Text)
    problem: Mapped[str | None] = mapped_column(Text)
    response: Mapped[str | None] = mapped_column(Text)
    next_day_plan: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="DRAFT")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # 表示・入力用（Ver.0.1.1）
    place: Mapped[str | None] = mapped_column(String(200))
    crew: Mapped[str | None] = mapped_column(String(64))
    plan_workers: Mapped[int | None] = mapped_column(Integer)
    actual_workers: Mapped[int | None] = mapped_column(Integer)
    process: Mapped[str | None] = mapped_column(String(200))
    materials: Mapped[str | None] = mapped_column(Text)
    tools: Mapped[str | None] = mapped_column(Text)
    vehicles: Mapped[str | None] = mapped_column(Text)
    hazard: Mapped[str | None] = mapped_column(Text)
    safety_check: Mapped[str | None] = mapped_column(String(64))
    quality_check: Mapped[str | None] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text)
    checker_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approver_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


class DailyReportPhoto(Base, TimestampMixin):
    __tablename__ = "daily_report_photos"
    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("daily_reports.id"), index=True)
    photo_id: Mapped[int] = mapped_column(ForeignKey("photos.id"))


class DailyReportTask(Base, TimestampMixin):
    __tablename__ = "daily_report_tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("daily_reports.id"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))


# ===== Task ↔ Asset（1工程で複数設備）=====
class TaskAsset(Base, TimestampMixin):
    __tablename__ = "task_assets"
    __table_args__ = (UniqueConstraint("task_id", "asset_id", name="uq_task_asset"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), index=True)


# ===== 要員・資格 =====
class Team(Base, TimestampMixin):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    code: Mapped[str | None] = mapped_column(String(32))
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"))


class Worker(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "workers"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(120))
    org: Mapped[str | None] = mapped_column(String(160))  # 表示用の所属（部署/協力会社名）
    company_id: Mapped[int | None] = mapped_column(ForeignKey("companies.id"))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"))
    role: Mapped[str | None] = mapped_column(String(64))  # 工事長 / 現場責任者 / 技術者 / 作業員
    status: Mapped[str] = mapped_column(String(16), default="待機")  # 稼働 / 待機 / 休暇 / 移動中
    continuous_days: Mapped[int] = mapped_column(Integer, default=0)
    vacation: Mapped[str | None] = mapped_column(String(64))
    note: Mapped[str | None] = mapped_column(Text)
    schedule: Mapped[str | None] = mapped_column(Text)  # 7日分の稼働状況（JSON配列）


class Qualification(Base, TimestampMixin):
    __tablename__ = "qualifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str | None] = mapped_column(String(32))
    name: Mapped[str] = mapped_column(String(120))


class WorkerQualification(Base, TimestampMixin):
    __tablename__ = "worker_qualifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    qualification_id: Mapped[int] = mapped_column(ForeignKey("qualifications.id"))
    acquired_at: Mapped[date | None] = mapped_column(Date)
    expires_at: Mapped[date | None] = mapped_column(Date)
    certificate_no: Mapped[str | None] = mapped_column(String(64))


class WorkerAssignment(Base, TimestampMixin):
    __tablename__ = "worker_assignments"
    id: Mapped[int] = mapped_column(primary_key=True)
    worker_id: Mapped[int] = mapped_column(ForeignKey("workers.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"))
    assigned_from: Mapped[date | None] = mapped_column(Date)
    assigned_to: Mapped[date | None] = mapped_column(Date)
    role: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str | None] = mapped_column(String(16))


# ===== 工事台帳（projectsを基本データとし、台帳固有項目のみ保持）=====
class ProjectLedger(Base, TimestampMixin):
    __tablename__ = "project_ledgers"
    __table_args__ = (UniqueConstraint("project_id", name="uq_project_ledger"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    contract_no: Mapped[str | None] = mapped_column(String(64))
    cost_planned: Mapped[float | None] = mapped_column(Numeric(14, 2))
    cost_actual: Mapped[float | None] = mapped_column(Numeric(14, 2))
    billing_status: Mapped[str | None] = mapped_column(String(32))  # 未請求 / 請求済 / 入金済 / 一部入金
    document_status: Mapped[str | None] = mapped_column(String(32))  # 未着手 / 作成中 / 確認中 / 完了


# ===== 図面・書類（版管理・原版は上書きしない）=====
class Document(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), index=True)
    doc_no: Mapped[str] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(200))
    doc_type: Mapped[str | None] = mapped_column(String(64))  # 系統図 / 平面図 / 接続図 ...
    status: Mapped[str] = mapped_column(String(32), default="未提出")  # 承認済み / 確認中 / 差し戻し / 未提出
    current_rev: Mapped[str | None] = mapped_column(String(16))
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


class DocumentVersion(Base, TimestampMixin):
    __tablename__ = "document_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id"), index=True)
    rev: Mapped[str] = mapped_column(String(16))
    file_path: Mapped[str | None] = mapped_column(String(500))
    original_filename: Mapped[str | None] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(Text)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


# ===== 通知 =====
class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)  # None=全体通知
    kind: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"))
    target_url: Mapped[str | None] = mapped_column(String(200))
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    important: Mapped[bool] = mapped_column(Boolean, default=False)


# ===== 資材 =====
class Material(Base, TimestampMixin):
    __tablename__ = "materials"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str | None] = mapped_column(String(64))
    name: Mapped[str] = mapped_column(String(200))
    model_number: Mapped[str | None] = mapped_column(String(160))  # 型番
    manufacturer: Mapped[str | None] = mapped_column(String(160))
    unit: Mapped[str | None] = mapped_column(String(32))  # 台 / 本 / 個 ...


class ProjectMaterial(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "project_materials"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    material_id: Mapped[int] = mapped_column(ForeignKey("materials.id"))
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"))  # 使用工程
    qty_planned: Mapped[float | None] = mapped_column(Numeric(12, 2))
    qty_used: Mapped[float | None] = mapped_column(Numeric(12, 2))
    arrival_planned: Mapped[date | None] = mapped_column(Date)
    arrival_actual: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str | None] = mapped_column(String(32))  # 未入荷 / 入荷済 / 使用中 / 消費済


# ===== 試験記録 =====
class TestRecord(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "test_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"))
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"))
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"))
    test_type: Mapped[str] = mapped_column(String(64))  # 光損失測定 / OTDR / 導通確認 ...
    measured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tester_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    measured_value: Mapped[str | None] = mapped_column(String(64))
    unit: Mapped[str | None] = mapped_column(String(32))
    standard_value: Mapped[str | None] = mapped_column(String(64))
    judge: Mapped[str] = mapped_column(String(16), default="未判定")  # 合格 / 不合格 / 未判定
    instrument: Mapped[str | None] = mapped_column(String(120))
    attachment_path: Mapped[str | None] = mapped_column(String(500))
    comment: Mapped[str | None] = mapped_column(Text)


# ===== 帳票出力履歴 =====
class ReportExport(Base, TimestampMixin):
    __tablename__ = "report_exports"
    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), index=True)
    report_type: Mapped[str] = mapped_column(String(64))
    file_format: Mapped[str] = mapped_column(String(8))  # pdf / xlsx
    file_path: Mapped[str | None] = mapped_column(String(500))
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))


# ===== 監査ログ =====
class AuditLog(Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(32))  # CREATE / UPDATE / DELETE
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str | None] = mapped_column(String(64))
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), index=True)
    before: Mapped[str | None] = mapped_column(Text)
    after: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
