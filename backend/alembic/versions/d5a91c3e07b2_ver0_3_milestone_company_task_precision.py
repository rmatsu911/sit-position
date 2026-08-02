"""Ver.0.3 Phase3 P3-1補足: milestones に担当会社・関連工程・入力粒度を追加

Revision ID: d5a91c3e07b2
Revises: c4f2a86b1e73
Create Date: 2026-08-01

c4f2a86b1e73 は push 済みのため書き換えず、補足として列を足す。

- company_id        : 担当会社。responsible_id の所属会社から導出せず、
  担当者とは独立して設定できる正データとして持つ。
  絞り込み・表示・出力で使う。
- related_task_id   : 関連工程。工程詳細への移動、日程矛盾の検知、
  案件工程・横断工程との連携に使う。同じ案件の工程だけを指せる
  （同一 project_id・論理削除済みでない・権限内であることの検証はAPI側）。
  nullable。関連付けが無い場合に工程との関係を推測しない。
- schedule_precision: 入力粒度（day / half_day）。日時が正であり、この列は
  粒度の判定だけに使う。AM/PM専用の列は追加しない。
  day = その日 00:00(JST) / half_day = 午前 00:00・午後 12:00(JST)。
  既存レコードは day として移行する。
"""
from alembic import op
import sqlalchemy as sa

revision = "d5a91c3e07b2"
down_revision = "c4f2a86b1e73"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("milestones", sa.Column("company_id", sa.Integer(), nullable=True))
    op.create_foreign_key("milestones_company_id_fkey", "milestones", "companies", ["company_id"], ["id"])
    op.create_index("ix_milestones_company_id", "milestones", ["company_id"])

    op.add_column("milestones", sa.Column("related_task_id", sa.Integer(), nullable=True))
    op.create_foreign_key("milestones_related_task_id_fkey", "milestones", "tasks", ["related_task_id"], ["id"])
    op.create_index("ix_milestones_related_task_id", "milestones", ["related_task_id"])

    op.add_column(
        "milestones",
        sa.Column("schedule_precision", sa.String(length=16), nullable=False, server_default="day"),
    )
    # 既存レコードは day（その日 00:00）として移行する。
    # 日時そのものは触らない（00:00 のまま = day の意味と一致するため）。
    op.execute("UPDATE milestones SET schedule_precision = 'day' WHERE schedule_precision IS NULL")


def downgrade() -> None:
    op.drop_column("milestones", "schedule_precision")
    op.drop_index("ix_milestones_related_task_id", table_name="milestones")
    op.drop_constraint("milestones_related_task_id_fkey", "milestones", type_="foreignkey")
    op.drop_column("milestones", "related_task_id")
    op.drop_index("ix_milestones_company_id", table_name="milestones")
    op.drop_constraint("milestones_company_id_fkey", "milestones", type_="foreignkey")
    op.drop_column("milestones", "company_id")
