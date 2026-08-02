"""検証用の一時アカウントを作る／消す。

シードには VIEWER の利用者がいないため、5権限すべてを実ブラウザで確認するには
検証中だけ VIEWER を用意する必要がある。検証が終わったら必ず消して、
業務データ側に検証用のダミーを残さない。

  backend/.venv/bin/python scripts/verify-fixtures.py viewer-add
  backend/.venv/bin/python scripts/verify-fixtures.py viewer-remove
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.core.db import SessionLocal  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models import AuditLog, User  # noqa: E402

EMAIL = os.environ.get("E2E_VIEWER_EMAIL", "verify.viewer@example.co.jp")
PASSWORD = os.environ.get("E2E_PASSWORD", "Passw0rd!")


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.email == EMAIL).one_or_none()
        if command == "viewer-add":
            if existing is None:
                db.add(User(email=EMAIL, name="検証用 閲覧者", role="VIEWER",
                            hashed_password=hash_password(PASSWORD), is_active=True))
                db.commit()
                print(f"created {EMAIL} (VIEWER)")
            else:
                print(f"exists {EMAIL} (VIEWER)")
        elif command == "viewer-remove":
            if existing is not None:
                # 検証中の操作で残った監査ログも一緒に消す（この利用者は検証専用）
                logs = db.query(AuditLog).filter(AuditLog.user_id == existing.id).delete()
                db.delete(existing)
                db.commit()
                print(f"removed {EMAIL} (audit_logs {logs} 件)")
            else:
                print(f"absent {EMAIL}")
        else:
            print(__doc__)
            return 2
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
