"""Ver.0.3 Phase3: 横断マイルストーン（milestone_types / milestones 新設）

Revision ID: c4f2a86b1e73
Revises: b3e5a71c2d40
Create Date: 2026-08-01

これまでマイルストーンは工程名の文字列一致（name == '引き渡し'）で暫定判定して
いたため、区分を増やせず案件横断で比較もできなかった。区分マスタと実レコードを
持たせ、工程(tasks)とは別のデータとして扱う。

- milestone_types : 区分マスタ（契約・着工・中間検査・完成検査・引き渡し・完工）。
  他のマスタと同じ code/name/sort_order/active。
- milestones      : 案件の重要日。工程が期間 [開始, 終了) を持つのに対し、
  マイルストーンは「その日」を指す一点。日時は工程と同じく Asia/Tokyo の
  その日 00:00 として保存する。遅延は planned_at と actual_at の確定計算で
  求めるため、状態としては持たない。
"""
from alembic import op
import sqlalchemy as sa

revision = "c4f2a86b1e73"
down_revision = "b3e5a71c2d40"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "milestone_types",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "milestones",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("project_id", sa.Integer(), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("milestone_type_id", sa.Integer(), sa.ForeignKey("milestone_types.id"), nullable=True),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("planned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("actual_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="予定"),
        sa.Column("responsible_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("delete_reason", sa.Text(), nullable=True),
    )
    op.create_index("ix_milestones_project_id", "milestones", ["project_id"])
    op.create_index("ix_milestones_milestone_type_id", "milestones", ["milestone_type_id"])
    op.create_index("ix_milestones_responsible_id", "milestones", ["responsible_id"])


def downgrade() -> None:
    op.drop_index("ix_milestones_responsible_id", table_name="milestones")
    op.drop_index("ix_milestones_milestone_type_id", table_name="milestones")
    op.drop_index("ix_milestones_project_id", table_name="milestones")
    op.drop_table("milestones")
    op.drop_table("milestone_types")
