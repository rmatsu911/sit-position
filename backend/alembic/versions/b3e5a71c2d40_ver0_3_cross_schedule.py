"""Ver.0.3 Phase2: 横断工程表（tasks.company_id 追加 / saved_searches 新設）

Revision ID: b3e5a71c2d40
Revises: a1c7d3f90b21
Create Date: 2026-07-31

- tasks.company_id : 工程の担当会社（協力会社を含む）。担当者の所属会社とは
  独立して割り当てられるため、users.company_id からの導出ではなく列を持つ。
- saved_searches   : ユーザーごとの保存検索条件。端末を変えても再利用できるよう
  localStorage ではなく DB に保持する。
"""
from alembic import op
import sqlalchemy as sa

revision = "b3e5a71c2d40"
down_revision = "a1c7d3f90b21"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("company_id", sa.Integer(), nullable=True))
    op.create_foreign_key("tasks_company_id_fkey", "tasks", "companies", ["company_id"], ["id"])
    op.create_index("ix_tasks_company_id", "tasks", ["company_id"])

    op.create_table(
        "saved_searches",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("screen", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("conditions", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_saved_searches_user_id", "saved_searches", ["user_id"])
    op.create_index("ix_saved_searches_screen", "saved_searches", ["screen"])


def downgrade() -> None:
    op.drop_index("ix_saved_searches_screen", table_name="saved_searches")
    op.drop_index("ix_saved_searches_user_id", table_name="saved_searches")
    op.drop_table("saved_searches")
    op.drop_index("ix_tasks_company_id", table_name="tasks")
    op.drop_constraint("tasks_company_id_fkey", "tasks", type_="foreignkey")
    op.drop_column("tasks", "company_id")
