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


# --- Ver.0.3 Phase 3 (P3-2補足): CRUD と Excel/PDF 出力 ---------------------
def _auth(client, email):
    return {"Authorization": f"Bearer {token(client, email)}"}


def test_milestone_crud_lifecycle_and_audit(client):
    """登録→取得→更新→再取得→論理削除と、監査ログの記録。"""
    from app.models import AuditLog, Milestone, MilestoneType
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        mt = MilestoneType(code="crud-種別", name="CRUD種別", sort_order=500)
        s.add(mt)
        s.commit()
        type_id = mt.id

    created = client.post("/api/schedule/milestones", headers=h, json={
        "project_id": 1, "milestone_type_id": type_id, "name": "CRUD対象",
        "planned_at": "2026-09-10T00:00:00+09:00", "schedule_precision": "day", "status": "予定",
    })
    assert created.status_code == 201, created.text
    mid = created.json()["id"]
    assert created.json()["record_kind"] == "milestone"

    got = client.get(f"/api/schedule/milestones/{mid}", headers=h)
    assert got.status_code == 200 and got.json()["name"] == "CRUD対象"

    updated = client.put(f"/api/schedule/milestones/{mid}", headers=h, json={
        "name": "CRUD対象（更新後）", "status": "完了",
        "actual_at": "2026-09-12T00:00:00+09:00", "change_reason": "テスト更新",
    })
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["name"] == "CRUD対象（更新後）"
    assert body["is_completed"] and body["was_delayed"] and body["delay_days"] == 2

    again = client.get(f"/api/schedule/milestones/{mid}", headers=h).json()
    assert again["name"] == "CRUD対象（更新後）" and again["status"] == "完了"

    assert client.delete(f"/api/schedule/milestones/{mid}?reason=テスト削除", headers=h).status_code == 204
    assert client.get(f"/api/schedule/milestones/{mid}", headers=h).status_code == 404

    with TestingSessionLocal() as s:
        row = s.get(Milestone, mid)
        assert row is not None, "物理削除ではなく論理削除であること"
        assert row.deleted_at is not None and row.delete_reason == "テスト削除"
        actions = {a.action for a in s.query(AuditLog).filter_by(entity_type="milestone",
                                                                 entity_id=str(mid)).all()}
        assert {"CREATE", "UPDATE", "DELETE"} <= actions, f"監査ログが足りない: {actions}"

    # 一覧からも消える
    assert all(m["id"] != mid for m in _ms_get(client, "pm@test.jp", "include_candidates=false&limit=5000")["milestones"])


def test_milestone_create_from_candidate_removes_it(client):
    """未設定候補から登録すると、その候補が消えること。"""
    from app.models import MilestoneType
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        mt = MilestoneType(code="cand-登録元", name="候補から登録", sort_order=510)
        s.add(mt)
        s.commit()
        type_id = mt.id

    before = _ms_get(client, "pm@test.jp", "project_ids=1&limit=5000")
    assert any(c["milestone_type_id"] == type_id for c in before["candidates"])

    h = _auth(client, "pm@test.jp")
    r = client.post("/api/schedule/milestones", headers=h, json={
        "project_id": 1, "milestone_type_id": type_id, "name": "候補から作成",
        "planned_at": "2026-10-01T00:00:00+09:00",
    })
    assert r.status_code == 201, r.text
    # 候補は実レコードではないため、予定日・状態・担当者は入力値だけが入る
    assert r.json()["responsible_id"] is None and r.json()["company_id"] is None

    after = _ms_get(client, "pm@test.jp", "project_ids=1&limit=5000")
    assert all(c["milestone_type_id"] != type_id for c in after["candidates"])
    assert after["candidate_count"] == before["candidate_count"] - 1
    assert after["registered_count"] == before["registered_count"] + 1


def test_milestone_crud_reference_validation(client):
    """存在しない/削除済み/別案件は422、スコープ外は403で拒否すること。"""
    from datetime import datetime, timezone as _tz

    from app.models import MilestoneType, Task
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        mt = MilestoneType(code="ref-種別", name="参照検証", sort_order=520)
        inactive = MilestoneType(code="ref-非active", name="無効な区分", sort_order=521, active=False)
        t_other = Task(project_id=2, wbs_code="ref-2", name="別案件の工程")
        t_gone = Task(project_id=1, wbs_code="ref-del", name="削除済み工程")
        s.add_all([mt, inactive, t_other, t_gone])
        s.flush()
        t_gone.deleted_at = datetime.now(_tz.utc)
        s.commit()
        type_id, inactive_id, other_task, gone_task = mt.id, inactive.id, t_other.id, t_gone.id

    base = {"project_id": 1, "milestone_type_id": type_id, "name": "参照検証",
            "planned_at": "2026-09-10T00:00:00+09:00"}

    # 存在しない参照 → 422
    for field, value in [("milestone_type_id", 999999), ("responsible_id", 999999),
                         ("company_id", 999999), ("related_task_id", 999999)]:
        r = client.post("/api/schedule/milestones", headers=h, json={**base, field: value})
        assert r.status_code == 422, f"{field}: {r.status_code}"
    # 別案件の工程 → 422 / 削除済みの工程 → 422
    assert client.post("/api/schedule/milestones", headers=h,
                       json={**base, "related_task_id": other_task}).status_code == 422
    assert client.post("/api/schedule/milestones", headers=h,
                       json={**base, "related_task_id": gone_task}).status_code == 422
    # 非active の区分は新規登録に使えない
    assert client.post("/api/schedule/milestones", headers=h,
                       json={**base, "milestone_type_id": inactive_id}).status_code == 422
    # 存在しない案件 → 422
    assert client.post("/api/schedule/milestones", headers=h,
                       json={**base, "project_id": 999999}).status_code == 422
    # スコープ外の案件 → 403（協力会社ユーザーは案件1のみ）
    hp = _auth(client, "partner@test.jp")
    assert client.post("/api/schedule/milestones", headers=hp,
                       json={**base, "project_id": 2}).status_code in (403, 404)

    # 更新でも同じ検証が効く
    ok = client.post("/api/schedule/milestones", headers=h, json=base)
    assert ok.status_code == 201
    mid = ok.json()["id"]
    assert client.put(f"/api/schedule/milestones/{mid}", headers=h,
                      json={"related_task_id": other_task}).status_code == 422
    assert client.put(f"/api/schedule/milestones/{mid}", headers=h,
                      json={"related_task_id": gone_task}).status_code == 422
    # 既存レコードは非activeの区分でも更新できる（履歴を壊さない）
    with TestingSessionLocal() as s:
        s.get(__import__("app.models", fromlist=["Milestone"]).Milestone, mid).milestone_type_id = inactive_id
        s.commit()
    assert client.get(f"/api/schedule/milestones/{mid}", headers=h).status_code == 200
    assert client.put(f"/api/schedule/milestones/{mid}", headers=h,
                      json={"name": "非active区分のまま更新"}).status_code == 200


def test_milestone_update_cannot_change_project(client):
    """更新で案件を無断で変更できないこと。"""
    from app.models import MilestoneType
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        mt = MilestoneType(code="proj-固定", name="案件固定", sort_order=530)
        s.add(mt)
        s.commit()
        type_id = mt.id

    mid = client.post("/api/schedule/milestones", headers=h, json={
        "project_id": 1, "milestone_type_id": type_id, "name": "案件は変えない",
        "planned_at": "2026-09-10T00:00:00+09:00"}).json()["id"]

    # project_id は MilestoneUpdate に無いため、送っても無視される
    r = client.put(f"/api/schedule/milestones/{mid}", headers=h, json={"project_id": 2, "name": "変更後"})
    assert r.status_code == 200
    assert r.json()["project_id"] == 1, "案件が変わってしまった"


def test_milestone_crud_precision_roundtrip_via_api(client):
    """API経由で day / half_day 午前・午後が往復し、9時間ずれないこと。"""
    from app.models import MilestoneType
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        mt = MilestoneType(code="prec-api", name="粒度API", sort_order=540)
        s.add(mt)
        s.commit()
        type_id = mt.id

    cases = [
        ("day", "2026-09-10T00:00:00+09:00", 0, "2026-09-10"),
        ("half_day", "2026-09-11T00:00:00+09:00", 0, "2026-09-11"),
        ("half_day", "2026-09-12T12:00:00+09:00", 12, "2026-09-12"),
    ]
    for precision, planned, hour, day in cases:
        r = client.post("/api/schedule/milestones", headers=h, json={
            "project_id": 1, "milestone_type_id": type_id, "name": f"{precision}-{hour}",
            "planned_at": planned, "schedule_precision": precision})
        assert r.status_code == 201, r.text
        got = client.get(f"/api/schedule/milestones/{r.json()['id']}", headers=h).json()
        assert got["schedule_precision"] == precision
        w = _jst_wall(got["planned_at"])
        assert w.hour == hour, f"{precision}/{hour}: {got['planned_at']}"
        assert w.strftime("%Y-%m-%d") == day, f"9時間ずれ: {got['planned_at']}"


def test_milestone_roles_can_write(client):
    """作成・更新・削除の可否がロールで分かれること。"""
    from app.core.security import hash_password
    from app.models import MilestoneType, User
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        mt = MilestoneType(code="role-種別", name="権限確認", sort_order=550)
        s.add(mt)
        for email, role in [("qm2@test.jp", "QUALITY_MANAGER"), ("viewer2@test.jp", "VIEWER")]:
            if s.query(User).filter_by(email=email).one_or_none() is None:
                s.add(User(email=email, hashed_password=hash_password("pass"), name=role, role=role))
        s.commit()
        type_id = mt.id

    body = {"project_id": 1, "milestone_type_id": type_id, "name": "権限確認",
            "planned_at": "2026-09-10T00:00:00+09:00"}

    # 作成できる（ADMIN は require_roles を常に通る）
    for email in ("admin@test.jp", "pm@test.jp"):
        r = client.post("/api/schedule/milestones", headers=_auth(client, email), json=body)
        assert r.status_code == 201, f"{email}: {r.text}"
        mid = r.json()["id"]
        assert client.put(f"/api/schedule/milestones/{mid}", headers=_auth(client, email),
                          json={"name": "更新"}).status_code == 200
        assert client.delete(f"/api/schedule/milestones/{mid}", headers=_auth(client, email)).status_code == 204

    # 参照専用のロールは書き込めない
    for email in ("qm2@test.jp", "viewer2@test.jp", "partner@test.jp"):
        assert client.post("/api/schedule/milestones", headers=_auth(client, email),
                           json=body).status_code == 403, email


def test_milestone_export_matches_screen(client):
    """Excel/PDF が画面と同じ条件・同じ件数で生成され、スコープが効くこと。"""
    h = _auth(client, "admin@test.jp")
    qs = "actual=missing&include_candidates=true&limit=5000"
    screen = _ms_get(client, "admin@test.jp", qs)

    for fmt in ("xlsx", "pdf"):
        r = client.get(f"/api/schedule/milestones/export?format={fmt}&{qs}", headers=h)
        assert r.status_code == 200, r.text
        assert len(r.content) > 500
        assert "attachment;" in r.headers["content-disposition"]

    # 出力は collect() を通すので、同じ条件なら件数が一致する
    from app.api.milestones import MilestoneFilters, collect
    from app.models import User as U
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        admin = s.query(U).filter_by(email="admin@test.jp").one()
        partner = s.query(U).filter_by(email="partner@test.jp").one()
        f = MilestoneFilters(actual="missing", include_candidates=True, limit=5000)
        same = collect(s, admin, f)
        assert same.registered_count == screen["registered_count"]
        assert same.candidate_count == screen["candidate_count"]
        assert [m.id for m in same.milestones] == [m["id"] for m in screen["milestones"]], "並び順も一致"

        # 出力にも案件スコープが効く
        scoped = collect(s, partner, MilestoneFilters(include_candidates=True, limit=5000))
        assert {m.project_id for m in scoped.milestones} == {1}
        assert all(c.project_id == 1 for c in scoped.candidates)


def test_milestone_multiple_records_same_project_and_type(client):
    """同一案件・同一区分が複数件あっても1件に潰れないこと。"""
    from app.models import MilestoneType
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        mt = MilestoneType(code="dup-種別", name="重複可能な区分", sort_order=560)
        s.add(mt)
        s.commit()
        type_id = mt.id

    ids = []
    for i, day in enumerate(("2026-09-20", "2026-09-21")):
        r = client.post("/api/schedule/milestones", headers=h, json={
            "project_id": 1, "milestone_type_id": type_id, "name": f"同一区分{i + 1}",
            "planned_at": f"{day}T00:00:00+09:00"})
        assert r.status_code == 201, r.text
        ids.append(r.json()["id"])

    data = _ms_get(client, "pm@test.jp", f"milestone_type_ids={type_id}&project_ids=1&limit=5000")
    got = [m for m in data["milestones"] if m["id"] in ids]
    assert len(got) == 2, "同一案件・同一区分の複数件が欠落した"
    assert data["registered_count"] >= 2
    # 登録済みがあるので、その区分は候補に出ない
    assert all(c["milestone_type_id"] != type_id for c in data["candidates"])


# --- Ver.0.3 Phase 3 (P3-4): 表示名依存の判定を milestones へ置き換え ---------
def test_task_named_delivery_is_not_a_milestone(client):
    """「引き渡し」という名前の通常工程は、マイルストーンとして扱われないこと。

    工程名の文字列一致（name == '引き渡し'）をやめ、milestones を正データにした
    ことの確認。工程はあくまで tasks 側にだけ存在する。
    """
    from datetime import datetime, timezone as _tz

    from app.models import Task
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        task = Task(project_id=1, wbs_code="P34.1", name="引き渡し", status="未着手",
                    planned_start_at=datetime(2026, 9, 1, tzinfo=_tz.utc),
                    planned_finish_at=datetime(2026, 9, 2, tzinfo=_tz.utc))
        s.add(task)
        s.commit()
        task_id = task.id

    data = _ms_get(client, "pm@test.jp", "project_ids=1&limit=5000")
    # 工程はマイルストーン一覧に現れない（IDが衝突しても別物として扱われる）
    assert all(m["record_kind"] == "milestone" for m in data["milestones"])
    assert not any(m["name"] == "引き渡し" and m["related_task_id"] is None
                   and m["milestone_type_id"] is None for m in data["milestones"])

    # 工程一覧側では通常の工程として返る（バー表示に必要な期間を持つ）
    r = client.get("/api/projects/1/tasks", headers=h)
    assert r.status_code == 200
    hit = [t for t in r.json() if t["id"] == task_id]
    assert len(hit) == 1
    assert hit[0]["planned_start_at"] and hit[0]["planned_finish_at"]


def test_task_named_delivery_can_be_moved(client):
    """「引き渡し」という名前でも、工程の日程変更が名前を理由に拒否されないこと。"""
    from datetime import datetime, timezone as _tz

    from app.models import Task
    from app.services.milestones import as_jst
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        task = Task(project_id=1, wbs_code="P34.2", name="引き渡し", status="未着手",
                    planned_start_at=datetime(2026, 9, 10, tzinfo=_tz.utc),
                    planned_finish_at=datetime(2026, 9, 11, tzinfo=_tz.utc))
        s.add(task)
        s.commit()
        task_id = task.id

    r = client.put(f"/api/tasks/{task_id}", headers=h, json={
        "name": "引き渡し",
        "planned_start_at": "2026-09-12T00:00:00+09:00",
        "planned_finish_at": "2026-09-13T00:00:00+09:00",
        "change_reason": "P3-4 ドラッグ相当の日程変更",
    })
    assert r.status_code == 200, r.text
    # 保存後の値を JST へ直して確認する（テストDBは naive、本番は timezone 付き）
    moved = as_jst(datetime.fromisoformat(r.json()["planned_start_at"]))
    assert (moved.year, moved.month, moved.day, moved.hour) == (2026, 9, 12, 0)


def test_milestone_kind_survives_rename(client):
    """マイルストーン名を変えても、種別と record_kind が変わらないこと。"""
    from app.models import MilestoneType
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        mt = MilestoneType(code="p34-rename", name="立会検査", sort_order=610)
        s.add(mt)
        s.commit()
        type_id = mt.id

    created = client.post("/api/schedule/milestones", headers=h, json={
        "project_id": 1, "milestone_type_id": type_id, "name": "立会検査（初回）",
        "planned_at": "2026-10-01T00:00:00+09:00"})
    assert created.status_code == 201, created.text
    ms_id = created.json()["id"]

    renamed = client.put(f"/api/schedule/milestones/{ms_id}", headers=h,
                         json={"name": "まったく違う名前"})
    assert renamed.status_code == 200, renamed.text
    body = renamed.json()
    assert body["record_kind"] == "milestone"
    assert body["milestone_type_id"] == type_id
    assert body["milestone_type"] == "立会検査"

    data = _ms_get(client, "pm@test.jp", f"milestone_type_ids={type_id}&limit=5000")
    got = [m for m in data["milestones"] if m["id"] == ms_id]
    assert len(got) == 1 and got[0]["milestone_type_id"] == type_id


def test_milestone_candidates_are_never_returned_as_records(client):
    """未設定候補が実マイルストーンとして返らないこと（描画の取り違えを防ぐ）。"""
    data = _ms_get(client, "pm@test.jp", "limit=5000")
    assert all(m["record_kind"] == "milestone" for m in data["milestones"])
    assert all(c["record_kind"] == "candidate" for c in data["candidates"])
    # 候補は実在IDも日付も持たない
    for c in data["candidates"]:
        assert "id" not in c and "planned_at" not in c and "actual_at" not in c
    # 件数は登録済みと候補で別々に数える
    assert data["registered_count"] == len(data["milestones"])
    assert data["candidate_count"] == len(data["candidates"])


def test_milestone_soft_deleted_is_not_drawn(client):
    """論理削除したマイルストーンが一覧に出ないこと。"""
    from app.models import MilestoneType
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        mt = MilestoneType(code="p34-deleted", name="削除確認", sort_order=620)
        s.add(mt)
        s.commit()
        type_id = mt.id

    created = client.post("/api/schedule/milestones", headers=h, json={
        "project_id": 1, "milestone_type_id": type_id, "name": "消える予定",
        "planned_at": "2026-10-05T00:00:00+09:00"})
    ms_id = created.json()["id"]
    assert any(m["id"] == ms_id for m in _ms_get(client, "pm@test.jp", "limit=5000")["milestones"])

    assert client.delete(f"/api/schedule/milestones/{ms_id}", headers=h).status_code == 204
    after = _ms_get(client, "pm@test.jp", "limit=5000")
    assert all(m["id"] != ms_id for m in after["milestones"])


def test_milestone_inactive_type_is_kept_as_history(client):
    """非activeの区分を参照する既存レコードも、履歴として区分名つきで返ること。"""
    from app.models import MilestoneType
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        mt = MilestoneType(code="p34-inactive", name="廃止された区分", sort_order=630)
        s.add(mt)
        s.commit()
        type_id = mt.id

    created = client.post("/api/schedule/milestones", headers=h, json={
        "project_id": 1, "milestone_type_id": type_id, "name": "廃止区分の履歴",
        "planned_at": "2026-10-08T00:00:00+09:00"})
    assert created.status_code == 201, created.text
    ms_id = created.json()["id"]

    with TestingSessionLocal() as s:
        s.query(MilestoneType).filter_by(id=type_id).one().active = False
        s.commit()

    data = _ms_get(client, "pm@test.jp", "limit=5000")
    hit = [m for m in data["milestones"] if m["id"] == ms_id]
    assert len(hit) == 1, "非active区分の既存レコードが消えた"
    assert hit[0]["milestone_type_id"] == type_id
    assert hit[0]["milestone_type"] == "廃止された区分"
    # 非active区分は新規登録の候補には出さない
    assert all(c["milestone_type_id"] != type_id for c in data["candidates"])


def test_milestone_same_name_different_id_are_separated(client):
    """同名でIDが異なるマイルストーンを取り違えないこと。"""
    from app.models import MilestoneType
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        for code, order in (("p34-same-a", 640), ("p34-same-b", 641)):
            if s.query(MilestoneType).filter_by(code=code).one_or_none() is None:
                s.add(MilestoneType(code=code, name="同じ区分名", sort_order=order))
        s.commit()
        ids = [t.id for t in s.query(MilestoneType)
               .filter(MilestoneType.code.in_(["p34-same-a", "p34-same-b"])).all()]

    made = []
    for type_id in ids:
        r = client.post("/api/schedule/milestones", headers=h, json={
            "project_id": 1, "milestone_type_id": type_id, "name": "同じ名前",
            "planned_at": "2026-10-12T00:00:00+09:00"})
        assert r.status_code == 201, r.text
        made.append((r.json()["id"], type_id))

    data = _ms_get(client, "pm@test.jp", "limit=5000")
    by_id = {m["id"]: m for m in data["milestones"]}
    for ms_id, type_id in made:
        assert by_id[ms_id]["milestone_type_id"] == type_id, "同名の区分がIDで分離されていない"
    assert len({i for i, _ in made}) == 2


def test_milestone_plan_and_actual_are_separate_values(client):
    """予定日と実績日が同日でも、それぞれ別の値として返ること。"""
    from datetime import datetime

    from app.models import MilestoneType
    from app.services.milestones import as_jst
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        mt = MilestoneType(code="p34-both", name="予実同日", sort_order=650)
        s.add(mt)
        s.commit()
        type_id = mt.id

    r = client.post("/api/schedule/milestones", headers=h, json={
        "project_id": 1, "milestone_type_id": type_id, "name": "同日の予実",
        "schedule_precision": "half_day",
        "planned_at": "2026-10-15T00:00:00+09:00",   # 午前
        "actual_at": "2026-10-15T12:00:00+09:00"})   # 午後
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["planned_at"] != body["actual_at"]
    assert as_jst(datetime.fromisoformat(body["planned_at"])).hour == 0
    assert as_jst(datetime.fromisoformat(body["actual_at"])).hour == 12
    assert body["is_completed"] is True


def test_project_schedule_scope_excludes_other_projects(client):
    """案件工程で使う project_id 指定に、別案件のマイルストーンが混ざらないこと。"""
    from app.models import MilestoneType
    from tests.conftest import TestingSessionLocal

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        mt = MilestoneType(code="p34-scope", name="スコープ確認", sort_order=660)
        s.add(mt)
        s.commit()
        type_id = mt.id
    for pid in (1, 2):
        assert client.post("/api/schedule/milestones", headers=h, json={
            "project_id": pid, "milestone_type_id": type_id, "name": f"案件{pid}の重要日",
            "planned_at": "2026-10-20T00:00:00+09:00"}).status_code == 201

    only1 = _ms_get(client, "pm@test.jp", "project_id=1&limit=5000")
    assert {m["project_id"] for m in only1["milestones"]} == {1}
    assert all(c["project_id"] == 1 for c in only1["candidates"])


def test_milestone_query_count_does_not_grow_with_rows(client):
    """行数が増えてもSQL発行回数が増えないこと（行ごと取得をしていない）。"""
    from sqlalchemy import event

    from app.models import MilestoneType
    from tests.conftest import TestingSessionLocal, engine

    h = _auth(client, "pm@test.jp")
    with TestingSessionLocal() as s:
        mt = MilestoneType(code="p34-n1", name="N+1確認", sort_order=670)
        s.add(mt)
        s.commit()
        type_id = mt.id

    def count_queries(qs: str) -> int:
        seen = []
        listener = lambda *a, **k: seen.append(1)  # noqa: E731
        event.listen(engine, "before_cursor_execute", listener)
        try:
            _ms_get(client, "pm@test.jp", qs)
        finally:
            event.remove(engine, "before_cursor_execute", listener)
        return len(seen)

    base = count_queries(f"milestone_type_ids={type_id}&limit=5000")
    for i in range(12):
        assert client.post("/api/schedule/milestones", headers=h, json={
            "project_id": 1, "milestone_type_id": type_id, "name": f"N+1確認{i}",
            "planned_at": "2026-10-25T00:00:00+09:00"}).status_code == 201
    after = count_queries(f"milestone_type_ids={type_id}&limit=5000")
    assert after == base, f"件数に比例してSQLが増えた（{base} → {after}）"


# --- Ver.0.3 Phase 3 (P3-5): カレンダーの共通イベントAPI ---------------------
def _cal(client, email, qs=""):
    t = token(client, email)
    r = client.get(f"/api/schedule/calendar/events?{qs}", headers={"Authorization": f"Bearer {t}"})
    assert r.status_code == 200, r.text
    return r.json()


def _cal_fixture(session):
    """5種別すべての元データを1日ぶん用意する（カレンダー専用テーブルは作らない）。"""
    from datetime import date as _date, datetime as _dt

    from app.models import DailyReport, Milestone, MilestoneType, QualityCheck, Task, TestRecord
    from app.services.milestones import JST, milestone_at

    mt = session.query(MilestoneType).filter_by(code="p35-cal").one_or_none()
    if mt is None:
        mt = MilestoneType(code="p35-cal", name="カレンダー確認", sort_order=700)
        session.add(mt)
        session.flush()
    # 日時はすべて JST で組み立てる（Phase 1 と同じ意味論）
    task = Task(project_id=1, wbs_code="P35.1", name="カレンダー工程", status="施工中",
                planned_start_at=_dt(2026, 11, 10, tzinfo=JST),
                planned_finish_at=_dt(2026, 11, 12, tzinfo=JST),   # exclusive（11/11まで）
                actual_start_at=_dt(2026, 11, 10, tzinfo=JST))
    ms = Milestone(project_id=1, milestone_type_id=mt.id, name="カレンダー重要日",
                   planned_at=milestone_at("2026-11-10", "half_day", "PM"),  # JST 12:00
                   status="予定", schedule_precision="half_day")
    qc = QualityCheck(project_id=1, inspect_item="カレンダー品質確認", status="確認待ち",
                      due_date=_date(2026, 11, 10))
    dr = DailyReport(project_id=1, report_date=_date(2026, 11, 10), status="DRAFT",
                     place="カレンダー現場")
    tr = TestRecord(project_id=1, test_type="カレンダー試験", judge="未判定",
                    measured_at=_dt(2026, 11, 10, 10, 30, tzinfo=JST))
    session.add_all([task, ms, qc, dr, tr])
    session.commit()
    return {"task": task.id, "milestone": ms.id, "quality_check": qc.id,
            "daily_report": dr.id, "test_record": tr.id, "type_id": mt.id}


def test_calendar_integrates_all_real_sources(client):
    """実在する5種別だけを共通形式へ変換して返すこと。"""
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        ids = _cal_fixture(s)

    data = _cal(client, "pm@test.jp", "date_from=2026-11-10&date_to=2026-11-10&project_ids=1")
    kinds = {(e["source_kind"], e["record_kind"]) for e in data["events"]}
    assert ("task", "plan") in kinds and ("task", "actual") in kinds
    assert ("milestone", "plan") in kinds
    assert ("quality_check", "due") in kinds
    assert ("daily_report", "actual") in kinds
    assert ("test_record", "actual") in kinds

    by_kind = {e["source_kind"]: e for e in data["events"]}
    # 元レコードへ戻れること
    assert by_kind["task"]["source_url"] == "/projects/1/schedule"
    assert by_kind["milestone"]["source_url"].startswith("/projects/1/schedule/milestones?types=")
    assert by_kind["quality_check"]["source_url"] == "/quality"
    assert by_kind["daily_report"]["source_url"] == "/daily-report"
    # 元IDを保持している
    assert by_kind["quality_check"]["source_id"] == ids["quality_check"]
    assert data["total"] == data["displayed"] and data["truncated"] is False


def test_calendar_event_id_never_collides_across_tables(client):
    """別テーブルの同じ数値IDを1件に取り違えないこと。"""
    data = _cal(client, "pm@test.jp", "date_from=2026-01-01&date_to=2026-12-31&limit=5000")
    assert len({e["event_id"] for e in data["events"]}) == len(data["events"])
    for e in data["events"]:
        assert e["event_id"] == f"{e['source_kind']}:{e['record_kind']}:{e['source_id']}"
    # 数値IDだけなら重複しうる組み合わせが、実際に別イベントとして残っている
    numeric = [(e["source_id"], e["source_kind"]) for e in data["events"]]
    dup_ids = {i for i, _ in numeric if sum(1 for j, _ in numeric if j == i) > 1}
    assert dup_ids, "同じ数値IDを持つ別種別のデータが無く、この確認が成立していない"


def test_calendar_jst_day_boundary(client):
    """JSTの日付境界でずれないこと（9時間ずれの検出）。"""
    from datetime import datetime

    from app.services.milestones import as_jst
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        ids = _cal_fixture(s)

    # JST 11/10 の1日だけを指定して、その日のイベントが取れる
    same = _cal(client, "pm@test.jp", "date_from=2026-11-10&date_to=2026-11-10&project_ids=1")
    assert any(e["source_id"] == ids["milestone"] and e["source_kind"] == "milestone"
               for e in same["events"])
    # 前日を指定すると入らない（UTC基準で判定していれば混入する）
    before = _cal(client, "pm@test.jp", "date_from=2026-11-09&date_to=2026-11-09&project_ids=1")
    assert not any(e["source_kind"] == "milestone" and e["source_id"] == ids["milestone"]
                   for e in before["events"])
    # half_day の午後は JST 12:00 のまま返る
    ms = [e for e in same["events"] if e["source_kind"] == "milestone"][0]
    assert as_jst(datetime.fromisoformat(ms["start_at"])).hour == 12
    assert ms["schedule_precision"] == "half_day"


def test_calendar_range_is_half_open(client):
    """期間は Phase 1 と同じ [開始, 終了)。終了日は「その日を含む」指定。"""
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        ids = _cal_fixture(s)

    # 工程の予定は JST 11/10 00:00 〜 11/12 00:00（＝11/11 まで）
    inside = _cal(client, "pm@test.jp", "date_from=2026-11-11&date_to=2026-11-11&project_ids=1&source_kinds=task")
    assert any(e["source_id"] == ids["task"] and e["record_kind"] == "plan" for e in inside["events"])
    outside = _cal(client, "pm@test.jp", "date_from=2026-11-12&date_to=2026-11-12&project_ids=1&source_kinds=task")
    assert not any(e["source_id"] == ids["task"] and e["record_kind"] == "plan"
                   for e in outside["events"]), "終了日時（exclusive）の当日を含めてしまっている"


def test_calendar_excludes_deleted_and_out_of_scope(client):
    """論理削除済み・案件スコープ外を返さないこと。"""
    from datetime import datetime, timezone as _tz

    from app.models import Milestone
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        ids = _cal_fixture(s)

    qs = "date_from=2026-11-10&date_to=2026-11-10"
    assert any(e["source_kind"] == "milestone" and e["source_id"] == ids["milestone"]
               for e in _cal(client, "pm@test.jp", qs)["events"])

    with TestingSessionLocal() as s:
        row = s.get(Milestone, ids["milestone"])
        row.deleted_at = datetime.now(_tz.utc)
        s.commit()
    assert not any(e["source_kind"] == "milestone" and e["source_id"] == ids["milestone"]
                   for e in _cal(client, "pm@test.jp", qs)["events"])

    # 協力会社（割当は案件1のみ）は案件2のイベントを見られない
    partner = _cal(client, "partner@test.jp", "date_from=2026-01-01&date_to=2026-12-31&limit=5000")
    assert {e["project_id"] for e in partner["events"]} <= {1}


def test_calendar_same_day_same_name_not_merged(client):
    """同日・同名でもIDが違えば別イベントとして残ること。"""
    from datetime import date as _date

    from app.models import QualityCheck
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        s.add_all([
            QualityCheck(project_id=1, inspect_item="同名の確認", status="確認待ち",
                         due_date=_date(2026, 11, 20)),
            QualityCheck(project_id=1, inspect_item="同名の確認", status="確認待ち",
                         due_date=_date(2026, 11, 20)),
        ])
        s.commit()

    data = _cal(client, "pm@test.jp", "date_from=2026-11-20&date_to=2026-11-20&project_ids=1")
    same = [e for e in data["events"] if e["title"] == "同名の確認"]
    assert len(same) == 2, "同名の別レコードが1件に潰れた"
    assert same[0]["event_id"] != same[1]["event_id"]


def test_calendar_filters_are_and(client):
    """複合フィルターがANDで効くこと。"""
    from tests.conftest import TestingSessionLocal

    with TestingSessionLocal() as s:
        _cal_fixture(s)

    base = "date_from=2026-11-01&date_to=2026-11-30&project_ids=1"
    only_task = _cal(client, "pm@test.jp", f"{base}&source_kinds=task")
    assert {e["source_kind"] for e in only_task["events"]} == {"task"}

    with_q = _cal(client, "pm@test.jp", f"{base}&source_kinds=task&q=カレンダー")
    assert all("カレンダー" in e["title"] for e in with_q["events"])
    assert len(with_q["events"]) <= len(only_task["events"])

    impossible = _cal(client, "pm@test.jp", f"{base}&source_kinds=task&statuses=存在しない状態")
    assert impossible["events"] == [] and impossible["total"] == 0


def test_calendar_truncates_with_limit(client):
    """上限を超えたら truncated を立て、total と displayed を別に返すこと。"""
    data = _cal(client, "pm@test.jp", "date_from=2026-01-01&date_to=2026-12-31&limit=3")
    assert data["displayed"] == 3
    assert data["total"] > 3
    assert data["truncated"] is True
    assert data["limit"] == 3


def test_calendar_query_count_does_not_grow_with_rows(client):
    """件数が増えてもSQL発行回数が増えないこと（種別ごとに1本）。"""
    from datetime import date as _date

    from sqlalchemy import event

    from app.models import QualityCheck
    from tests.conftest import TestingSessionLocal, engine

    def count_queries(qs: str) -> int:
        seen = []
        listener = lambda *a, **k: seen.append(1)  # noqa: E731
        event.listen(engine, "before_cursor_execute", listener)
        try:
            _cal(client, "pm@test.jp", qs)
        finally:
            event.remove(engine, "before_cursor_execute", listener)
        return len(seen)

    qs = "date_from=2026-12-01&date_to=2026-12-31&project_ids=1&limit=5000"
    base = count_queries(qs)
    with TestingSessionLocal() as s:
        for i in range(15):
            s.add(QualityCheck(project_id=1, inspect_item=f"N+1確認{i}", status="確認待ち",
                               due_date=_date(2026, 12, 10)))
        s.commit()
    after = count_queries(qs)
    assert after == base, f"件数に比例してSQLが増えた（{base} → {after}）"


def test_calendar_options_use_ids(client):
    """選択肢は同名でも区別できるよう id と name の組で返すこと。"""
    t = token(client, "pm@test.jp")
    r = client.get("/api/schedule/calendar/options", headers={"Authorization": f"Bearer {t}"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert {k["key"] for k in body["source_kinds"]} == {
        "task", "milestone", "quality_check", "daily_report", "test_record"}
    for key in ("projects", "responsibles", "companies"):
        assert all("id" in v and "name" in v for v in body[key])


def test_calendar_has_no_dedicated_table(client):
    """カレンダー専用テーブルへ二重保存していないこと。"""
    from app.core.db import Base

    names = set(Base.metadata.tables)
    assert not {n for n in names if "calendar" in n}, "カレンダー専用テーブルを作っている"
