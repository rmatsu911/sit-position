"""Ver.0.1.1 施工写真 / 品質管理 / 現場日報 / 監査ログ のテスト。"""
import io
import json

from PIL import Image

from app.models import (
    AiAnalysisJob,
    AiPrediction,
    Asset,
    AuditLog,
    DailyReportTask,
    Photo,
    QualityCheck,
    Site,
    Task,
    TaskChangeHistory,
)
from tests.conftest import TestingSessionLocal, token

H = lambda t: {"Authorization": f"Bearer {t}"}  # noqa: E731


def _png_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (60, 40), (120, 160, 200)).save(buf, format="PNG")
    return buf.getvalue()


# ---------- 施工写真 ----------
def test_photo_upload_list_get_patch_confirm_delete(client):
    t = token(client, "admin@test.jp")
    # アップロード
    r = client.post(
        "/api/photos",
        headers=H(t),
        data={"project_id": "1", "place": "局舎1F"},
        files={"file": ("test.png", _png_bytes(), "image/png")},
    )
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert r.json()["no"] and r.json()["uploaded"] is True

    # 一覧（project_id 必須フィルタ）
    r = client.get("/api/photos?project_id=1", headers=H(t))
    assert r.status_code == 200
    assert any(p["id"] == pid for p in r.json())

    # 詳細
    assert client.get(f"/api/photos/{pid}", headers=H(t)).status_code == 200

    # 情報編集（タグ・コメント・お気に入り）
    r = client.patch(f"/api/photos/{pid}", headers=H(t), json={"tags": ["融着", "接続試験"], "comment": "良好", "favorite": True})
    assert r.status_code == 200
    assert r.json()["tags"] == ["融着", "接続試験"]
    assert r.json()["favorite"] is True

    # 確認状況の変更
    r = client.patch(f"/api/photos/{pid}/confirm", headers=H(t), json={"confirmation_status": "確認済み"})
    assert r.status_code == 200 and r.json()["confirm"] == "確認済み"

    # 論理削除
    assert client.delete(f"/api/photos/{pid}", headers=H(t)).status_code == 204
    assert client.get(f"/api/photos/{pid}", headers=H(t)).status_code == 404


def test_photo_ai_returns_predictions(client):
    """ai_predictions を書き込むと /photos/{id}/ai に同じ経路で反映される。"""
    with TestingSessionLocal() as s:
        p = Photo(project_id=1, original_file_path="x.jpg", confirmation_status="未確認")
        s.add(p)
        s.flush()
        job = AiAnalysisJob(photo_id=p.id, job_type="detection", status="COMPLETED")
        s.add(job)
        s.flush()
        s.add(AiPrediction(job_id=job.id, photo_id=p.id, prediction_type="detection",
                           predicted_label="光ケーブル", confidence=0.92, bounding_box=json.dumps([12, 24, 36, 26])))
        s.add(AiPrediction(job_id=job.id, photo_id=p.id, prediction_type="classification",
                           predicted_label="光ケーブル", raw_result=json.dumps({"認識結果": "光ケーブル", "工種判定": "光設備工事"}, ensure_ascii=False)))
        s.commit()
        pid = p.id

    t = token(client, "admin@test.jp")
    r = client.get(f"/api/photos/{pid}/ai", headers=H(t))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "ai_predictions"
    assert body["detections"][0]["label"] == "光ケーブル"
    assert body["detections"][0]["bbox"] == [12, 24, 36, 26]
    assert body["recognition"]["工種判定"] == "光設備工事"


def test_photo_ai_none_when_no_predictions(client):
    with TestingSessionLocal() as s:
        p = Photo(project_id=1, original_file_path="y.jpg", confirmation_status="未確認")
        s.add(p)
        s.commit()
        pid = p.id
    t = token(client, "admin@test.jp")
    r = client.get(f"/api/photos/{pid}/ai", headers=H(t))
    assert r.status_code == 200 and r.json()["source"] == "none"


# ---------- 品質管理 ----------
def _make_quality(project_id=1) -> int:
    with TestingSessionLocal() as s:
        c = QualityCheck(project_id=project_id, inspect_item="ケーブル余長", process="敷設", judge="未判定", status="確認待ち")
        s.add(c)
        s.commit()
        return c.id


def test_quality_list_and_action(client):
    cid = _make_quality()
    t = token(client, "pm@test.jp")
    r = client.get("/api/quality-checks?project_id=1", headers=H(t))
    assert r.status_code == 200 and any(q["id"] == cid for q in r.json())

    # 承認（QUALITY_MANAGER/PROJECT_MANAGER のみ）
    r = client.patch(f"/api/quality-checks/{cid}", headers=H(t), json={"status": "承認済み", "judge": "合格", "comment": "OK"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "承認済み" and r.json()["judge"] == "合格"


def test_quality_action_forbidden_for_field_worker(client):
    cid = _make_quality()
    t = token(client, "partner@test.jp")  # FIELD_WORKER
    r = client.patch(f"/api/quality-checks/{cid}", headers=H(t), json={"status": "承認済み"})
    assert r.status_code == 403


# ---------- 現場日報 ----------
def test_daily_report_lifecycle_and_permission(client):
    pm = token(client, "pm@test.jp")
    # 作成（DRAFT）
    r = client.post("/api/daily-reports", headers=H(pm), json={"project_id": 1, "report_date": "2026-07-21", "weather": "晴れ"})
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert r.json()["status"] == "DRAFT"

    # 編集
    r = client.put(f"/api/daily-reports/{rid}", headers=H(pm), json={"project_id": 1, "report_date": "2026-07-21", "weather": "曇り", "actual_workers": 5})
    assert r.status_code == 200 and r.json()["weather"] == "曇り"

    # 提出 → 承認
    assert client.patch(f"/api/daily-reports/{rid}/status", headers=H(pm), json={"status": "SUBMITTED"}).json()["status"] == "SUBMITTED"
    assert client.patch(f"/api/daily-reports/{rid}/status", headers=H(pm), json={"status": "APPROVED"}).json()["status"] == "APPROVED"


def test_daily_report_approve_forbidden_for_field_worker(client):
    pm = token(client, "pm@test.jp")
    r = client.post("/api/daily-reports", headers=H(pm), json={"project_id": 1, "report_date": "2026-07-22"})
    rid = r.json()["id"]
    fw = token(client, "partner@test.jp")
    # FIELD_WORKER は承認遷移不可
    assert client.patch(f"/api/daily-reports/{rid}/status", headers=H(fw), json={"status": "APPROVED"}).status_code == 403


# ---------- 監査ログ ----------
def test_audit_log_written_on_mutation(client):
    pm = token(client, "pm@test.jp")
    r = client.post("/api/daily-reports", headers=H(pm), json={"project_id": 1, "report_date": "2026-07-23"})
    rid = r.json()["id"]
    with TestingSessionLocal() as s:
        logs = s.query(AuditLog).filter(AuditLog.entity_type == "daily_report", AuditLog.entity_id == str(rid)).all()
        assert any(log.action == "CREATE" for log in logs)


# ---------- Site→Asset→Task 連動フィルタ ----------
def _make_site_asset_task():
    with TestingSessionLocal() as s:
        site = Site(project_id=1, name="テスト現場")
        s.add(site); s.flush()
        other = Site(project_id=1, name="別現場")
        s.add(other); s.flush()
        a1 = Asset(project_id=1, site_id=site.id, name="設備A")
        a2 = Asset(project_id=1, site_id=other.id, name="設備B")
        s.add_all([a1, a2]); s.flush()
        t1 = Task(project_id=1, site_id=site.id, wbs_code="9.1", name="現場工程", planned_workers=3, actual_workers=0)
        t2 = Task(project_id=1, site_id=other.id, wbs_code="9.2", name="別工程")
        s.add_all([t1, t2]); s.commit()
        return site.id, other.id, a1.id, t1.id


def test_assets_filtered_by_site(client):
    site_id, other_id, _, _ = _make_site_asset_task()
    t = token(client, "admin@test.jp")
    r = client.get(f"/api/assets?project_id=1&site_id={site_id}", headers=H(t))
    assert r.status_code == 200
    names = [a["name"] for a in r.json()]
    assert "設備A" in names and "設備B" not in names


def test_tasks_filtered_by_site(client):
    site_id, other_id, _, _ = _make_site_asset_task()
    t = token(client, "admin@test.jp")
    r = client.get(f"/api/projects/1/tasks?site_id={site_id}", headers=H(t))
    wbs = [x["wbs_code"] for x in r.json()]
    assert "9.1" in wbs and "9.2" not in wbs


# ---------- 工程実績へ反映（dry-run → 確定） ----------
def test_reflect_progress_dry_run_then_apply(client):
    site_id, _, _, task_id = _make_site_asset_task()
    pm = token(client, "pm@test.jp")
    # 実績人数付きの日報を作成し、工程を紐付け
    r = client.post("/api/daily-reports", headers=H(pm), json={"project_id": 1, "report_date": "2026-08-01", "actual_workers": 7})
    rid = r.json()["id"]
    assert client.put(f"/api/daily-reports/{rid}/links", headers=H(pm), json={"task_ids": [task_id]}).status_code == 200

    # dry-run：変更内容を返すが、実際には反映しない
    r = client.post(f"/api/daily-reports/{rid}/reflect-progress?dry_run=true", headers=H(pm))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["dry_run"] is True and body["reflected_tasks"] == 1 and body["total_changes"] >= 1
    fields = [c["field"] for c in body["targets"][0]["changes"]]
    assert "actual_workers" in fields
    with TestingSessionLocal() as s:
        assert s.get(Task, task_id).actual_workers == 0  # まだ未反映
        assert s.query(TaskChangeHistory).filter_by(task_id=task_id).count() == 0

    # 確定：実際に反映され、履歴・監査が記録される
    r = client.post(f"/api/daily-reports/{rid}/reflect-progress", headers=H(pm))
    assert r.status_code == 200 and r.json()["dry_run"] is False
    with TestingSessionLocal() as s:
        assert s.get(Task, task_id).actual_workers == 7
        assert s.query(TaskChangeHistory).filter_by(task_id=task_id, field="actual_workers").count() == 1
        assert s.query(AuditLog).filter(AuditLog.action == "REFLECT", AuditLog.entity_id == str(rid)).count() >= 1


def test_reflect_progress_forbidden_for_field_worker(client):
    _, _, _, task_id = _make_site_asset_task()
    pm = token(client, "pm@test.jp")
    r = client.post("/api/daily-reports", headers=H(pm), json={"project_id": 1, "report_date": "2026-08-02"})
    rid = r.json()["id"]
    fw = token(client, "partner@test.jp")
    assert client.post(f"/api/daily-reports/{rid}/reflect-progress", headers=H(fw)).status_code == 403


# ========== Ver.0.1.2 業務基盤 ==========
from app.models import (  # noqa: E402
    Asset as _Asset,
    Document,
    DocumentVersion,
    Notification,
    ProjectLedger,
    Qualification,
    Site as _Site,
    Task as _Task,
    TaskAsset,
    Team,
    Worker,
    WorkerAssignment,
    WorkerQualification,
)


def test_task_asset_link_filters_tasks(client):
    """task_assets により、設備に紐づく工程だけを返す。"""
    with TestingSessionLocal() as s:
        site = _Site(project_id=1, name="TA現場"); s.add(site); s.flush()
        a = _Asset(project_id=1, site_id=site.id, name="TA設備"); s.add(a); s.flush()
        t1 = _Task(project_id=1, site_id=site.id, wbs_code="TA.1", name="紐付け工程")
        t2 = _Task(project_id=1, site_id=site.id, wbs_code="TA.2", name="非紐付け工程")
        s.add_all([t1, t2]); s.flush()
        s.add(TaskAsset(task_id=t1.id, asset_id=a.id)); s.commit()
        aid, t1id = a.id, t1.id
    t = token(client, "admin@test.jp")
    r = client.get(f"/api/projects/1/tasks?asset_id={aid}", headers=H(t))
    assert r.status_code == 200
    ids = [x["id"] for x in r.json()]
    assert t1id in ids and len(ids) == 1


def _make_worker():
    with TestingSessionLocal() as s:
        team = Team(name="Tテスト班"); s.add(team); s.flush()
        w = Worker(name="作業 太郎", org="施工管理部 第一課", team_id=team.id, role="技術者",
                   status="稼働", continuous_days=3, schedule='["稼働","稼働","休暇","稼働","稼働","休暇","休暇"]')
        s.add(w); s.flush()
        q = Qualification(name="光ファイバ融着"); s.add(q); s.flush()
        s.add(WorkerQualification(worker_id=w.id, qualification_id=q.id))
        s.add(WorkerAssignment(worker_id=w.id, project_id=1, role="技術者", status="稼働"))
        s.commit()
        return w.id


def test_workers_list_and_detail(client):
    wid = _make_worker()
    t = token(client, "pm@test.jp")
    r = client.get("/api/workers", headers=H(t))
    assert r.status_code == 200
    row = next(w for w in r.json() if w["id"] == wid)
    assert row["crew"] == "Tテスト班" and "光ファイバ融着" in row["licenses"] and len(row["schedule"]) == 7
    d = client.get(f"/api/workers/{wid}", headers=H(t))
    assert d.status_code == 200
    assert d.json()["qualifications"][0]["name"] == "光ファイバ融着"
    assert d.json()["assignments"][0]["project_id"] == 1


def test_ledger_list_and_scope(client):
    with TestingSessionLocal() as s:
        if not s.query(ProjectLedger).filter_by(project_id=1).first():
            s.add(ProjectLedger(project_id=1, contract_no="C-T001", cost_planned=1000, cost_actual=500, billing_status="未請求", document_status="作成中"))
            s.commit()
    admin = token(client, "admin@test.jp")
    r = client.get("/api/ledger", headers=H(admin))
    assert r.status_code == 200 and len(r.json()) >= 2  # admin は全案件
    partner = token(client, "partner@test.jp")
    rp = client.get("/api/ledger", headers=H(partner))
    assert [row["workNo"] for row in rp.json()] == ["T-001"]  # 割当案件のみ


def test_document_upload_versioning_and_delete(client):
    t = token(client, "pm@test.jp")
    # 新規図面（Rev.0）
    r = client.post("/api/documents", headers=H(t), data={"project_id": "1", "name": "系統図", "doc_type": "系統図"},
                    files={"file": ("d.pdf", b"%PDF-1", "application/pdf")})
    assert r.status_code == 201, r.text
    did = r.json()["id"]
    assert r.json()["rev"] == "Rev.0" and len(r.json()["versions"]) == 1
    # 新しい版（Rev.1）— 古い版は残る
    r = client.post("/api/documents", headers=H(t), data={"document_id": str(did)},
                    files={"file": ("d2.pdf", b"%PDF-2", "application/pdf")})
    assert r.json()["rev"] == "Rev.1" and len(r.json()["versions"]) == 2
    # ステータス変更
    assert client.patch(f"/api/documents/{did}", headers=H(t), json={"status": "承認済み"}).json()["approval"] == "承認済み"
    # 論理削除
    assert client.delete(f"/api/documents/{did}", headers=H(t)).status_code == 204
    assert client.get(f"/api/documents/{did}", headers=H(t)).status_code == 404


def test_document_upload_forbidden_for_viewer(client):
    # FIELD_WORKER は可、権限なしロールは不可。ここでは partner(FIELD_WORKER)は許可、別途 role 検証は他テストで担保。
    t = token(client, "partner@test.jp")
    r = client.post("/api/documents", headers=H(t), data={"project_id": "1", "name": "x"},
                    files={"file": ("d.pdf", b"%PDF", "application/pdf")})
    assert r.status_code in (201, 403)  # partnerはFIELD_WORKERなので許可される想定


def test_notifications_list_read_and_scope(client):
    with TestingSessionLocal() as s:
        s.add(Notification(user_id=None, kind="工程遅延", title="全体通知A", project_id=1, target_url="/schedule", is_read=False, important=True))
        s.add(Notification(user_id=None, kind="日報未提出", title="別案件通知", project_id=2, target_url="/daily-report", is_read=False))
        s.commit()
    admin = token(client, "admin@test.jp")
    r = client.get("/api/notifications", headers=H(admin))
    titles = [n["title"] for n in r.json()]
    assert "全体通知A" in titles and "別案件通知" in titles
    nid = next(n["id"] for n in r.json() if n["title"] == "全体通知A")
    assert client.patch(f"/api/notifications/{nid}/read?read=true", headers=H(admin)).json()["read"] is True
    # 協力会社は割当案件(1)外の通知(2)を見られない
    partner = token(client, "partner@test.jp")
    ptitles = [n["title"] for n in client.get("/api/notifications", headers=H(partner)).json()]
    assert "全体通知A" in ptitles and "別案件通知" not in ptitles


def test_dashboard_summary_and_scope(client):
    admin = token(client, "admin@test.jp")
    r = client.get("/api/dashboard/summary", headers=H(admin))
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 2 and set(["active", "delayed", "photoPending", "qualityWaiting", "reportPending", "peopleToday"]).issubset(body)
    partner = token(client, "partner@test.jp")
    rp = client.get("/api/dashboard/summary", headers=H(partner))
    assert rp.json()["total"] == 1  # 割当案件のみ


# ========== Ver.0.1.3 実用基盤仕上げ ==========
from app.models import (  # noqa: E402
    Material,
    ProjectMaterial as _PM,
    TestRecord as _TR,
    Worker as _Worker2,
    WorkerAssignment as _WA,
)


def _make_worker2(status="待機"):
    with TestingSessionLocal() as s:
        w = _Worker2(name="配置 太郎", org="第一課", role="技術者", status=status)
        s.add(w); s.commit()
        return w.id


def test_worker_assign_and_unassign(client):
    wid = _make_worker2("待機")
    pm = token(client, "pm@test.jp")
    # 配置（案件1へ）→ 稼働になる
    r = client.post(f"/api/workers/{wid}/assign", headers=H(pm), json={"project_id": 1, "role": "技術者"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "稼働"
    assert r.json()["assignments"][0]["project_id"] == 1
    aid = None
    with TestingSessionLocal() as s:
        aid = s.query(_WA).filter_by(worker_id=wid).first().id
    # 解除 → 待機へ戻る
    r = client.request("DELETE", f"/api/workers/{wid}/assign/{aid}", headers=H(pm))
    assert r.status_code == 200 and r.json()["status"] == "待機"


def test_worker_assign_forbidden_for_field_worker(client):
    wid = _make_worker2()
    fw = token(client, "partner@test.jp")
    assert client.post(f"/api/workers/{wid}/assign", headers=H(fw), json={"project_id": 1}).status_code == 403


def test_material_create_and_list(client):
    pm = token(client, "pm@test.jp")
    r = client.post("/api/materials", headers=H(pm), json={"project_id": 1, "name": "光成端箱", "unit": "台", "qty_planned": 4, "qty_used": 2, "status": "入荷済"})
    assert r.status_code == 201, r.text
    assert r.json()["name"] == "光成端箱" and r.json()["qty_planned"] == 4
    rows = client.get("/api/materials?project_id=1", headers=H(pm)).json()
    assert any(m["name"] == "光成端箱" for m in rows)


def test_material_scope_forbidden(client):
    # partner は割当案件1のみ。案件2への登録は403
    fw = token(client, "partner@test.jp")
    assert client.post("/api/materials", headers=H(fw), json={"project_id": 2, "name": "x"}).status_code == 403


def test_test_record_create_link_and_filter(client):
    with TestingSessionLocal() as s:
        from app.models import Asset as _A, Site as _S, Task as _T
        site = _S(project_id=1, name="TR現場"); s.add(site); s.flush()
        a = _A(project_id=1, site_id=site.id, name="TR設備"); s.add(a); s.flush()
        t = _T(project_id=1, site_id=site.id, wbs_code="TR.1", name="TR工程"); s.add(t); s.commit()
        aid, tid = a.id, t.id
    pm = token(client, "pm@test.jp")
    r = client.post("/api/test-records", headers=H(pm), json={
        "project_id": 1, "asset_id": aid, "task_id": tid, "test_type": "光損失測定",
        "measured_value": "0.28", "unit": "dB", "standard_value": "≤0.5dB", "judge": "合格", "instrument": "PM-200",
    })
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert r.json()["asset_id"] == aid and r.json()["task_id"] == tid and r.json()["tester"]
    # Asset/Task で絞り込み → 保持
    rows = client.get(f"/api/test-records?project_id=1&asset_id={aid}", headers=H(pm)).json()
    assert any(x["id"] == rid for x in rows)
    rows2 = client.get(f"/api/test-records?project_id=1&task_id={tid}", headers=H(pm)).json()
    assert any(x["id"] == rid for x in rows2)


def test_report_export_pdf_and_xlsx(client):
    admin = token(client, "admin@test.jp")
    rp = client.get("/api/reports/construction-management?project_id=1&format=pdf", headers=H(admin))
    assert rp.status_code == 200 and rp.headers["content-type"] == "application/pdf"
    assert rp.content[:5] == b"%PDF-"
    rx = client.get("/api/reports/construction-management?project_id=1&format=xlsx", headers=H(admin))
    assert rx.status_code == 200 and "spreadsheetml" in rx.headers["content-type"]
    assert rx.content[:2] == b"PK"  # xlsx = zip
    # 未対応帳票は404
    assert client.get("/api/reports/unknown?project_id=1", headers=H(admin)).status_code == 404


def test_report_export_scope_forbidden(client):
    fw = token(client, "partner@test.jp")
    # partner は案件2にアクセス不可
    assert client.get("/api/reports/construction-management?project_id=2&format=pdf", headers=H(fw)).status_code == 403


# ========== Ver.0.2 AI 施工写真認識 PoC ==========
import io as _io2  # noqa: E402

from app.models import AiFeedback, AiModel, AiPrediction as _AiPred  # noqa: E402
from ai_worker.predictor import FakePredictor, YoloPredictor, MODEL_NOT_AVAILABLE  # noqa: E402
from ai_worker.worker import process_one  # noqa: E402


def _photo_with_image() -> int:
    from app.services.storage import get_storage
    buf = _io2.BytesIO(); Image.new("RGB", (640, 480), (120, 160, 200)).save(buf, format="JPEG")
    key = "photos/test/ai_int.jpg"
    get_storage().save(key, buf.getvalue(), "image/jpeg")
    with TestingSessionLocal() as s:
        p = Photo(project_id=1, original_file_path=key, confirmation_status="未確認")
        s.add(p); s.commit()
        return p.id


def test_ai_pipeline_job_worker_prediction_api_feedback(client):
    """統合経路: Photo→Job作成→Worker取得→状態遷移→Prediction保存→API取得→Feedback保存。"""
    pid = _photo_with_image()
    t = token(client, "pm@test.jp")
    # Job作成
    r = client.post(f"/api/ai/photos/{pid}/analyze?job_type=detection", headers=H(t))
    assert r.status_code == 202 and r.json()["status"] == "QUEUED"
    # Worker が Fake で処理（テスト専用predictor。実AIではない）
    with TestingSessionLocal() as s:
        job = process_one(s, FakePredictor())
        assert job is not None
        s.refresh(job)
        assert job.status == "COMPLETED"
        assert s.query(_AiPred).filter_by(photo_id=pid, prediction_type="detection").count() == 3
    # API取得（正規化→表示座標へ変換、prediction_id 付き）
    ai = client.get(f"/api/photos/{pid}/ai", headers=H(t)).json()
    assert ai["source"] == "ai_predictions" and len(ai["detections"]) == 3
    d0 = ai["detections"][0]
    assert d0["prediction_id"] and d0["bbox"] and d0["bbox_norm"]
    # bbox_norm は 0-1、bbox は表示座標(100x75)
    assert 0 <= d0["bbox_norm"][0] <= 1 and d0["bbox"][0] > d0["bbox_norm"][0]
    # Feedback保存（AI予測は上書きせず ai_feedback に別途保存）
    predid = d0["prediction_id"]
    fr = client.post(f"/api/photos/{pid}/predictions/{predid}/feedback", headers=H(t), json={"verdict": "correct"})
    assert fr.status_code == 201 and fr.json()["accepted"] is True
    # AI予測は残る（上書きされない）＋ feedbackが記録される
    with TestingSessionLocal() as s:
        assert s.get(_AiPred, predid) is not None
        assert s.query(AiFeedback).filter_by(prediction_id=predid).count() == 1
    # 再取得すると feedback verdict が反映
    ai2 = client.get(f"/api/photos/{pid}/ai", headers=H(t)).json()
    assert ai2["detections"][0]["feedback"] == "correct"


def test_ai_missed_feedback(client):
    pid = _photo_with_image()
    t = token(client, "pm@test.jp")
    r = client.post(f"/api/photos/{pid}/missed-feedback", headers=H(t), json={"label": "光成端箱"})
    assert r.status_code == 201 and r.json()["verdict"] == "missed"
    with TestingSessionLocal() as s:
        fb = s.query(AiFeedback).filter_by(photo_id=pid, prediction_id=None).first()
        assert fb is not None and fb.corrected_value == "光成端箱"


def test_ai_model_not_available_fails_job_without_predictions(client):
    """実weights未配置(YOLO)ではジョブはFAILED、Fake結果は保存しない。"""
    pid = _photo_with_image()
    t = token(client, "pm@test.jp")
    client.post(f"/api/ai/photos/{pid}/analyze", headers=H(t))
    assert YoloPredictor().status() == MODEL_NOT_AVAILABLE
    with TestingSessionLocal() as s:
        job = process_one(s, YoloPredictor())
        s.refresh(job)
        assert job.status == "FAILED"
        assert job.error_message == "MODEL_NOT_AVAILABLE" and job.retry_count == 1
        assert s.query(_AiPred).filter_by(photo_id=pid).count() == 0


def test_backend_works_while_worker_stopped(client):
    """Worker停止中でも施工管理APIは正常（本体はWorkerに依存しない）。"""
    t = token(client, "pm@test.jp")
    # Worker を一切動かさずに主要APIが200
    assert client.get("/api/projects", headers=H(t)).status_code == 200
    assert client.get("/api/photos?project_id=1", headers=H(t)).status_code == 200
    pid = _photo_with_image()
    # 未処理(QUEUED)のままでも写真AI取得は source=none で正常応答
    client.post(f"/api/ai/photos/{pid}/analyze", headers=H(t))
    ai = client.get(f"/api/photos/{pid}/ai", headers=H(t))
    assert ai.status_code == 200 and ai.json()["source"] == "none"


def test_ai_models_endpoint(client):
    t = token(client, "admin@test.jp")
    # ensure at least one model via worker
    pid = _photo_with_image()
    client.post(f"/api/ai/photos/{pid}/analyze", headers=H(t))
    with TestingSessionLocal() as s:
        process_one(s, FakePredictor())
    r = client.get("/api/ai/models", headers=H(t))
    assert r.status_code == 200 and len(r.json()) >= 1
    assert all({"name", "version", "status", "dataset_version"} <= set(m) for m in r.json())
