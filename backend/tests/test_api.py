from tests.conftest import token


def test_health(client):
    assert client.get("/health").json()["status"] == "ok"


def test_login_and_me(client):
    t = token(client, "admin@test.jp")
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {t}"})
    assert me.status_code == 200
    assert me.json()["role"] == "ADMIN"


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"email": "admin@test.jp", "password": "x"})
    assert r.status_code == 401


def test_projects_requires_auth(client):
    assert client.get("/api/projects").status_code == 401


def test_admin_sees_all_projects(client):
    t = token(client, "admin@test.jp")
    r = client.get("/api/projects", headers={"Authorization": f"Bearer {t}"})
    assert r.status_code == 200
    assert len(r.json()) == 2


def test_partner_scope_limited(client):
    t = token(client, "partner@test.jp")
    r = client.get("/api/projects", headers={"Authorization": f"Bearer {t}"})
    codes = [p["construction_number"] for p in r.json()]
    assert codes == ["T-001"]  # 割当案件のみ


def test_partner_cannot_access_other_project(client):
    t = token(client, "partner@test.jp")
    r = client.get("/api/projects/2", headers={"Authorization": f"Bearer {t}"})
    assert r.status_code == 403


def test_partner_cannot_create_project(client):
    t = token(client, "partner@test.jp")
    r = client.post(
        "/api/projects",
        headers={"Authorization": f"Bearer {t}"},
        json={"construction_number": "X-999", "name": "不可"},
    )
    assert r.status_code == 403


def test_pm_can_create_and_audit(client):
    t = token(client, "pm@test.jp")
    r = client.post(
        "/api/projects",
        headers={"Authorization": f"Bearer {t}"},
        json={"construction_number": "T-100", "name": "新規案件", "customer": "顧客", "status": "未着工"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["construction_number"] == "T-100"


def test_duplicate_construction_number(client):
    t = token(client, "pm@test.jp")
    body = {"construction_number": "T-001", "name": "重複"}
    r = client.post("/api/projects", headers={"Authorization": f"Bearer {t}"}, json=body)
    assert r.status_code == 409


def test_project_create_list_detail_update_reload_flow(client):
    """登録→一覧→詳細→編集→再取得を同じ永続DB経路で保証する。"""
    t = token(client, "pm@test.jp")
    headers = {"Authorization": f"Bearer {t}"}
    created = client.post(
        "/api/projects",
        headers=headers,
        json={
            "construction_number": "KM-2026-E2E",
            "name": "熊本東エリア 光ケーブル更改工事",
            "customer": "株式会社SYSKEN",
            "area": "熊本市東区",
            "status": "未着工",
        },
    )
    assert created.status_code == 201, created.text
    project_id = created.json()["id"]

    listed = client.get("/api/projects", headers=headers)
    assert listed.status_code == 200
    assert any(row["id"] == project_id for row in listed.json())

    detail = client.get(f"/api/projects/{project_id}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["name"] == "熊本東エリア 光ケーブル更改工事"

    updated = client.put(
        f"/api/projects/{project_id}",
        headers=headers,
        json={"name": "熊本東エリア 光ケーブル更改工事（更新）", "status": "施工中"},
    )
    assert updated.status_code == 200, updated.text

    reloaded = client.get(f"/api/projects/{project_id}", headers=headers)
    assert reloaded.json()["name"].endswith("（更新）")
    assert reloaded.json()["status"] == "施工中"


def test_task_wbs_crud_dependencies_and_reload(client):
    t = token(client, "pm@test.jp")
    headers = {"Authorization": f"Bearer {t}"}
    project_id = 1
    parent = client.post(
        f"/api/projects/{project_id}/tasks",
        headers=headers,
        json={"wbs_code": "90", "name": "E2E親工程", "status": "未着手"},
    )
    assert parent.status_code == 201, parent.text
    parent_id = parent.json()["id"]
    child = client.post(
        f"/api/projects/{project_id}/tasks",
        headers=headers,
        json={
            "parent_task_id": parent_id,
            "wbs_code": "90.1",
            "name": "E2E子工程",
            "planned_start_at": "2026-08-01T00:00:00+09:00",
            "planned_finish_at": "2026-08-02T23:59:59+09:00",
            "planned_workers": 3,
            "dependency_ids": [parent_id],
        },
    )
    assert child.status_code == 201, child.text
    child_id = child.json()["id"]
    assert child.json()["dependencies"] == [parent_id]

    updated = client.put(
        f"/api/tasks/{child_id}",
        headers=headers,
        json={"actual_progress": 60, "actual_workers": 2, "status": "施工中", "change_reason": "E2E"},
    )
    assert updated.status_code == 200, updated.text

    reloaded = client.get(f"/api/projects/{project_id}/tasks", headers=headers)
    row = next(item for item in reloaded.json() if item["id"] == child_id)
    assert row["actual_progress"] == 60
    assert row["actual_workers"] == 2
    assert row["dependencies"] == [parent_id]

    deleted = client.delete(f"/api/tasks/{child_id}", headers=headers)
    assert deleted.status_code == 204
    assert all(item["id"] != child_id for item in client.get(f"/api/projects/{project_id}/tasks", headers=headers).json())


# --- 日時ヘルパー -------------------------------------------------------------
# 本番は PostgreSQL(timestamptz) でタイムゾーン付き、テストは SQLite で
# タイムゾーンを保持できず「JSTの壁時計」がそのまま naive で返る。
# どちらでも同じ意味を検証できるよう、JSTの壁時計(naive)へ正規化する。
def _jst_wall(iso: str):
    from datetime import datetime, timedelta, timezone

    d = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if d.tzinfo is None:
        return d
    return d.astimezone(timezone(timedelta(hours=9))).replace(tzinfo=None)


def test_half_day_task_roundtrip(client):
    """0.5日(午前/午後)の工程を登録し、再取得しても同じ日時・粒度で返ること。

    期間は [開始, 終了) の半開区間。午前 = 00:00-12:00 / 午後 = 12:00-翌0:00。
    """
    t = token(client, "pm@test.jp")
    headers = {"Authorization": f"Bearer {t}"}
    project_id = 1

    # 午前のみ（0.5日）
    am = client.post(
        f"/api/projects/{project_id}/tasks",
        headers=headers,
        json={
            "wbs_code": "95", "name": "半日工程（午前）",
            "planned_start_at": "2026-06-01T00:00:00+09:00",
            "planned_finish_at": "2026-06-01T12:00:00+09:00",
            "schedule_precision": "half_day",
        },
    )
    assert am.status_code == 201, am.text
    am_id = am.json()["id"]
    assert am.json()["schedule_precision"] == "half_day"

    # 午後開始〜翌日午前終了（1日）
    pm = client.post(
        f"/api/projects/{project_id}/tasks",
        headers=headers,
        json={
            "wbs_code": "96", "name": "半日工程（午後〜翌午前）",
            "planned_start_at": "2026-06-01T12:00:00+09:00",
            "planned_finish_at": "2026-06-02T12:00:00+09:00",
            "schedule_precision": "half_day",
        },
    )
    assert pm.status_code == 201, pm.text

    # 再取得しても同じ値（9時間ずれが起きない）
    rows = client.get(f"/api/projects/{project_id}/tasks", headers=headers).json()
    by_wbs = {r["wbs_code"]: r for r in rows}
    from datetime import timedelta

    a = by_wbs["95"]
    s = _jst_wall(a["planned_start_at"])
    e = _jst_wall(a["planned_finish_at"])
    assert (s.hour, e.hour) == (0, 12), f"午前工程の時刻が想定外: {s} .. {e}"
    assert (e - s) == timedelta(hours=12)  # 0.5日
    assert a["schedule_precision"] == "half_day"

    b = by_wbs["96"]
    s2 = _jst_wall(b["planned_start_at"])
    e2 = _jst_wall(b["planned_finish_at"])
    assert (s2.hour, e2.hour) == (12, 12), f"午後〜翌午前の時刻が想定外: {s2} .. {e2}"
    assert (e2 - s2) == timedelta(days=1)  # 1日

    # 日単位へ変更（区分を持たない工程へ戻せる）
    upd = client.put(
        f"/api/tasks/{am_id}",
        headers=headers,
        json={
            "planned_start_at": "2026-06-01T00:00:00+09:00",
            "planned_finish_at": "2026-06-02T00:00:00+09:00",
            "schedule_precision": "day",
            "change_reason": "日単位へ変更",
        },
    )
    assert upd.status_code == 200, upd.text
    assert upd.json()["schedule_precision"] == "day"
    s3 = _jst_wall(upd.json()["planned_start_at"])
    e3 = _jst_wall(upd.json()["planned_finish_at"])
    assert (e3 - s3) == timedelta(days=1)


def test_day_precision_is_default_and_not_half_day(client):
    """粒度を指定せずに作った工程は日単位（day）になり、半日として解釈されないこと。

    既存データ（Seed）の 09:00 プレースホルダは migration で
    00:00〜翌00:00 の日単位へ正規化済み。ここではAPIの既定動作を検証する。
    """
    t = token(client, "pm@test.jp")
    headers = {"Authorization": f"Bearer {t}"}
    from datetime import timedelta

    created = client.post(
        "/api/projects/1/tasks",
        headers=headers,
        json={
            "wbs_code": "97", "name": "日単位工程",
            "planned_start_at": "2026-06-01T00:00:00+09:00",
            "planned_finish_at": "2026-06-04T00:00:00+09:00",
            # schedule_precision を送らない（既定値の確認）
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["schedule_precision"] == "day", "粒度未指定なら day になること"

    s0 = _jst_wall(body["planned_start_at"])
    e0 = _jst_wall(body["planned_finish_at"])
    assert (s0.hour, s0.minute) == (0, 0), f"開始が 00:00 でない: {s0}"
    assert (e0.hour, e0.minute) == (0, 0), f"終了が 00:00 でない: {e0}"
    span = e0 - s0
    assert span == timedelta(days=3), f"3日間にならない: {span}"
    # 日単位の工程は 12:00 境界を持たない（＝半日として描画されない）
    assert span % timedelta(days=1) == timedelta(0)
