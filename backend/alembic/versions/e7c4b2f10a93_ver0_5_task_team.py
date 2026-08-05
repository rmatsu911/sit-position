"""Ver.0.5 Phase5 2-(2): tasks に担当班（team_id）を追加

Revision ID: e7c4b2f10a93
Revises: d5a91c3e07b2
Create Date: 2026-08-05

工程表の「担当班」列は、これまで保存先が無く常に空欄（—）だった。
班は要員マスタ（teams）に実在するので、工程に紐づけて正データとして持つ。

- team_id : 担当班。責任者（manager_id）や担当会社（company_id）とは独立して
  割り当てられる。nullable（班を決めていない工程を無理に埋めない）。

既存行は NULL のまま（未設定であることを、そのまま未設定として扱う）。
データの書き換え・削除は行わない。
"""
from alembic import op
import sqlalchemy as sa

revision = "e7c4b2f10a93"
down_revision = "d5a91c3e07b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("team_id", sa.Integer(), nullable=True))
    op.create_foreign_key("tasks_team_id_fkey", "tasks", "teams", ["team_id"], ["id"])
    op.create_index("ix_tasks_team_id", "tasks", ["team_id"])


def downgrade() -> None:
    op.drop_index("ix_tasks_team_id", table_name="tasks")
    op.drop_constraint("tasks_team_id_fkey", "tasks", type_="foreignkey")
    op.drop_column("tasks", "team_id")
