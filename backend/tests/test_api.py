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
