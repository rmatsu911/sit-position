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


# --- Ver.0.3 Phase 2: 横断工程表 ---------------------------------------------
def _cross(client, email: str, qs: str = ""):
    t = token(client, email)
    r = client.get(f"/api/schedule/cross{('?' + qs) if qs else ''}",
                   headers={"Authorization": f"Bearer {t}"})
    assert r.status_code == 200, r.text
    return r.json()


def _make_cross_fixture(client):
    """横断工程表の検証用に、2案件へ工程を作る（担当者・担当会社・未割当を含む）。"""
    t = token(client, "pm@test.jp")
    headers = {"Authorization": f"Bearer {t}"}
    from app.models import Company
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        names = {c.name: c for c in s.query(Company).all()}
        made = []
        # 同名で別レコードの会社を2つ作る（名前ではなくIDで集約できることの確認用）
        for name in ("横断テスト会社A", "横断テスト会社A", "横断テスト会社B"):
            c = Company(name=name, is_partner=True)
            s.add(c); s.flush(); made.append(c.id)
        s.commit()
    company_a1, company_a2, company_b = made
    pm_id = None
    me = client.get("/api/auth/me", headers=headers)
    if me.status_code == 200:
        pm_id = me.json()["id"]

    created = []
    specs = [
        ("cx-1", "横断 親工程", None, "2026-09-01", "2026-09-11", company_a1, pm_id),
        ("cx-1.1", "横断 子工程A", "cx-1", "2026-09-01", "2026-09-06", company_a1, pm_id),
        ("cx-1.2", "横断 子工程B", "cx-1", "2026-09-07", "2026-09-11", company_a2, None),
        ("cx-2", "横断 未割当工程", None, "2026-09-14", "2026-09-16", None, None),
    ]
    parents: dict[str, int] = {}
    for wbs, name, parent, ps, pe, company, manager in specs:
        body = {
            "wbs_code": wbs, "name": name,
            "planned_start_at": f"{ps}T00:00:00+09:00",
            "planned_finish_at": f"{pe}T00:00:00+09:00",
            "company_id": company, "manager_id": manager,
        }
        if parent:
            body["parent_task_id"] = parents[parent]
        r = client.post("/api/projects/2/tasks", headers=headers, json=body)
        assert r.status_code == 201, r.text
        parents[wbs] = r.json()["id"]
        created.append(r.json())
    return {"ids": parents, "company_a1": company_a1, "company_a2": company_a2,
            "company_b": company_b, "manager_id": pm_id}


def test_cross_schedule_groups_by_id_not_name(client):
    """同名の担当会社でも、IDが違えば別グループとして集約されること。"""
    fx = _make_cross_fixture(client)
    a1 = _cross(client, "admin@test.jp", f"company_ids={fx['company_a1']}")
    a2 = _cross(client, "admin@test.jp", f"company_ids={fx['company_a2']}")
    names1 = {t["name"] for t in a1["tasks"] if t["matched"]}
    names2 = {t["name"] for t in a2["tasks"] if t["matched"]}
    assert "横断 子工程A" in names1 and "横断 子工程B" not in names1
    assert "横断 子工程B" in names2 and "横断 子工程A" not in names2
    # 会社名は同じでも別IDとして返る
    assert {t["company"] for t in a1["tasks"] if t["matched"]} == {"横断テスト会社A"}
    assert {t["company"] for t in a2["tasks"] if t["matched"]} == {"横断テスト会社A"}


def test_cross_schedule_keeps_wbs_parent_when_child_matches(client):
    """子工程だけが条件に一致しても、親工程が matched=False で補われること。"""
    fx = _make_cross_fixture(client)
    data = _cross(client, "admin@test.jp", f"company_ids={fx['company_a2']}")
    by_name = {t["name"]: t for t in data["tasks"]}
    assert by_name["横断 子工程B"]["matched"] is True
    assert "横断 親工程" in by_name, "WBSの親工程が補われていない"
    assert by_name["横断 親工程"]["matched"] is False
    assert data["total"] == sum(1 for t in data["tasks"] if t["matched"])


def test_cross_schedule_includes_unassigned(client):
    """未割当の工程を除外せず、未割当のみの絞り込みもできること。"""
    _make_cross_fixture(client)
    allrows = _cross(client, "admin@test.jp")
    assert any(t["manager_id"] is None and t["company_id"] is None for t in allrows["tasks"])

    only = _cross(client, "admin@test.jp", "unassigned_only=true")
    matched = [t for t in only["tasks"] if t["matched"]]
    assert matched, "未割当のみの結果が空"
    assert all(t["manager_id"] is None or t["company_id"] is None for t in matched)


def test_cross_schedule_applies_project_scope(client):
    """案件スコープ外の工程はAPIが返さない（UIの出し分けに依存しない）。"""
    _make_cross_fixture(client)
    partner = _cross(client, "partner@test.jp")
    assert partner["tasks"], "割当案件の工程が取得できない"
    assert {t["project_id"] for t in partner["tasks"]} == {1}

    # フィルタでスコープ外の案件を指定しても返らない
    filtered = _cross(client, "partner@test.jp", "project_ids=2")
    assert filtered["total"] == 0
    assert filtered["tasks"] == []

    # 単一案件表示でもAPI側で拒否する
    t = token(client, "partner@test.jp")
    r = client.get("/api/schedule/cross?project_id=2", headers={"Authorization": f"Bearer {t}"})
    assert r.status_code == 403


def test_cross_schedule_options_are_scoped(client):
    """絞り込みの選択肢も権限と案件スコープの範囲だけを返すこと。"""
    _make_cross_fixture(client)
    t = token(client, "partner@test.jp")
    r = client.get("/api/schedule/cross/options", headers={"Authorization": f"Bearer {t}"})
    assert r.status_code == 200, r.text
    o = r.json()
    assert [p["construction_number"] for p in o["projects"]] == ["T-001"]


def test_cross_schedule_half_day_roundtrip(client):
    """0.5日の工程が横断工程表でも 12:00 境界のまま返ること（9時間ずれ防止）。"""
    from datetime import timedelta

    t = token(client, "pm@test.jp")
    headers = {"Authorization": f"Bearer {t}"}
    r = client.post("/api/projects/2/tasks", headers=headers, json={
        "wbs_code": "cx-9", "name": "横断 半日工程",
        "planned_start_at": "2026-09-21T12:00:00+09:00",
        "planned_finish_at": "2026-09-22T00:00:00+09:00",
        "schedule_precision": "half_day",
    })
    assert r.status_code == 201, r.text

    data = _cross(client, "admin@test.jp", "q=横断 半日工程")
    row = next(x for x in data["tasks"] if x["name"] == "横断 半日工程")
    s = _jst_wall(row["planned_start_at"])
    e = _jst_wall(row["planned_finish_at"])
    assert (s.hour, e.hour) == (12, 0)
    assert (e - s) == timedelta(hours=12)
    assert row["schedule_precision"] == "half_day"


def test_cross_schedule_detections_are_not_ai(client):
    """システム検知は確定計算のみ。AI予測の語や信頼度を含まないこと。"""
    _make_cross_fixture(client)
    data = _cross(client, "admin@test.jp")
    kinds = {d["kind"] for d in data["detections"]}
    assert "unassigned" in kinds
    for d in data["detections"]:
        assert "AI" not in d["label"] and "AI" not in d["message"]
        assert "confidence" not in d
        assert d["task_ids"], "検知に対象工程が無い"


def test_cross_schedule_range_is_derived_from_tasks(client):
    """表示期間は固定日付ではなく、対象工程の実期間から返ること。"""
    _make_cross_fixture(client)
    data = _cross(client, "admin@test.jp", "q=横断 未割当工程")
    row = next(x for x in data["tasks"] if x["matched"])
    assert _jst_wall(data["range_from"]) == _jst_wall(row["planned_start_at"])
    assert _jst_wall(data["range_to"]) == _jst_wall(row["planned_finish_at"])


def test_cross_schedule_export_reflects_filters(client):
    """Excel/PDF 出力が現在の絞り込み条件で生成され、スコープも適用されること。"""
    _make_cross_fixture(client)
    t = token(client, "admin@test.jp")
    headers = {"Authorization": f"Bearer {t}"}
    for fmt in ("xlsx", "pdf"):
        r = client.get(f"/api/schedule/cross/export?format={fmt}&unassigned_only=true", headers=headers)
        assert r.status_code == 200, r.text
        assert len(r.content) > 500
        assert "attachment;" in r.headers["content-disposition"]

    tp = token(client, "partner@test.jp")
    r = client.get("/api/schedule/cross/export?format=xlsx&project_ids=2",
                   headers={"Authorization": f"Bearer {tp}"})
    assert r.status_code == 200  # 生成はできるが中身はスコープ内のみ


def test_saved_search_is_stored_per_user(client):
    """保存検索条件はDBに保存され、他ユーザーからは見えないこと。"""
    ta = {"Authorization": f"Bearer {token(client, 'admin@test.jp')}"}
    tp = {"Authorization": f"Bearer {token(client, 'partner@test.jp')}"}
    conditions = {"delayed_only": True, "statuses": ["遅延"], "scale": "week"}
    created = client.post("/api/schedule/saved-searches", headers=ta,
                          json={"screen": "cross_schedule", "name": "遅延のみ", "conditions": conditions})
    assert created.status_code == 201, created.text
    sid = created.json()["id"]
    assert created.json()["conditions"] == conditions

    assert any(r["id"] == sid for r in client.get("/api/schedule/saved-searches", headers=ta).json())
    assert all(r["id"] != sid for r in client.get("/api/schedule/saved-searches", headers=tp).json())
    assert client.delete(f"/api/schedule/saved-searches/{sid}", headers=tp).status_code == 404
    assert client.delete(f"/api/schedule/saved-searches/{sid}", headers=ta).status_code == 204


def test_cross_schedule_update_uses_ids(client):
    """担当者・担当会社の変更が既存の工程更新APIでID指定のまま保存されること。"""
    fx = _make_cross_fixture(client)
    task_id = fx["ids"]["cx-2"]
    headers = {"Authorization": f"Bearer {token(client, 'pm@test.jp')}"}
    r = client.put(f"/api/tasks/{task_id}", headers=headers,
                   json={"company_id": fx["company_b"], "change_reason": "担当会社変更"})
    assert r.status_code == 200, r.text
    assert r.json()["company_id"] == fx["company_b"]
    assert r.json()["company"] == "横断テスト会社B"

    # 権限が無いユーザーはAPI側で拒否される
    denied = client.put(f"/api/tasks/{task_id}",
                        headers={"Authorization": f"Bearer {token(client, 'partner@test.jp')}"},
                        json={"actual_progress": 50})
    assert denied.status_code == 403
