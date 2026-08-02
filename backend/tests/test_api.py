from datetime import timedelta

import pytest

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


# --- Ver.0.3 Phase 3 (P3-1): マイルストーンのデータ構造 ---------------------
def test_milestone_is_stored_as_record_not_task_name(client):
    """マイルストーンが工程名の文字列一致ではなく、実レコードとして保持されること。"""
    from app.models import Milestone, MilestoneType, Project
    from tests.conftest import TestingSessionLocal
    from datetime import datetime, timedelta

    with TestingSessionLocal() as s:
        mt = MilestoneType(code="ms-引き渡し", name="引き渡し", sort_order=4)
        s.add(mt)
        s.flush()
        project = s.query(Project).filter_by(construction_number="T-001").one()
        s.add(Milestone(
            project_id=project.id, milestone_type_id=mt.id, name="引き渡し（テスト案件1）",
            planned_at=datetime.fromisoformat("2026-08-10T00:00:00+09:00"),
            actual_at=datetime.fromisoformat("2026-08-13T00:00:00+09:00"),
            status="完了",
        ))
        s.commit()

        row = s.query(Milestone).filter_by(name="引き渡し（テスト案件1）").one()
        assert row.milestone_type_id == mt.id, "区分がIDで紐づくこと（工程名に依存しない）"
        assert row.project_id == project.id
        # 予定・実績はどちらも JST のその日 00:00 として保持する
        assert _jst_wall(row.planned_at.isoformat()).hour == 0
        assert _jst_wall(row.actual_at.isoformat()).hour == 0
        # 遅延は列ではなく確定計算で求める（列を持たないことの確認）
        assert not hasattr(row, "is_delayed")
        delay = _jst_wall(row.actual_at.isoformat()) - _jst_wall(row.planned_at.isoformat())
        assert delay == timedelta(days=3), f"遅れ日数が計算できること: {delay}"


def test_milestone_supports_multiple_types_per_project(client):
    """1案件に複数区分の重要日を持てること（引き渡し以外も扱える）。"""
    from app.models import Milestone, MilestoneType, Project
    from tests.conftest import TestingSessionLocal
    from datetime import datetime

    with TestingSessionLocal() as s:
        project = s.query(Project).filter_by(construction_number="T-002").one()
        made = []
        for i, name in enumerate(["契約", "着工", "中間検査", "完成検査", "完工"]):
            mt = MilestoneType(code=f"ms2-{name}", name=name, sort_order=i)
            s.add(mt)
            s.flush()
            made.append(mt)
            s.add(Milestone(
                project_id=project.id, milestone_type_id=mt.id, name=f"{name}（テスト案件2）",
                planned_at=datetime.fromisoformat(f"2026-09-{10 + i:02d}T00:00:00+09:00"),
                status="予定",
            ))
        s.commit()

        rows = (
            s.query(Milestone)
            .filter(Milestone.project_id == project.id, Milestone.deleted_at.is_(None))
            .all()
        )
        assert len(rows) == 5, "区分ごとに複数の重要日を持てること"
        assert len({r.milestone_type_id for r in rows}) == 5, "区分がそれぞれ別レコードであること"
        # 実績未入力は未入力のまま（固定値で埋めない）
        assert all(r.actual_at is None for r in rows)
        assert all(r.status == "予定" for r in rows)


# --- Ver.0.3 Phase 3 (P3-1補足): 担当会社 / 関連工程 / 入力粒度 ---------------
def _mk_milestone(session, **kw):
    from app.models import Milestone, MilestoneType

    mt = session.query(MilestoneType).first()
    if mt is None:
        mt = MilestoneType(code="ms-sup", name="引き渡し", sort_order=0)
        session.add(mt)
        session.flush()
    base = dict(project_id=1, milestone_type_id=mt.id, name="補足テスト", status="予定")
    base.update(kw)
    row = Milestone(**base)
    session.add(row)
    session.flush()
    return row


def test_milestone_company_is_independent_from_responsible(client):
    """担当会社が担当者の所属からの導出ではなく、独立した正データとして保存・再取得できること。"""
    from app.models import Company, Milestone, User
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        company = Company(name="マイルストーン担当会社", is_partner=True)
        s.add(company)
        s.flush()
        # 担当者には別の所属会社を持たせ、導出されていないことを確かめる
        other = Company(name="担当者の所属会社", is_partner=False)
        s.add(other)
        s.flush()
        user = s.query(User).filter_by(email="pm@test.jp").one()
        user.company_id = other.id
        row = _mk_milestone(s, responsible_id=user.id, company_id=company.id)
        s.commit()
        # セッションを閉じた後に参照しないよう、IDを値として取り出しておく
        mid, company_id, other_id, user_id = row.id, company.id, other.id, user.id

    with TestingSessionLocal() as s:
        got = s.get(Milestone, mid)
        assert got.company_id == company_id, "担当会社がそのまま再取得できること"
        assert got.company_id != other_id, "担当者の所属会社から導出していないこと"
        assert got.responsible_id == user_id


def test_milestone_related_task_roundtrip_and_validation(client):
    """関連工程の保存・再取得と、不正な工程IDを拒否すること。"""
    from fastapi import HTTPException

    from app.models import Milestone, Task, User
    from app.services.milestones import resolve_related_task
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        pm = s.query(User).filter_by(email="pm@test.jp").one()
        partner = s.query(User).filter_by(email="partner@test.jp").one()

        t1 = Task(project_id=1, wbs_code="ms-1", name="案件1の工程")
        t2 = Task(project_id=2, wbs_code="ms-2", name="案件2の工程")
        gone = Task(project_id=1, wbs_code="ms-3", name="削除済み工程")
        s.add_all([t1, t2, gone])
        s.flush()
        from datetime import datetime, timezone as _tz
        gone.deleted_at = datetime.now(_tz.utc)
        s.flush()

        # 同じ案件の工程は通る
        assert resolve_related_task(s, pm, 1, t1.id) == t1.id
        # 関連付けなしは推測せず None のまま
        assert resolve_related_task(s, pm, 1, None) is None

        # 別案件の工程IDは拒否
        with pytest.raises(HTTPException) as e1:
            resolve_related_task(s, pm, 1, t2.id)
        assert e1.value.status_code == 422

        # 存在しない工程IDは拒否
        with pytest.raises(HTTPException) as e2:
            resolve_related_task(s, pm, 1, 999999)
        assert e2.value.status_code == 422

        # 削除済み工程は拒否
        with pytest.raises(HTTPException) as e3:
            resolve_related_task(s, pm, 1, gone.id)
        assert e3.value.status_code == 422

        # 案件スコープ外の工程は拒否（協力会社ユーザーは案件1のみ）
        with pytest.raises(HTTPException) as e4:
            resolve_related_task(s, partner, 2, t2.id)
        assert e4.value.status_code == 403

        row = _mk_milestone(s, related_task_id=t1.id)
        s.commit()
        mid, tid = row.id, t1.id

    with TestingSessionLocal() as s:
        got = s.get(Milestone, mid)
        assert got.related_task_id == tid, "関連工程がそのまま再取得できること"


def test_milestone_precision_roundtrip_keeps_jst(client):
    """day / half_day（午前・午後）が往復し、9時間ずれないこと。"""
    from app.models import Milestone
    from app.services.milestones import (
        milestone_at, normalize_precision, split_milestone_at,
    )
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        day = _mk_milestone(s, planned_at=milestone_at("2026-08-10", "day"), schedule_precision="day")
        am = _mk_milestone(s, planned_at=milestone_at("2026-08-11", "half_day", "AM"),
                           schedule_precision="half_day")
        pm = _mk_milestone(s, planned_at=milestone_at("2026-08-12", "half_day", "PM"),
                           schedule_precision="half_day")
        s.commit()
        ids = (day.id, am.id, pm.id)

    with TestingSessionLocal() as s:
        got_day, got_am, got_pm = (s.get(Milestone, i) for i in ids)

        # day は JST 00:00
        assert _jst_wall(got_day.planned_at.isoformat()).hour == 0
        assert got_day.schedule_precision == "day"
        assert split_milestone_at(got_day.planned_at) == ("2026-08-10", "AM")

        # half_day 午前は JST 00:00
        assert _jst_wall(got_am.planned_at.isoformat()).hour == 0
        assert split_milestone_at(got_am.planned_at) == ("2026-08-11", "AM")

        # half_day 午後は JST 12:00
        assert _jst_wall(got_pm.planned_at.isoformat()).hour == 12, "午後は12:00で保存されること"
        assert split_milestone_at(got_pm.planned_at) == ("2026-08-12", "PM")
        assert got_pm.schedule_precision == "half_day"

        # 日付が前後の日へずれていない（9時間ずれの検出）
        for row, expect in ((got_day, "2026-08-10"), (got_am, "2026-08-11"), (got_pm, "2026-08-12")):
            assert split_milestone_at(row.planned_at)[0] == expect, f"9時間ずれ: {row.planned_at}"

    # 想定外の粒度は day として扱う
    assert normalize_precision(None) == "day"
    assert normalize_precision("time") == "day"
    assert normalize_precision("half_day") == "half_day"


def test_milestone_has_no_am_pm_flag_column(client):
    """AM/PM専用の正データ列を作っていないこと（日時とフラグの二重管理をしない）。"""
    from app.models import Milestone

    names = {c.name for c in Milestone.__table__.columns}
    forbidden = {"half", "half_day", "am_pm", "ampm", "is_pm", "is_afternoon", "period", "half_flag"}
    assert not (names & forbidden), f"AM/PM専用列がある: {names & forbidden}"
    # 粒度は schedule_precision の1列だけで表す
    assert "schedule_precision" in names
    assert {"planned_at", "actual_at", "company_id", "related_task_id"} <= names


# --- Ver.0.3 Phase 3 (P3-2): 横断マイルストーンの集約API ---------------------
def _ms_fixture(session, *, project_id=1, type_name="引き渡し", order=4, **kw):
    """テスト用のマイルストーンを1件作る（種別はIDで紐づける）。"""
    from app.models import Milestone, MilestoneType

    mt = session.query(MilestoneType).filter_by(code=f"p32-{type_name}-{order}").one_or_none()
    if mt is None:
        mt = MilestoneType(code=f"p32-{type_name}-{order}", name=type_name, sort_order=order)
        session.add(mt)
        session.flush()
    base = dict(project_id=project_id, milestone_type_id=mt.id, name=f"{type_name}#{order}",
                status="予定", schedule_precision="day")
    base.update(kw)
    row = Milestone(**base)
    session.add(row)
    session.flush()
    return row, mt


def _ms_get(client, email, qs=""):
    t = token(client, email)
    r = client.get(f"/api/schedule/milestones{('?' + qs) if qs else ''}",
                   headers={"Authorization": f"Bearer {t}"})
    assert r.status_code == 200, r.text
    return r.json()


def test_milestone_api_facts_use_jst_today(client):
    """確定計算が JST の基準日で行われること（当日は期限超過にしない）。"""
    from app.services.milestones import jst_today, milestone_at
    from tests.conftest import TestingSessionLocal

    today = jst_today()
    with TestingSessionLocal() as s:
        past, _ = _ms_fixture(s, order=90, type_name="期限超過",
                              planned_at=milestone_at((today - timedelta(days=5)).strftime("%Y-%m-%d")))
        same, _ = _ms_fixture(s, order=91, type_name="当日",
                              planned_at=milestone_at(today.strftime("%Y-%m-%d")))
        soon, _ = _ms_fixture(s, order=92, type_name="近日",
                              planned_at=milestone_at((today + timedelta(days=3)).strftime("%Y-%m-%d")))
        far, _ = _ms_fixture(s, order=93, type_name="先",
                             planned_at=milestone_at((today + timedelta(days=60)).strftime("%Y-%m-%d")))
        done, _ = _ms_fixture(
            s, order=94, type_name="完了遅れ",
            planned_at=milestone_at((today - timedelta(days=10)).strftime("%Y-%m-%d")),
            actual_at=milestone_at((today - timedelta(days=6)).strftime("%Y-%m-%d")), status="完了")
        s.commit()
        ids = {"past": past.id, "same": same.id, "soon": soon.id, "far": far.id, "done": done.id}

    data = _ms_get(client, "admin@test.jp", "due_soon_days=7&include_candidates=false&limit=5000")
    by_id = {m["id"]: m for m in data["milestones"]}
    assert data["calculated_at"] == today.date().isoformat(), "基準日はサーバー側のJSTの日付"

    p = by_id[ids["past"]]
    assert p["is_overdue"] and p["delay_days"] == 5 and p["remaining_days"] is None
    assert p["actual_missing"] and not p["is_completed"]

    sm = by_id[ids["same"]]
    assert not sm["is_overdue"], "当日は期限超過にしない"
    assert sm["remaining_days"] == 0 and sm["is_due_soon"]

    so = by_id[ids["soon"]]
    assert so["is_due_soon"] and so["remaining_days"] == 3 and so["delay_days"] == 0

    fa = by_id[ids["far"]]
    assert not fa["is_due_soon"] and fa["remaining_days"] == 60

    dn = by_id[ids["done"]]
    assert dn["is_completed"] and dn["was_delayed"] and dn["delay_days"] == 4
    assert not dn["is_overdue"] and dn["remaining_days"] is None
    # DBの status と確定計算を混同しない
    assert dn["status"] == "完了" and "is_delayed" not in dn


def test_milestone_api_filters_are_and_combined(client):
    """複合フィルターがANDで適用されること。"""
    from app.models import Company, User
    from app.services.milestones import jst_today, milestone_at
    from tests.conftest import TestingSessionLocal

    today = jst_today()
    with TestingSessionLocal() as s:
        co = Company(name="MS絞り込み会社", is_partner=True)
        s.add(co)
        s.flush()
        pm = s.query(User).filter_by(email="pm@test.jp").one()
        hit, mt = _ms_fixture(
            s, order=95, type_name="AND対象", name="AND対象マイルストーン",
            planned_at=milestone_at((today + timedelta(days=2)).strftime("%Y-%m-%d")),
            company_id=co.id, responsible_id=pm.id, status="予定")
        # 会社だけ違う（AND なので落ちる）
        _ms_fixture(s, order=95, type_name="AND対象", name="別会社",
                    planned_at=milestone_at((today + timedelta(days=2)).strftime("%Y-%m-%d")),
                    responsible_id=pm.id, status="予定")
        s.commit()
        hit_id, type_id, company_id, user_id = hit.id, mt.id, co.id, pm.id

    qs = (f"milestone_type_ids={type_id}&company_ids={company_id}&responsible_ids={user_id}"
          f"&statuses=予定&actual=missing&due_soon_only=true&q=AND対象"
          f"&include_candidates=false&limit=5000")
    data = _ms_get(client, "admin@test.jp", qs)
    ids = [m["id"] for m in data["milestones"]]
    assert ids == [hit_id], f"AND適用の結果が想定と違う: {ids}"
    assert data["registered_count"] == 1

    # 条件を1つでも外すと一致しない（ANDであることの裏取り）
    other = _ms_get(client, "admin@test.jp", f"company_ids={company_id}&statuses=完了&include_candidates=false")
    assert other["registered_count"] == 0


def test_milestone_api_scope_and_invalid_ids(client):
    """案件スコープの適用と、不正ID・スコープ外IDで検索範囲が広がらないこと。"""
    from app.services.milestones import jst_today, milestone_at
    from tests.conftest import TestingSessionLocal

    today = jst_today()
    with TestingSessionLocal() as s:
        _ms_fixture(s, project_id=1, order=96, type_name="案件1のみ",
                    planned_at=milestone_at(today.strftime("%Y-%m-%d")))
        _ms_fixture(s, project_id=2, order=97, type_name="案件2のみ",
                    planned_at=milestone_at(today.strftime("%Y-%m-%d")))
        s.commit()

    # 協力会社ユーザーは案件1のみ
    partner = _ms_get(client, "partner@test.jp", "include_candidates=false&limit=5000")
    assert {m["project_id"] for m in partner["milestones"]} == {1}

    # スコープ外の案件IDを指定しても範囲は広がらない
    filtered = _ms_get(client, "partner@test.jp", "project_ids=2&include_candidates=false")
    assert filtered["registered_count"] == 0
    assert filtered["milestones"] == []

    # 単一案件表示はAPI側で拒否する
    t = token(client, "partner@test.jp")
    r = client.get("/api/schedule/milestones?project_id=2", headers={"Authorization": f"Bearer {t}"})
    assert r.status_code == 403

    # 存在しないIDを渡しても件数は増えない（無視されるだけ）
    bogus = _ms_get(client, "partner@test.jp", "company_ids=999999&responsible_ids=999999&include_candidates=false")
    assert bogus["registered_count"] == 0

    # 選択肢にもスコープが効く
    opts = client.get("/api/schedule/milestones/options",
                      headers={"Authorization": f"Bearer {t}"}).json()
    assert [p["construction_number"] for p in opts["projects"]] == ["T-001"]


def test_milestone_api_excludes_soft_deleted(client):
    """論理削除したマイルストーンと、削除済み関連工程を返さないこと。"""
    from datetime import datetime, timezone as _tz

    from app.models import Milestone, Task
    from app.services.milestones import jst_today, milestone_at
    from tests.conftest import TestingSessionLocal

    today = jst_today()
    with TestingSessionLocal() as s:
        task = Task(project_id=1, wbs_code="ms-del", name="あとで削除する工程",
                    planned_start_at=milestone_at(today.strftime("%Y-%m-%d")),
                    planned_finish_at=milestone_at((today + timedelta(days=2)).strftime("%Y-%m-%d")))
        s.add(task)
        s.flush()
        alive, _ = _ms_fixture(s, order=98, type_name="生存",
                               planned_at=milestone_at(today.strftime("%Y-%m-%d")),
                               related_task_id=task.id)
        dead, _ = _ms_fixture(s, order=99, type_name="削除済み",
                              planned_at=milestone_at(today.strftime("%Y-%m-%d")))
        dead.deleted_at = datetime.now(_tz.utc)
        s.commit()
        alive_id, dead_id, task_id = alive.id, dead.id, task.id

    data = _ms_get(client, "admin@test.jp", "include_candidates=false&limit=5000")
    ids = {m["id"] for m in data["milestones"]}
    assert alive_id in ids and dead_id not in ids, "論理削除したマイルストーンを除外すること"
    got = next(m for m in data["milestones"] if m["id"] == alive_id)
    assert got["related_task_id"] == task_id and got["related_task_name"] == "あとで削除する工程"

    # 関連工程を論理削除すると、関連工程としては返さない
    with TestingSessionLocal() as s:
        s.get(Task, task_id).deleted_at = datetime.now(_tz.utc)
        s.commit()
    after = _ms_get(client, "admin@test.jp", "include_candidates=false&limit=5000")
    got2 = next(m for m in after["milestones"] if m["id"] == alive_id)
    assert got2["related_task_id"] is None and got2["related_task_name"] is None
    opts = client.get("/api/schedule/milestones/options",
                      headers={"Authorization": f"Bearer {token(client, 'admin@test.jp')}"}).json()
    assert all(t["id"] != task_id for t in opts["related_tasks"]), "削除済み工程を選択肢に出さない"


def test_milestone_api_candidates_are_separated(client):
    """未設定候補が登録済みレコードと別配列で返り、架空の値を持たないこと。"""
    from app.models import MilestoneType
    from app.services.milestones import jst_today, milestone_at
    from tests.conftest import TestingSessionLocal

    today = jst_today()
    with TestingSessionLocal() as s:
        registered = MilestoneType(code="cand-登録済み", name="登録済み種別", sort_order=200)
        missing = MilestoneType(code="cand-未設定", name="未設定種別", sort_order=201)
        inactive = MilestoneType(code="cand-非active", name="非active種別", sort_order=202, active=False)
        s.add_all([registered, missing, inactive])
        s.flush()
        from app.models import Milestone
        s.add(Milestone(project_id=1, milestone_type_id=registered.id, name="登録済み",
                        planned_at=milestone_at(today.strftime("%Y-%m-%d")), status="予定"))
        s.commit()
        reg_id, miss_id, inact_id = registered.id, missing.id, inactive.id

    data = _ms_get(client, "admin@test.jp", "project_ids=1&limit=5000")
    cand_type_ids = {c["milestone_type_id"] for c in data["candidates"]}
    ms_type_ids = {m["milestone_type_id"] for m in data["milestones"]}

    assert reg_id in ms_type_ids, "登録済みは milestones 側に入る"
    assert reg_id not in cand_type_ids, "登録済みを候補にしない（IDで比較）"
    assert miss_id in cand_type_ids, "未登録の active 種別は候補になる"
    assert inact_id not in cand_type_ids, "非active の種別を候補にしない"

    for c in data["candidates"]:
        assert c["record_kind"] == "candidate"
        # 実在するID・架空の予定日・実績日・状態・担当者・担当会社を持たない
        assert "id" not in c and "planned_at" not in c and "actual_at" not in c
        assert "status" not in c and "responsible_id" not in c and "company_id" not in c
    assert data["candidate_count"] == len(data["candidates"])
    assert data["registered_count"] == len(data["milestones"])
    assert data["candidate_count"] != data["registered_count"] or data["candidate_count"] == 0


def test_milestone_api_limit_and_sort_are_stable(client):
    """total / returned_count / truncated と、並び順が安定していること。"""
    first = _ms_get(client, "admin@test.jp", "include_candidates=false&limit=3")
    assert first["returned_count"] == len(first["milestones"]) == 3
    assert first["total"] >= first["returned_count"]
    assert first["truncated"] is (first["total"] > first["returned_count"])
    # 絞り込み前件数と混同しない
    assert first["registered_count"] == first["total"]

    order1 = [m["id"] for m in _ms_get(client, "admin@test.jp", "include_candidates=false&limit=5000")["milestones"]]
    order2 = [m["id"] for m in _ms_get(client, "admin@test.jp", "include_candidates=false&limit=5000")["milestones"]]
    assert order1 == order2, "同じ条件なら常に同じ順序"
    assert order1[:3] == [m["id"] for m in first["milestones"]], "上限をかけても先頭は同じ"


def test_milestone_api_same_name_separated_by_id(client):
    """同名のマイルストーンでもIDで分離されること。"""
    from app.services.milestones import jst_today, milestone_at
    from tests.conftest import TestingSessionLocal

    today = jst_today()
    with TestingSessionLocal() as s:
        a, _ = _ms_fixture(s, project_id=1, order=210, type_name="同名", name="同じ名前の重要日",
                           planned_at=milestone_at(today.strftime("%Y-%m-%d")))
        b, _ = _ms_fixture(s, project_id=2, order=211, type_name="同名", name="同じ名前の重要日",
                           planned_at=milestone_at(today.strftime("%Y-%m-%d")))
        s.commit()
        ids = {a.id, b.id}

    data = _ms_get(client, "admin@test.jp", "q=同じ名前の重要日&include_candidates=false&limit=5000")
    got = [m for m in data["milestones"] if m["id"] in ids]
    assert len(got) == 2, "同名でも別レコードとして返る"
    assert {m["project_id"] for m in got} == {1, 2}
    assert len({m["id"] for m in got}) == 2


def test_milestone_api_precision_and_related_task_project_match(client):
    """day / half_day 午前・午後が返り、関連工程が同じ案件であること。"""
    from app.models import Task
    from app.services.milestones import jst_today, milestone_at
    from tests.conftest import TestingSessionLocal

    today = jst_today()
    key = today.strftime("%Y-%m-%d")
    with TestingSessionLocal() as s:
        task = Task(project_id=1, wbs_code="ms-rel", name="関連工程",
                    planned_start_at=milestone_at(key),
                    planned_finish_at=milestone_at((today + timedelta(days=3)).strftime("%Y-%m-%d")))
        s.add(task)
        s.flush()
        d, _ = _ms_fixture(s, order=220, type_name="日単位", planned_at=milestone_at(key, "day"),
                           schedule_precision="day", related_task_id=task.id)
        am, _ = _ms_fixture(s, order=221, type_name="午前", planned_at=milestone_at(key, "half_day", "AM"),
                            schedule_precision="half_day")
        pm, _ = _ms_fixture(s, order=222, type_name="午後", planned_at=milestone_at(key, "half_day", "PM"),
                            schedule_precision="half_day")
        s.commit()
        ids = (d.id, am.id, pm.id, task.id)

    data = _ms_get(client, "admin@test.jp", "include_candidates=false&limit=5000")
    by_id = {m["id"]: m for m in data["milestones"]}

    assert by_id[ids[0]]["schedule_precision"] == "day"
    assert _jst_wall(by_id[ids[0]]["planned_at"]).hour == 0
    assert by_id[ids[1]]["schedule_precision"] == "half_day"
    assert _jst_wall(by_id[ids[1]]["planned_at"]).hour == 0
    assert by_id[ids[2]]["schedule_precision"] == "half_day"
    assert _jst_wall(by_id[ids[2]]["planned_at"]).hour == 12, "午後は12:00で返ること"
    # 9時間ずれ（日付が前後の日へ動いていない）
    for mid in ids[:3]:
        assert _jst_wall(by_id[mid]["planned_at"]).strftime("%Y-%m-%d") == key

    # 関連工程は同じ案件のもの
    rel = by_id[ids[0]]
    assert rel["related_task_id"] == ids[3]
    assert rel["project_id"] == 1
    # 関連付けが無いものは工程との関係を推測しない
    assert by_id[ids[1]]["related_task_id"] is None
    assert by_id[ids[1]]["related_task_conflict"] is False


def test_milestone_api_has_no_n_plus_one(client):
    """件数を増やしてもSQL発行回数が比例増加しないこと。"""
    from sqlalchemy import event

    from app.services.milestones import jst_today, milestone_at
    from tests.conftest import TestingSessionLocal, engine

    today = jst_today()

    def count_queries(qs: str) -> int:
        statements: list[str] = []

        def before(conn, cursor, statement, params, context, executemany):
            statements.append(statement)

        event.listen(engine, "before_cursor_execute", before)
        try:
            _ms_get(client, "admin@test.jp", qs)
        finally:
            event.remove(engine, "before_cursor_execute", before)
        return len(statements)

    qs = "include_candidates=false&limit=5000"
    before_rows = _ms_get(client, "admin@test.jp", qs)["registered_count"]
    baseline = count_queries(qs)

    # 30件追加しても発行回数は変わらないはず
    with TestingSessionLocal() as s:
        for i in range(30):
            _ms_fixture(s, order=300 + i, type_name=f"N+1確認{i}",
                        planned_at=milestone_at(today.strftime("%Y-%m-%d")))
        s.commit()

    after_rows = _ms_get(client, "admin@test.jp", qs)["registered_count"]
    grown = count_queries(qs)

    assert after_rows >= before_rows + 30, "件数が増えていること"
    assert grown == baseline, f"件数を増やすとSQL発行回数が増えた: {baseline} → {grown}"


def test_milestone_api_applies_all_five_roles(client):
    """5権限それぞれで案件スコープが正しく効くこと。"""
    from app.core.security import hash_password
    from app.models import ProjectMember, User
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        for email, role in [("qm@test.jp", "QUALITY_MANAGER"), ("viewer@test.jp", "VIEWER"),
                            ("fw@test.jp", "FIELD_WORKER")]:
            if s.query(User).filter_by(email=email).one_or_none() is None:
                s.add(User(email=email, hashed_password=hash_password("pass"), name=role, role=role))
        s.flush()
        # FIELD_WORKER は案件2だけに割り当てる
        fw = s.query(User).filter_by(email="fw@test.jp").one()
        if s.query(ProjectMember).filter_by(user_id=fw.id).one_or_none() is None:
            s.add(ProjectMember(project_id=2, user_id=fw.id, role="FIELD_WORKER"))
        s.commit()

    # 内部ロールは全案件を見られる
    for email in ("admin@test.jp", "pm@test.jp", "qm@test.jp", "viewer@test.jp"):
        data = _ms_get(client, email, "include_candidates=false&limit=5000")
        assert {m["project_id"] for m in data["milestones"]} == {1, 2}, f"{email} が全案件を見られない"

    # 協力会社ロールは割当案件だけ
    partner = _ms_get(client, "partner@test.jp", "include_candidates=false&limit=5000")
    assert {m["project_id"] for m in partner["milestones"]} == {1}
    fw_data = _ms_get(client, "fw@test.jp", "include_candidates=false&limit=5000")
    assert {m["project_id"] for m in fw_data["milestones"]} == {2}

    # 件数・選択肢・候補のすべてに同じスコープが効く
    t = token(client, "fw@test.jp")
    opts = client.get("/api/schedule/milestones/options", headers={"Authorization": f"Bearer {t}"}).json()
    assert [p["construction_number"] for p in opts["projects"]] == ["T-002"]
    with_cand = _ms_get(client, "fw@test.jp", "limit=5000")
    assert all(c["project_id"] == 2 for c in with_cand["candidates"])
    summary = client.get("/api/schedule/milestones/summary", headers={"Authorization": f"Bearer {t}"}).json()
    assert summary["registered_count"] == fw_data["registered_count"]


def test_milestone_api_conflict_with_related_task(client):
    """関連工程との日程矛盾を確定計算で検知し、絞り込みできること。"""
    from app.models import Task
    from app.services.milestones import jst_today, milestone_at
    from tests.conftest import TestingSessionLocal

    today = jst_today()
    with TestingSessionLocal() as s:
        task = Task(project_id=1, wbs_code="ms-conf", name="矛盾確認の工程",
                    planned_start_at=milestone_at(today.strftime("%Y-%m-%d")),
                    planned_finish_at=milestone_at((today + timedelta(days=3)).strftime("%Y-%m-%d")))
        s.add(task)
        s.flush()
        inside, _ = _ms_fixture(s, order=400, type_name="期間内",
                                planned_at=milestone_at((today + timedelta(days=1)).strftime("%Y-%m-%d")),
                                related_task_id=task.id)
        outside, _ = _ms_fixture(s, order=401, type_name="期間外",
                                 planned_at=milestone_at((today + timedelta(days=10)).strftime("%Y-%m-%d")),
                                 related_task_id=task.id)
        s.commit()
        inside_id, outside_id = inside.id, outside.id

    data = _ms_get(client, "admin@test.jp", "include_candidates=false&limit=5000")
    by_id = {m["id"]: m for m in data["milestones"]}
    assert by_id[inside_id]["related_task_conflict"] is False
    assert by_id[outside_id]["related_task_conflict"] is True

    only = _ms_get(client, "admin@test.jp", "conflict_only=true&include_candidates=false&limit=5000")
    ids = {m["id"] for m in only["milestones"]}
    assert outside_id in ids and inside_id not in ids
    assert all(m["related_task_conflict"] for m in only["milestones"])
