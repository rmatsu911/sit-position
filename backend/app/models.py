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


class DailyReportTask(Base, TimestampMixin):
    __tablename__ = "daily_report_tasks"
    id: Mapped[int] = mapped_column(primary_key=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("daily_reports.id"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))


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
