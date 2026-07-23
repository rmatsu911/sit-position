"""既存フロントの固定ダミーデータを PostgreSQL の初期データへ移行する。

実行: python -m app.seed.seed          （案件が未登録のときのみ投入）
      python -m app.seed.seed --reset  （関連データを消してから再投入）

これにより「ダミー表示 → 本物のDB表示」へ UI を壊さず移行する。
"""
from __future__ import annotations

import sys
from datetime import date, datetime

from sqlalchemy import select, text

from app.core.config import settings
from app.core.db import SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    AiModel,
    AiThresholdSetting,
    AssetType,
    Branch,
    Company,
    ConstructionType,
    DailyReport,
    Department,
    PhotoType,
    Photo,
    ProcessType,
    Project,
    ProjectMember,
    QualityCheck,
    QualityRuleType,
    Site,
    Task,
    User,
    WorkType,
)

DEMO_PASSWORD = "Passw0rd!"

# ===== マスタ =====
CONSTRUCTION_TYPES = [
    "局内設備更改", "FTTH増設", "地中管路敷設", "基地局設備更新",
    "クロージャ更新", "切替工事", "設備復旧", "架空ケーブル更新",
]
WORK_TYPES = ["準備", "調査", "調整", "運搬", "安全", "土木・敷設", "敷設", "接続", "試験", "宅内", "切替", "整理", "品質", "書類", "確認", "検査", "マイルストン"]
PROCESS_TYPES = [
    "事前現地調査", "道路使用許可確認", "資材搬入", "KY活動", "高所作業車配置", "既設設備確認",
    "光ケーブル敷設", "クロージャ設置", "光ファイバ融着", "接続損失測定", "ONU設置", "光成端",
    "切替作業", "通信試験", "施工写真整理", "品質確認", "完成図書作成", "顧客確認", "完成検査", "引き渡し",
    "地中管路敷設",
]
ASSET_TYPES = ["光ケーブル", "クロージャ", "電柱", "ONU", "光成端箱", "スプライス", "融着", "ハンドホール", "高所作業車", "接続試験", "配線", "完成状態"]
PHOTO_TYPES = ["着手前", "施工中", "完成", "使用材料", "品質記録"]
QUALITY_RULE_TYPES = ["出来形", "品質", "写真", "安全"]

# ===== ユーザー（氏名 → ロール） =====
USERS = [
    ("山田 太郎", "yamada@example.co.jp", "PROJECT_MANAGER", "施工管理部 第一課"),
    ("佐藤 花子", "sato.h@example.co.jp", "PROJECT_MANAGER", "施工管理部 第二課"),
    ("田中 一郎", "tanaka@example.co.jp", "FIELD_WORKER", "施工管理部 第一課"),
    ("鈴木 健", "suzuki@example.co.jp", "FIELD_WORKER", "施工管理部 第三課"),
    ("高橋 誠", "takahashi@example.co.jp", "FIELD_WORKER", "施工管理部 第二課"),
    ("伊藤 直樹", "ito@example.co.jp", "FIELD_WORKER", "施工管理部 第一課"),
    ("渡辺 修", "watanabe@example.co.jp", "PROJECT_MANAGER", "施工管理部 第三課"),
    ("中村 亮", "nakamura@example.co.jp", "FIELD_WORKER", "施工管理部 第二課"),
    ("品質 管理者", "quality@example.co.jp", "QUALITY_MANAGER", "品質管理課"),
    ("協力 太郎", "partner@example.co.jp", "FIELD_WORKER", None),  # 協力会社（案件スコープ確認用）
]

# ===== 案件（現行UIと同一） =====
PROJECTS = [
    dict(code="KM-2026-001", name="熊本中央局 光設備更改工事", customer="西日本通信ネットワーク", customer_type="通信事業者", ctype="局内設備更改", area="熊本市中央区", location="熊本市中央区手取本町 熊本中央局舎", dept="施工管理部 第一課", manager="山田 太郎", status="遅延", pp=80, ap=72, start="2026-06-01", due="2026-08-10", contract=48000000, bp=42000000, bu=30600000),
    dict(code="KM-2026-002", name="八代エリア FTTH増設工事", customer="肥後ブロードバンド", customer_type="通信事業者", ctype="FTTH増設", area="八代市", location="八代市松江城町 周辺エリア", dept="施工管理部 第二課", manager="佐藤 花子", status="施工中", pp=52, ap=48, start="2026-06-15", due="2026-09-05", contract=29500000, bp=26000000, bu=12100000),
    dict(code="KM-2026-003", name="菊陽町 通信管路敷設工事", customer="菊陽町役場", customer_type="自治体", ctype="地中管路敷設", area="菊池郡菊陽町", location="菊池郡菊陽町光の森 幹線道路沿い", dept="施工管理部 第一課", manager="田中 一郎", status="施工中", pp=84, ap=86, start="2026-05-10", due="2026-08-01", contract=37000000, bp=33000000, bu=27800000),
    dict(code="KM-2026-004", name="合志市 基地局設備更新工事", customer="九州モバイル通信", customer_type="通信事業者", ctype="基地局設備更新", area="合志市", location="合志市須屋 基地局サイト", dept="施工管理部 第三課", manager="鈴木 健", status="準備中", pp=40, ap=35, start="2026-07-01", due="2026-10-20", contract=56000000, bp=51000000, bu=16800000),
    dict(code="KM-2026-005", name="玉名局 クロージャ更新工事", customer="西日本通信ネットワーク", customer_type="通信事業者", ctype="クロージャ更新", area="玉名市", location="玉名市中 玉名局管内", dept="施工管理部 第二課", manager="高橋 誠", status="確認待ち", pp=90, ap=91, start="2026-05-20", due="2026-07-25", contract=20500000, bp=18000000, bu=16500000),
    dict(code="KM-2026-006", name="熊本市東区 光ケーブル切替工事", customer="肥後ブロードバンド", customer_type="通信事業者", ctype="切替工事", area="熊本市東区", location="熊本市東区健軍 幹線", dept="施工管理部 第一課", manager="伊藤 直樹", status="施工中", pp=60, ap=58, start="2026-06-20", due="2026-08-30", contract=24800000, bp=22000000, bu=12800000),
    dict(code="KM-2026-007", name="天草地区 通信設備復旧工事", customer="天草市役所", customer_type="官公庁", ctype="設備復旧", area="天草市", location="天草市本渡町 沿岸部", dept="施工管理部 第三課", manager="渡辺 修", status="遅延", pp=45, ap=30, start="2026-06-10", due="2026-08-15", contract=31000000, bp=28000000, bu=9200000),
    dict(code="KM-2026-008", name="阿蘇エリア 架空ケーブル更新工事", customer="九州電力ネットワーク", customer_type="電力関連会社", ctype="架空ケーブル更新", area="阿蘇市", location="阿蘇市一の宮町 山間部", dept="施工管理部 第二課", manager="中村 亮", status="未着工", pp=0, ap=0, start="2026-08-01", due="2026-11-10", contract=40000000, bp=36000000, bu=0),
]

# ===== 工程（熊本中央局 = p1） (wbs, name, work_type, process, plan_s, plan_e, act_s, act_e, progress, plan_w, act_w, status) =====
TASKS = [
    ("1", "準備工", "準備", "KY活動", "2026-06-01", "2026-06-12", "2026-06-01", "2026-06-12", 100, 12, 12, "完了"),
    ("1.1", "事前現地調査", "調査", "事前現地調査", "2026-06-01", "2026-06-03", "2026-06-01", "2026-06-03", 100, 2, 2, "完了"),
    ("1.2", "道路使用許可確認", "調整", "道路使用許可確認", "2026-06-03", "2026-06-06", "2026-06-03", "2026-06-06", 100, 1, 1, "完了"),
    ("1.3", "資材搬入", "運搬", "資材搬入", "2026-06-08", "2026-06-10", "2026-06-08", "2026-06-10", 100, 4, 4, "完了"),
    ("1.4", "KY活動（着工前）", "安全", "KY活動", "2026-06-11", "2026-06-12", "2026-06-11", "2026-06-12", 100, 6, 6, "完了"),
    ("2", "敷設・設置工", "土木・敷設", "光ケーブル敷設", "2026-06-15", "2026-07-11", "2026-06-15", "2026-07-11", 100, 40, 42, "完了"),
    ("2.1", "高所作業車配置", "準備", "高所作業車配置", "2026-06-15", "2026-06-16", "2026-06-15", "2026-06-16", 100, 3, 3, "完了"),
    ("2.2", "既設設備確認", "調査", "既設設備確認", "2026-06-16", "2026-06-19", "2026-06-16", "2026-06-19", 100, 4, 4, "完了"),
    ("2.3", "光ケーブル敷設", "敷設", "光ケーブル敷設", "2026-06-22", "2026-07-04", "2026-06-22", "2026-07-05", 100, 24, 26, "完了"),
    ("2.4", "クロージャ設置", "敷設", "クロージャ設置", "2026-07-06", "2026-07-11", "2026-07-07", "2026-07-11", 100, 9, 9, "完了"),
    ("3", "接続・試験工", "接続", "光ファイバ融着", "2026-07-13", "2026-07-28", "2026-07-13", None, 55, 30, 22, "施工中"),
    ("3.1", "光ファイバ融着", "接続", "光ファイバ融着", "2026-07-13", "2026-07-18", "2026-07-13", "2026-07-18", 100, 12, 12, "完了"),
    ("3.2", "接続損失測定", "試験", "接続損失測定", "2026-07-18", "2026-07-22", "2026-07-20", None, 60, 6, 4, "遅延"),
    ("3.3", "ONU設置", "宅内", "ONU設置", "2026-07-21", "2026-07-24", "2026-07-21", None, 20, 6, 4, "施工中"),
    ("3.4", "光成端", "接続", "光成端", "2026-07-24", "2026-07-28", None, None, 0, 6, 0, "未着手"),
    ("4", "切替工", "切替", "切替作業", "2026-07-29", "2026-08-02", None, None, 0, 16, 0, "未着手"),
    ("4.1", "切替作業", "切替", "切替作業", "2026-07-29", "2026-07-31", None, None, 0, 10, 0, "未着手"),
    ("4.2", "通信試験", "試験", "通信試験", "2026-07-31", "2026-08-02", None, None, 0, 6, 0, "未着手"),
    ("5", "完成・検査工", "検査", "完成検査", "2026-08-03", "2026-08-10", None, None, 0, 12, 0, "未着手"),
    ("5.1", "施工写真整理", "整理", "施工写真整理", "2026-08-03", "2026-08-04", None, None, 0, 2, 0, "未着手"),
    ("5.2", "品質確認", "品質", "品質確認", "2026-08-04", "2026-08-05", None, None, 0, 2, 0, "未着手"),
    ("5.3", "完成図書作成", "書類", "完成図書作成", "2026-08-05", "2026-08-07", None, None, 0, 2, 0, "未着手"),
    ("5.4", "顧客確認", "確認", "顧客確認", "2026-08-07", "2026-08-08", None, None, 0, 2, 0, "未着手"),
    ("5.5", "完成検査", "検査", "完成検査", "2026-08-08", "2026-08-09", None, None, 0, 3, 0, "未着手"),
    ("5.6", "引き渡し", "マイルストン", "引き渡し", "2026-08-10", "2026-08-10", None, None, 0, 1, 0, "未着手"),
]


def _d(s: str | None) -> date | None:
    return date.fromisoformat(s) if s else None


def _dt(s: str | None) -> datetime | None:
    return datetime.fromisoformat(s + "T09:00:00") if s else None


def get_or_create(session, model, code_field, code, **kw):
    obj = session.execute(select(model).where(getattr(model, code_field) == code)).scalar_one_or_none()
    if obj is None:
        obj = model(**{code_field: code}, **kw)
        session.add(obj)
        session.flush()
    return obj


def reset(session):
    tables = [
        "audit_logs", "ai_feedback", "ai_predictions", "ai_analysis_jobs", "ai_threshold_settings", "ai_models",
        "quality_checks", "daily_report_tasks", "daily_reports", "task_change_history", "task_dependencies",
        "photos", "tasks", "assets", "sites", "project_members", "projects",
        "quality_rules", "work_types", "process_types", "asset_types", "photo_types", "quality_rule_types",
        "construction_types", "users", "departments", "branches", "companies",
    ]
    session.execute(text("TRUNCATE " + ", ".join(tables) + " RESTART IDENTITY CASCADE"))
    session.commit()


def run(reset_first: bool = False) -> None:
    with SessionLocal() as s:
        if reset_first:
            reset(s)
        if s.execute(select(Project).limit(1)).first():
            print("既にSeedデータがあるためスキップしましたA（--reset で再投入）")
            return

        # 組織
        branch = get_or_create(s, Branch, "code", "KM", name="熊本支店")
        dept_names = ["施工管理部 第一課", "施工管理部 第二課", "施工管理部 第三課", "品質管理課"]
        depts = {}
        for n in dept_names:
            d = Department(branch_id=branch.id, name=n)
            s.add(d); s.flush(); depts[n] = d
        own = get_or_create(s, Company, "name", "株式会社SYSKEN", is_partner=False)
        partner = get_or_create(s, Company, "name", "協力会社 九州テクノ", is_partner=True)

        # ユーザー
        users: dict[str, User] = {}
        admin = User(email=settings.seed_admin_email, hashed_password=hash_password(settings.seed_admin_password),
                     name="管理者", role="ADMIN", branch_id=branch.id)
        s.add(admin); s.flush(); users["管理者"] = admin
        for name, email, role, dept in USERS:
            u = User(email=email, hashed_password=hash_password(DEMO_PASSWORD), name=name, role=role,
                     branch_id=branch.id, department_id=depts[dept].id if dept else None,
                     company_id=partner.id if dept is None else own.id)
            s.add(u); s.flush(); users[name] = u

        # マスタ
        def seed_master(model, names):
            m = {}
            for i, n in enumerate(names):
                obj = model(code=n, name=n, sort_order=i)
                s.add(obj); s.flush(); m[n] = obj
            return m
        ctypes = seed_master(ConstructionType, CONSTRUCTION_TYPES)
        wtypes = seed_master(WorkType, WORK_TYPES)
        ptypes = seed_master(ProcessType, PROCESS_TYPES)
        seed_master(AssetType, ASSET_TYPES)
        seed_master(PhotoType, PHOTO_TYPES)
        seed_master(QualityRuleType, QUALITY_RULE_TYPES)

        # 案件
        projects: dict[str, Project] = {}
        for pr in PROJECTS:
            p = Project(
                construction_number=pr["code"], name=pr["name"], customer=pr["customer"], customer_type=pr["customer_type"],
                construction_type_id=ctypes[pr["ctype"]].id, area=pr["area"], location=pr["location"], address=pr["location"],
                branch_id=branch.id, department_id=depts[pr["dept"]].id, manager_id=users[pr["manager"]].id,
                start_planned_at=_d(pr["start"]), finish_planned_at=_d(pr["due"]),
                contract_amount=pr["contract"], budget_planned=pr["bp"], budget_used=pr["bu"],
                planned_progress=pr["pp"], actual_progress=pr["ap"], status=pr["status"],
            )
            s.add(p); s.flush(); projects[pr["code"]] = p

        p1 = projects["KM-2026-001"]
        site = Site(project_id=p1.id, name="熊本中央局舎", address=p1.location)
        s.add(site); s.flush()

        # 協力会社ユーザーを p1 に割当（スコープ確認）
        s.add(ProjectMember(project_id=p1.id, user_id=users["協力 太郎"].id, role="FIELD_WORKER"))

        # 工程（p1）
        wbs_map: dict[str, Task] = {}
        for wbs, name, wt, pt, ps, pe, as_, ae, prog, pw, aw, st in TASKS:
            parent_id = None
            if "." in wbs:
                parent_id = wbs_map[wbs.split(".")[0]].id
            t = Task(
                project_id=p1.id, site_id=site.id, parent_task_id=parent_id, wbs_code=wbs, name=name,
                work_type_id=wtypes.get(wt).id if wt in wtypes else None,
                process_type_id=ptypes.get(pt).id if pt in ptypes else None,
                planned_start_at=_dt(ps), planned_finish_at=_dt(pe), actual_start_at=_dt(as_), actual_finish_at=_dt(ae),
                planned_progress=prog, actual_progress=prog, planned_workers=pw, actual_workers=aw,
                manager_id=users["高橋 誠"].id, status=st,
            )
            s.add(t); s.flush(); wbs_map[wbs] = t

        # 施工写真（p1・27枚）
        confirms = ["未確認", "確認済み", "再撮影依頼"]
        for i in range(27):
            conf = "未確認" if i % 5 == 0 else ("再撮影依頼" if i % 7 == 0 else "確認済み")
            s.add(Photo(
                project_id=p1.id, site_id=site.id, task_id=wbs_map["2.3"].id,
                original_file_path=f"photos/seed/P-{i+1:03d}.jpg",
                original_filename=f"P-{i+1:03d}.jpg", mime_type="image/jpeg",
                taken_at=datetime(2026, 7, (i % 20) + 1, 9, 0),
                photographer_id=users["田中 一郎"].id, confirmation_status=conf,
                comment="固定金具の取付状態を確認。良好。" if i % 4 == 0 else None,
            ))

        # 品質チェック（p1・確認待ち等）
        for st in ["確認待ち", "承認済み", "確認済み", "再撮影依頼", "情報不足", "未提出", "警告"]:
            s.add(QualityCheck(project_id=p1.id, site_id=site.id, task_id=wbs_map["2.4"].id, status=st,
                               human_result=None, ai_result=None, comment=None))

        # 日報（p1）
        for rd, wx, wc, st in [(date(2026, 7, 21), "晴れ時々曇り", 4, "DRAFT"),
                               (date(2026, 7, 20), "曇り", 6, "SUBMITTED")]:
            s.add(DailyReport(project_id=p1.id, site_id=site.id, report_date=rd, weather=wx, worker_count=wc,
                              manager_id=users["高橋 誠"].id, status=st,
                              work_description="接続損失測定の継続。"))
        s.add(DailyReport(project_id=projects["KM-2026-003"].id, report_date=date(2026, 7, 21), weather="晴れ",
                          worker_count=8, manager_id=users["田中 一郎"].id, status="APPROVED",
                          work_description="通信管路敷設、ハンドホール据付。"))

        # AI（構造のみ）
        s.add(AiModel(name="設備検出モデル", model_type="YOLO", version="v0.1", status="ACTIVE"))
        s.add(AiModel(name="工種分類モデル", model_type="ViT", version="v0.1", status="ACTIVE"))
        s.add(AiThresholdSetting(job_type="detection", auto_accept_threshold=0.90, review_threshold=0.70))
        s.add(AiThresholdSetting(job_type="classification", auto_accept_threshold=0.85, review_threshold=0.65))

        s.commit()
        print("Seed 完了:")
        print(f"  ユーザー {len(users)}名 / 案件 {len(projects)}件 / 工程 {len(TASKS)}件 / 写真 27枚")
        print(f"  管理者ログイン: {settings.seed_admin_email} / {settings.seed_admin_password}")
        print(f"  デモユーザー: yamada@example.co.jp ほか / {DEMO_PASSWORD}")


if __name__ == "__main__":
    run(reset_first="--reset" in sys.argv)
    engine.dispose()
