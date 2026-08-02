"""マイルストーンの共通処理（日時の意味論と関連工程の検証）。

日時は工程(tasks)と同じ意味論で扱う:
- Asia/Tokyo
- day       … その日の 00:00
- half_day  … 午前 = 00:00 / 午後 = 12:00
AM/PM を表す専用の列は持たず、日時と `schedule_precision` の2つだけで表す
（日時とフラグの二重管理をしない）。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import accessible_project_ids
from app.models import Task, User

JST = timezone(timedelta(hours=9))

PRECISION_DAY = "day"
PRECISION_HALF_DAY = "half_day"
VALID_PRECISIONS = (PRECISION_DAY, PRECISION_HALF_DAY)

HALF_AM = "AM"
HALF_PM = "PM"


def jst_today() -> datetime:
    """基準日（Asia/Tokyo のその日 00:00）。確定計算の起点に使う。"""
    now = datetime.now(JST)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def as_jst(value: datetime | None) -> datetime | None:
    """タイムゾーンを必ず付けて JST へ揃える。

    本番の PostgreSQL(timestamptz) は tz 付きで返るが、テストの SQLite は
    tz を保持できず JST の壁時計が naive で返る。境界でここに寄せることで、
    UTC 変換を挟んでも表示時に9時間ずれない。
    """
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=JST)
    return value.astimezone(JST)


def milestone_at(date_key: str, precision: str = PRECISION_DAY, half: str = HALF_AM) -> datetime:
    """日付＋粒度（＋区分）から、保存する日時を作る。

    day       … その日 00:00
    half_day  … 午前 00:00 / 午後 12:00
    """
    hour = 12 if (precision == PRECISION_HALF_DAY and half == HALF_PM) else 0
    return datetime.fromisoformat(f"{date_key}T{hour:02d}:00:00+09:00")


def split_milestone_at(value: datetime | None) -> tuple[str | None, str]:
    """保存された日時から、日付と区分（午前/午後）へ戻す。"""
    jst = as_jst(value)
    if jst is None:
        return None, HALF_AM
    return jst.strftime("%Y-%m-%d"), (HALF_PM if jst.hour >= 12 else HALF_AM)


def normalize_precision(value: str | None) -> str:
    """未知の粒度は day として扱う（想定外の値で保存させない）。"""
    return value if value in VALID_PRECISIONS else PRECISION_DAY


def resolve_related_task(db: Session, user: User, project_id: int, task_id: int | None) -> int | None:
    """関連工程の指定を検証して返す。

    - None はそのまま None（関連付けが無い場合に工程との関係を推測しない）
    - 存在しない工程は 422
    - 論理削除済みの工程は 422
    - マイルストーンと project_id が一致しない工程は 422
    - 権限（案件スコープ）の外にある工程は 403
    """
    if task_id is None:
        return None

    task = db.get(Task, task_id)
    if task is None or task.deleted_at is not None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "関連工程が見つかりません")
    if task.project_id != project_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "関連工程は同じ案件の工程を指定してください",
        )

    allowed = accessible_project_ids(db, user)
    if allowed is not None and task.project_id not in allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "この案件へのアクセス権がありません")
    return task.id
