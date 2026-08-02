"""Ver.0.3 Phase1: tasks.schedule_precision 追加＋既存工程の日時を日単位へ正規化

Revision ID: a1c7d3f90b21
Revises: 5aeaba61edcb
Create Date: 2026-07-31

背景:
  工程の日時(planned_*/actual_*)を「開始=inclusive / 終了=exclusive」の
  Asia/Tokyo 基準へ統一し、0.5日(午前・午後)単位の工程を扱えるようにする。

  既存データは日付＋09:00 のプレースホルダ時刻で入っており、そのままでは
  「午前(00:00-12:00)の工程」と誤解釈されてしまう。既存工程はすべて
  日単位として扱うため、次のとおり正規化する。

    planned_start_at  -> その日の 00:00 (JST)
    planned_finish_at -> 終了日の翌日 00:00 (JST) ＝ exclusive
    actual_start_at   -> その日の 00:00 (JST)
    actual_finish_at  -> 終了日の翌日 00:00 (JST) ＝ exclusive

  これにより表示上の期間（何日間か）は変わらない。
  schedule_precision は入力・表示の粒度判定にのみ使い、日時とは二重管理しない。
"""
from alembic import op
import sqlalchemy as sa

revision = "a1c7d3f90b21"
down_revision = "5aeaba61edcb"
branch_labels = None
depends_on = None

# JSTの日の 00:00 へ丸める / 翌日 00:00 にする SQL 断片
_JST = "Asia/Tokyo"


def upgrade() -> None:
    op.add_column(
        "tasks",
        sa.Column("schedule_precision", sa.String(length=16), nullable=False, server_default="day"),
    )
    # 既存工程は日単位として日時を正規化（終了は exclusive = 翌日0時）
    op.execute(
        f"""
        UPDATE tasks SET
          planned_start_at = CASE WHEN planned_start_at IS NULL THEN NULL ELSE
            (date_trunc('day', planned_start_at AT TIME ZONE '{_JST}')) AT TIME ZONE '{_JST}' END,
          planned_finish_at = CASE WHEN planned_finish_at IS NULL THEN NULL ELSE
            (date_trunc('day', planned_finish_at AT TIME ZONE '{_JST}') + interval '1 day') AT TIME ZONE '{_JST}' END,
          actual_start_at = CASE WHEN actual_start_at IS NULL THEN NULL ELSE
            (date_trunc('day', actual_start_at AT TIME ZONE '{_JST}')) AT TIME ZONE '{_JST}' END,
          actual_finish_at = CASE WHEN actual_finish_at IS NULL THEN NULL ELSE
            (date_trunc('day', actual_finish_at AT TIME ZONE '{_JST}') + interval '1 day') AT TIME ZONE '{_JST}' END
        """
    )


def downgrade() -> None:
    # 終了日時を inclusive（終了日の 00:00）へ戻す。開始日時はそのまま。
    op.execute(
        f"""
        UPDATE tasks SET
          planned_finish_at = CASE WHEN planned_finish_at IS NULL THEN NULL ELSE
            (date_trunc('day', planned_finish_at AT TIME ZONE '{_JST}') - interval '1 day') AT TIME ZONE '{_JST}' END,
          actual_finish_at = CASE WHEN actual_finish_at IS NULL THEN NULL ELSE
            (date_trunc('day', actual_finish_at AT TIME ZONE '{_JST}') - interval '1 day') AT TIME ZONE '{_JST}' END
        """
    )
    op.drop_column("tasks", "schedule_precision")
