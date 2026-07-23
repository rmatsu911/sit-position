"""Ver.0.1.1 施工写真 / 品質管理 / 現場日報 / 監査ログ のテスト。"""
import io
import json

from PIL import Image

from app.models import AiAnalysisJob, AiPrediction, AuditLog, Photo, QualityCheck
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
