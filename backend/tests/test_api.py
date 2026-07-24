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
