"""既存フロントの固定ダミーデータを PostgreSQL の初期データへ移行する。

実行: python -m app.seed.seed          （案件が未登録のときのみ投入）
      python -m app.seed.seed --reset  （関連データを消してから再投入）

これにより「ダミー表示 → 本物のDB表示」へ UI を壊さず移行する。
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta

from sqlalchemy import select, text

from app.core.config import settings
from app.core.db import SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    AiAnalysisJob,
    AiModel,
    AiPrediction,
    AiThresholdSetting,
    Asset,
    AssetType,
    AuditLog,
    Branch,
    Company,
    ConstructionType,
    DailyReport,
    DailyReportPhoto,
    DailyReportTask,
    Department,
    Document,
    DocumentVersion,
    Material,
    Notification,
    PhotoType,
    Photo,
    ProcessType,
    Project,
    ProjectLedger,
    ProjectMaterial,
    ProjectMember,
    Qualification,
    TestRecord,
    QualityCheck,
    QualityRule,
    QualityRuleType,
    Site,
    Task,
    TaskAsset,
    TaskDependency,
    Team,
    User,
    Worker,
    WorkerAssignment,
    WorkerQualification,
    WorkType,
)

from app.services.storage import get_storage  # noqa: E402

DEMO_PASSWORD = "Passw0rd!"
SEED_FIXTURE_VERSION = "fixture-2026.07"  # 開発用フィクスチャの識別子（audit_logs に記録）


def _sample_pdf(title: str) -> bytes:
    """Seed用の実PDFを生成（reportlab、日本語CIDフォント）。"""
    import io as _io

    from reportlab.lib.pagesizes import A4
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.cidfonts import UnicodeCIDFont
    from reportlab.pdfgen import canvas

    try:
        pdfmetrics.registerFont(UnicodeCIDFont("HeiseiKakuGo-W5"))
        font = "HeiseiKakuGo-W5"
    except Exception:
        font = "Helvetica"
    buf = _io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont(font, 18)
    c.drawString(60, 780, "SYSKEN 施工管理システム")
    c.setFont(font, 13)
    c.drawString(60, 745, title)
    c.setFont(font, 10)
    c.drawString(60, 715, "※ Seed生成のサンプル図面PDF（実ファイル閲覧デモ用）")
    c.rect(60, 300, 470, 380)
    c.save()
    return buf.getvalue()


def _sample_png(label: str) -> bytes:
    """Seed用の実PNGを生成（Pillow）。"""
    import io as _io

    from PIL import Image, ImageDraw

    img = Image.new("RGB", (640, 460), (243, 247, 250))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, 620, 440], outline=(0, 91, 172), width=3)
    d.text((40, 40), f"SYSKEN Drawing {label}", fill=(31, 41, 51))
    d.line([60, 200, 580, 200], fill=(0, 91, 172), width=2)
    d.ellipse([420, 120, 480, 180], outline=(46, 139, 87), width=3)
    buf = _io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

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


# ===== 工程（p1 以外の案件）=====
# 横断工程表は複数案件の工程を1画面で確認する画面のため、p1 以外にも工程が必要。
# (wbs, name, work_type, process, plan_s, plan_e, act_s, act_e, progress, plan_w, act_w, status, 担当者, 担当会社)
# 日付は "2026-06-19"（日単位）のほか "2026-06-19 AM" / "2026-06-19 PM" で 0.5日単位を表す。
# 担当者・担当会社が None の工程は「未割当」。担当会社キーは COMPANY_KEYS を参照。
CROSS_TASKS: dict[str, list[tuple]] = {
    "KM-2026-002": [
        ("1", "準備工", "準備", "KY活動", "2026-06-15", "2026-06-26", "2026-06-15", "2026-06-26", 100, 8, 8, "完了", "佐藤 花子", "施工管理部"),
        ("1.1", "事前現地調査", "調査", "事前現地調査", "2026-06-15", "2026-06-18", "2026-06-15", "2026-06-18", 100, 2, 2, "完了", "佐藤 花子", "施工管理部"),
        ("1.2", "道路使用許可確認", "調整", "道路使用許可確認", "2026-06-19 AM", "2026-06-19 AM", "2026-06-19 AM", "2026-06-19 AM", 100, 1, 1, "完了", "佐藤 花子", "施工管理部"),
        ("1.3", "資材搬入", "運搬", "資材搬入", "2026-06-22", "2026-06-26", "2026-06-22", "2026-06-26", 100, 5, 5, "完了", None, "九州テクノ"),
        ("2", "増設工", "敷設", "光ケーブル敷設", "2026-06-29", "2026-08-14", "2026-06-29", None, 55, 30, 18, "施工中", "佐藤 花子", "九州テクノ"),
        ("2.1", "光ケーブル敷設", "敷設", "光ケーブル敷設", "2026-06-29", "2026-07-24", "2026-06-29", "2026-07-25", 100, 18, 20, "完了", "佐藤 花子", "九州テクノ"),
        ("2.2", "クロージャ設置", "敷設", "クロージャ設置", "2026-07-27", "2026-08-07", "2026-07-27", None, 40, 8, 5, "施工中", "高橋 誠", "九州テクノ（別法人格）"),
        ("2.3", "ONU設置", "宅内", "ONU設置", "2026-08-10", "2026-08-14", None, None, 0, 4, 0, "未着手", None, None),
        ("3", "接続・試験工", "接続", "光ファイバ融着", "2026-08-17", "2026-09-04", None, None, 0, 16, 0, "未着手", "佐藤 花子", "施工管理部"),
    ],
    "KM-2026-003": [
        ("1", "管路敷設工", "土木・敷設", "地中管路敷設", "2026-05-10", "2026-07-10", "2026-05-10", "2026-07-14", 100, 45, 48, "完了", "田中 一郎", "肥後設備"),
        ("1.1", "試掘・埋設物確認", "調査", "既設設備確認", "2026-05-10", "2026-05-20", "2026-05-10", "2026-05-22", 100, 10, 12, "完了", "田中 一郎", "肥後設備"),
        ("1.2", "管路敷設", "土木・敷設", "地中管路敷設", "2026-05-25", "2026-06-26", "2026-05-25", "2026-06-30", 100, 28, 30, "完了", "田中 一郎", "肥後設備"),
        ("1.3", "ハンドホール設置", "土木・敷設", "地中管路敷設", "2026-06-29", "2026-07-10", "2026-07-01", "2026-07-14", 100, 7, 6, "完了", None, "肥後設備"),
        ("2", "ケーブル通線・試験工", "接続", "光ケーブル敷設", "2026-07-13", "2026-07-31", "2026-07-15", None, 70, 18, 13, "施工中", "田中 一郎", "肥後設備"),
        ("2.1", "通線", "敷設", "光ケーブル敷設", "2026-07-13", "2026-07-24", "2026-07-15", "2026-07-25", 100, 12, 11, "完了", "田中 一郎", "肥後設備"),
        ("2.2", "導通試験", "試験", "通信試験", "2026-07-27 PM", "2026-07-31", None, None, 0, 6, 0, "未着手", "鈴木 健", "施工管理部"),
    ],
    "KM-2026-004": [
        ("1", "準備・搬入工", "準備", "KY活動", "2026-07-01", "2026-07-24", "2026-07-01", None, 60, 14, 8, "施工中", "鈴木 健", "施工管理部"),
        ("1.1", "基地局現地調査", "調査", "事前現地調査", "2026-07-01", "2026-07-08", "2026-07-01", "2026-07-08", 100, 4, 4, "完了", "鈴木 健", "施工管理部"),
        ("1.2", "電源設備確認", "調査", "既設設備確認", "2026-07-09", "2026-07-15", "2026-07-09", None, 50, 4, 2, "施工中", "鈴木 健", "施工管理部"),
        ("1.3", "資材搬入", "運搬", "資材搬入", "2026-07-16", "2026-07-24", None, None, 0, 6, 0, "未着手", None, "九州テクノ"),
        ("2", "設備更新工", "敷設", "クロージャ設置", "2026-07-27", "2026-09-18", None, None, 0, 40, 0, "未着手", "鈴木 健", "九州テクノ"),
        ("2.1", "既設設備撤去", "敷設", "既設設備確認", "2026-07-27", "2026-08-14", None, None, 0, 16, 0, "未着手", "鈴木 健", "九州テクノ"),
        ("2.2", "新設設備据付", "敷設", "クロージャ設置", "2026-08-17", "2026-09-18", None, None, 0, 24, 0, "未着手", None, "九州テクノ"),
        ("3", "試験・検査工", "検査", "完成検査", "2026-09-21", "2026-10-16", None, None, 0, 12, 0, "未着手", "鈴木 健", "施工管理部"),
    ],
    "KM-2026-005": [
        ("1", "クロージャ更新工", "敷設", "クロージャ設置", "2026-05-20", "2026-07-03", "2026-05-20", "2026-07-03", 100, 26, 26, "完了", "高橋 誠", "九州テクノ"),
        ("1.1", "既設クロージャ確認", "調査", "既設設備確認", "2026-05-20", "2026-05-27", "2026-05-20", "2026-05-27", 100, 6, 6, "完了", "高橋 誠", "九州テクノ"),
        ("1.2", "クロージャ更新", "敷設", "クロージャ設置", "2026-05-28", "2026-06-19", "2026-05-28", "2026-06-19", 100, 14, 14, "完了", "高橋 誠", "九州テクノ"),
        ("1.3", "融着接続", "接続", "光ファイバ融着", "2026-06-22", "2026-07-03", "2026-06-22", "2026-07-03", 100, 6, 6, "完了", "高橋 誠", "九州テクノ"),
        ("2", "確認・引き渡し工", "確認", "顧客確認", "2026-07-06", "2026-07-24", "2026-07-06", None, 85, 8, 6, "施工中", "高橋 誠", "施工管理部"),
        ("2.1", "接続損失測定", "試験", "接続損失測定", "2026-07-06", "2026-07-14", "2026-07-06", "2026-07-14", 100, 4, 4, "完了", "高橋 誠", "施工管理部"),
        ("2.2", "完成図書作成", "書類", "完成図書作成", "2026-07-15", "2026-07-22", "2026-07-15", None, 70, 3, 2, "施工中", "高橋 誠", "施工管理部"),
        ("2.3", "顧客確認", "確認", "顧客確認", "2026-07-23 AM", "2026-07-24 AM", None, None, 0, 1, 0, "未着手", "佐藤 花子", "施工管理部"),
    ],
    "KM-2026-006": [
        ("1", "切替準備工", "準備", "KY活動", "2026-06-20", "2026-07-17", "2026-06-20", "2026-07-17", 100, 16, 16, "完了", "伊藤 直樹", "施工管理部"),
        ("1.1", "切替対象回線調査", "調査", "既設設備確認", "2026-06-20", "2026-07-01", "2026-06-20", "2026-07-01", 100, 8, 8, "完了", "伊藤 直樹", "施工管理部"),
        ("1.2", "切替手順書作成", "書類", "完成図書作成", "2026-07-02", "2026-07-10", "2026-07-02", "2026-07-10", 100, 4, 4, "完了", "伊藤 直樹", "施工管理部"),
        ("1.3", "顧客調整", "調整", "顧客確認", "2026-07-13", "2026-07-17", "2026-07-13", "2026-07-17", 100, 4, 4, "完了", None, None),
        ("2", "切替工", "切替", "切替作業", "2026-07-21", "2026-08-14", "2026-07-21", None, 35, 24, 9, "施工中", "伊藤 直樹", "九州テクノ（別法人格）"),
        ("2.1", "夜間切替作業（第1回）", "切替", "切替作業", "2026-07-21 PM", "2026-07-22 AM", "2026-07-21 PM", "2026-07-22 AM", 100, 8, 8, "完了", "伊藤 直樹", "九州テクノ（別法人格）"),
        ("2.2", "通信試験", "試験", "通信試験", "2026-07-23", "2026-07-30", "2026-07-24", None, 40, 6, 1, "遅延", "伊藤 直樹", "九州テクノ（別法人格）"),
        ("2.3", "夜間切替作業（第2回）", "切替", "切替作業", "2026-08-03 PM", "2026-08-04 AM", None, None, 0, 8, 0, "未着手", "伊藤 直樹", "九州テクノ（別法人格）"),
        ("3", "完成・検査工", "検査", "完成検査", "2026-08-17", "2026-08-28", None, None, 0, 10, 0, "未着手", "伊藤 直樹", "施工管理部"),
    ],
    "KM-2026-007": [
        ("1", "復旧調査工", "調査", "事前現地調査", "2026-06-10", "2026-06-26", "2026-06-15", "2026-07-03", 100, 12, 15, "完了", "渡辺 修", "施工管理部"),
        ("1.1", "被災設備調査", "調査", "既設設備確認", "2026-06-10", "2026-06-19", "2026-06-15", "2026-06-26", 100, 8, 10, "完了", "渡辺 修", "施工管理部"),
        ("1.2", "復旧計画作成", "書類", "完成図書作成", "2026-06-22", "2026-06-26", "2026-06-29", "2026-07-03", 100, 4, 5, "完了", "渡辺 修", "施工管理部"),
        ("2", "復旧工", "敷設", "光ケーブル敷設", "2026-06-29", "2026-08-07", "2026-07-06", None, 30, 34, 12, "遅延", "渡辺 修", "肥後設備"),
        ("2.1", "架空ケーブル復旧", "敷設", "光ケーブル敷設", "2026-06-29", "2026-07-24", "2026-07-06", None, 45, 20, 12, "遅延", "渡辺 修", "肥後設備"),
        ("2.2", "クロージャ復旧", "敷設", "クロージャ設置", "2026-07-27", "2026-08-07", None, None, 0, 14, 0, "未着手", None, "肥後設備"),
        ("3", "試験・報告工", "試験", "通信試験", "2026-08-10", "2026-08-14", None, None, 0, 6, 0, "未着手", "渡辺 修", "施工管理部"),
    ],
    "KM-2026-008": [
        ("1", "準備工", "準備", "KY活動", "2026-08-03", "2026-08-21", None, None, 0, 12, 0, "未着手", "中村 亮", "施工管理部"),
        ("1.1", "事前現地調査", "調査", "事前現地調査", "2026-08-03", "2026-08-12", None, None, 0, 6, 0, "未着手", "中村 亮", "施工管理部"),
        ("1.2", "高所作業車配置", "準備", "高所作業車配置", "2026-08-13", "2026-08-21", None, None, 0, 6, 0, "未着手", None, "九州テクノ"),
        ("2", "架空ケーブル更新工", "敷設", "光ケーブル敷設", "2026-08-24", "2026-10-23", None, None, 0, 56, 0, "未着手", "中村 亮", "九州テクノ"),
        ("2.1", "既設ケーブル撤去", "敷設", "光ケーブル敷設", "2026-08-24", "2026-09-18", None, None, 0, 24, 0, "未着手", "中村 亮", "九州テクノ"),
        ("2.2", "新ケーブル架設", "敷設", "光ケーブル敷設", "2026-09-21", "2026-10-23", None, None, 0, 32, 0, "未着手", "中村 亮", "九州テクノ"),
        ("3", "完成・検査工", "検査", "完成検査", "2026-10-26", "2026-11-06", None, None, 0, 10, 0, "未着手", "中村 亮", "施工管理部"),
    ],
}


def _d(s: str | None) -> date | None:
    return date.fromisoformat(s) if s else None


def _dt(s: str | None) -> datetime | None:
    """日付文字列を Asia/Tokyo のその日 00:00 として返す（工程の開始＝inclusive）。"""
    return datetime.fromisoformat(s + "T00:00:00+09:00") if s else None


def _dt_end(s: str | None) -> datetime | None:
    """終了日（その日を含む）を exclusive な「翌日 00:00 (JST)」として返す。

    工程の期間は [開始, 終了) の半開区間で保持する。日単位の工程は
    00:00 始まり・翌日 00:00 終わりになり、0.5日単位では 12:00 が境界になる。
    """
    if not s:
        return None
    return datetime.fromisoformat(s + "T00:00:00+09:00") + timedelta(days=1)


def _split_half(s: str) -> tuple[str, str | None]:
    """"2026-06-19 PM" → ("2026-06-19", "PM")。区分なしは (日付, None)。"""
    parts = s.split(" ")
    return (parts[0], parts[1]) if len(parts) == 2 else (parts[0], None)


def _dt_half_start(s: str | None) -> datetime | None:
    """開始（inclusive）。午前=00:00 / 午後=12:00。"""
    if not s:
        return None
    day, half = _split_half(s)
    hour = "12" if half == "PM" else "00"
    return datetime.fromisoformat(f"{day}T{hour}:00:00+09:00")


def _dt_half_end(s: str | None) -> datetime | None:
    """終了（exclusive）。午前終わり=同日12:00 / 午後終わり・日単位=翌日00:00。"""
    if not s:
        return None
    day, half = _split_half(s)
    if half == "AM":
        return datetime.fromisoformat(f"{day}T12:00:00+09:00")
    return datetime.fromisoformat(f"{day}T00:00:00+09:00") + timedelta(days=1)


def _precision_of(*values: str | None) -> str:
    """0.5日単位の区分が1つでもあれば half_day。日時が正で、この列は入力粒度のみ表す。"""
    return "half_day" if any(v and _split_half(v)[1] for v in values) else "day"


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
        "photos", "tasks", "assets", "sites", "project_members", "projects", "saved_searches",
        "quality_rules", "work_types", "process_types", "asset_types", "photo_types", "quality_rule_types",
        "construction_types", "users", "departments", "branches", "companies",
    ]
    session.execute(text("TRUNCATE " + ", ".join(tables) + " RESTART IDENTITY CASCADE"))
    session.commit()


def run(reset_first: bool = False, allow_production: bool = False) -> None:
    # production では Seed（開発用フィクスチャ）を自動投入しない
    if settings.app_env == "production" and not allow_production:
        print("APP_ENV=production のため Seed をスキップしました。"
              "本番でどうしても投入する場合は --force-production を指定してください。")
        return
    with SessionLocal() as s:
        if reset_first:
            reset(s)
        if s.execute(select(Project).limit(1)).first():
            print("既にSeedデータがあるためスキップしました（--reset で再投入）")
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
        atypes = seed_master(AssetType, ASSET_TYPES)
        photypes = seed_master(PhotoType, PHOTO_TYPES)
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

        # 設備（Site配下）— アップロード時の Site→Asset→Task 連動絞り込み用
        assets_map: dict[str, Asset] = {}
        for code, aname, atype in [
            ("MDF-01", "MDF主配線盤", "光成端箱"), ("CL-12", "クロージャ 局前No.12", "クロージャ"),
            ("ONU-A", "ONU A棟", "ONU"), ("HH-3", "ハンドホールH-3", "ハンドホール"),
        ]:
            a = Asset(project_id=p1.id, site_id=site.id, asset_type_id=atypes[atype].id if atype in atypes else None,
                      asset_code=code, name=aname, status="稼働")
            s.add(a); s.flush(); assets_map[code] = a

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
                planned_start_at=_dt(ps), planned_finish_at=_dt_end(pe), actual_start_at=_dt(as_), actual_finish_at=_dt_end(ae),
                planned_progress=prog, actual_progress=prog, planned_workers=pw, actual_workers=aw,
                manager_id=users["高橋 誠"].id, status=st,
            )
            s.add(t); s.flush(); wbs_map[wbs] = t

        # AIモデル（デモ表示用・未学習。実学習済みweightsは未配置＝実AIとして扱わない）
        yolo = AiModel(name="デモ表示用 設備検出（未学習）", model_type="YOLO", version="demo-seed", status="DEMO")
        vit = AiModel(name="デモ表示用 工種分類（未学習）", model_type="ViT", version="demo-seed", status="DEMO")
        s.add_all([yolo, vit])
        s.add(AiThresholdSetting(job_type="detection", auto_accept_threshold=0.90, review_threshold=0.70))
        s.add(AiThresholdSetting(job_type="classification", auto_accept_threshold=0.85, review_threshold=0.65))
        s.flush()

        # 施工写真（p1・27枚）＋ AIジョブ/予測（ai_predictions相当）
        secondary = {"光ケーブル": "クロージャ", "クロージャ": "固定金具", "電柱": "架空ケーブル", "ONU": "光コード",
                     "光成端箱": "パッチ配線", "スプライス": "融着点", "融着": "融着点", "ハンドホール": "管路口",
                     "高所作業車": "電柱", "接続試験": "測定端子", "配線": "ラック", "完成状態": "クロージャ"}
        recog = {
            "光ケーブル": ("光設備工事", "光ケーブル敷設", "架空光ケーブル"), "クロージャ": ("光設備工事", "クロージャ設置", "光接続クロージャ"),
            "電柱": ("架空設備工事", "架空ケーブル敷設", "電柱・架空ケーブル"), "ONU": ("宅内工事", "ONU設置", "回線終端装置(ONU)"),
            "光成端箱": ("光設備工事", "光成端", "光成端箱"), "スプライス": ("光設備工事", "光ファイバ融着", "融着接続部"),
            "融着": ("光設備工事", "光ファイバ融着", "融着接続機"), "ハンドホール": ("地中設備工事", "地中管路敷設", "ハンドホール"),
            "高所作業車": ("安全・仮設", "高所作業車配置", "高所作業車"), "接続試験": ("試験・測定", "接続損失測定", "OTDR/光パワーメータ"),
            "配線": ("局内工事", "局内配線", "通信ラック配線"), "完成状態": ("完成検査", "完成確認", "完成状態"),
        }
        procs = ["光ケーブル敷設", "クロージャ設置", "光ファイバ融着", "接続損失測定", "ONU設置", "既設設備確認"]
        works = ["敷設", "接続", "試験", "宅内", "調査"]
        # 正規化(0-1)左上原点 xywh（表示座標100x75から換算）。実Workerと同一フォーマット。
        positions = [
            {"format": "xywhn", "x": 0.12, "y": 0.32, "w": 0.36, "h": 0.347},
            {"format": "xywhn", "x": 0.55, "y": 0.267, "w": 0.28, "h": 0.32},
            {"format": "xywhn", "x": 0.38, "y": 0.693, "w": 0.28, "h": 0.24},
        ]
        codes3 = ["optical_cable", "closure", "utility_pole"]
        pcts = [0.92, 0.84, 0.61]
        for i in range(27):
            equip = ASSET_TYPES[i % len(ASSET_TYPES)]
            proc = procs[i % len(procs)]
            work = works[i % len(works)]
            conf = "未確認" if i % 5 == 0 else ("再撮影依頼" if i % 7 == 0 else "確認済み")
            ph = Photo(
                project_id=p1.id, site_id=site.id, asset_id=list(assets_map.values())[i % len(assets_map)].id, task_id=wbs_map["2.3"].id,
                original_file_path=f"photos/seed/P-{i+1:03d}.jpg", thumbnail_path=f"photos/seed/P-{i+1:03d}.jpg",
                original_filename=f"P-{i+1:03d}.jpg", mime_type="image/jpeg",
                taken_at=datetime(2026, 7, (i % 20) + 1, 8 + (i % 9), (i * 7) % 60),
                photographer_id=users["田中 一郎"].id, confirmation_status=conf,
                place=["局舎1F MDF室", "局前 電柱No.12", "幹線 ハンドホールH-3", "宅内 A棟", "屋上 ケーブルラック"][i % 5],
                latitude=32.79 + (i % 9) * 0.001, longitude=130.74 + (i % 7) * 0.001,
                confirmed_work_type_id=wtypes.get(work).id if work in wtypes else None,
                confirmed_process_type_id=ptypes.get(proc).id if proc in ptypes else None,
                confirmed_asset_type_id=atypes[equip].id, photo_type_id=photypes["施工中"].id,
                photo_no=f"P-{i+1:03d}", tags=json.dumps([equip], ensure_ascii=False),
                favorite=(i % 6 == 0), comment="固定金具の取付状態を確認。良好。" if i % 4 == 0 else None,
            )
            s.add(ph); s.flush()
            job = AiAnalysisJob(photo_id=ph.id, model_id=yolo.id, job_type="detection", status="COMPLETED",
                                completed_at=datetime(2026, 7, 21, 9, 0))
            s.add(job); s.flush()
            labels = [equip, secondary.get(equip, "関連設備"), "電柱"]
            for k in range(3):
                s.add(AiPrediction(job_id=job.id, photo_id=ph.id, model_id=yolo.id, prediction_type="detection",
                                   predicted_class_id=k, predicted_label=labels[k],
                                   confidence=pcts[k], bounding_box=json.dumps(positions[k], ensure_ascii=False),
                                   raw_result=json.dumps({"code": codes3[k], "label": labels[k], "confidence": pcts[k],
                                                          "predictor": "demo-seed"}, ensure_ascii=False)))
            wj, pj, aj = recog.get(equip, ("光設備工事", proc, equip))
            s.add(AiPrediction(job_id=job.id, photo_id=ph.id, model_id=vit.id, prediction_type="classification",
                               predicted_label=equip, confidence=0.9,
                               raw_result=json.dumps({"認識結果": equip, "工種判定": wj, "工程判定": pj,
                                                      "設備判定": aj, "現場判定": p1.name}, ensure_ascii=False)))
            if i < 8:  # 一部の写真を品質チェック対象に
                pass

        # 品質ルール＋品質チェック（p1）
        rule = QualityRule(work_type_id=wtypes["敷設"].id, process_type_id=ptypes["クロージャ設置"].id,
                           asset_type_id=atypes["クロージャ"].id, check_name="ケーブル余長・固定間隔・タグ装着",
                           severity="中", active=True)
        s.add(rule); s.flush()
        photo_rows = s.execute(select(Photo).where(Photo.project_id == p1.id).order_by(Photo.id)).scalars().all()
        q_defs = [
            ("光ケーブル敷設", "ケーブル余長・固定間隔", "注意", "確認待ち", "2026-07-23"),
            ("クロージャ設置", "防水処理・固定状態", "合格", "承認済み", "2026-07-22"),
            ("光ファイバ融着", "接続損失値", "合格", "確認済み", "2026-07-21"),
            ("ONU設置", "ラベル表示・タグ装着", "不合格", "再撮影依頼", "2026-07-22"),
            ("既設設備確認", "撤去前状態記録", "未判定", "情報不足", "2026-07-24"),
            ("接続損失測定", "測定結果記録", "未判定", "未提出", "2026-07-23"),
            ("クロージャ更新", "完成状態", "注意", "警告", "2026-07-24"),
        ]
        for idx, (proc, inspect, judge, st, due) in enumerate(q_defs):
            s.add(QualityCheck(project_id=p1.id, site_id=site.id, task_id=wbs_map["2.4"].id,
                               photo_id=photo_rows[idx].id if idx < len(photo_rows) else None, rule_id=rule.id,
                               inspect_item=inspect, process=proc, judge=judge, status=st,
                               due_date=_d(due), worker_id=users["田中 一郎"].id, checked_by=users["品質 管理者"].id))

        # 日報（p1）＋ 工程/写真 紐付け
        dr1 = DailyReport(project_id=p1.id, site_id=site.id, report_date=date(2026, 7, 21), weather="晴れ時々曇り",
                          temperature="34℃", place="熊本中央局舎 1F MDF室 ／ 局前 電柱区間", crew="第二班",
                          manager_id=users["高橋 誠"].id, start_time="08:00", finish_time="17:00",
                          plan_workers=6, actual_workers=4, worker_count=4,
                          work_description="接続損失測定の継続。局前区間の融着点確認および測定データ記録。ONU設置準備。",
                          process="接続損失測定 / ONU設置", materials="光成端箱 2、パッチコード 12、融着スリーブ 20",
                          tools="OTDR、融着接続機、光パワーメータ", vehicles="高所作業車 1台、資材運搬車 1台",
                          ky_description="高所作業時の墜落防止。フルハーネス着用徹底。交通誘導配置。",
                          hazard="局前道路の通行車両。猛暑による熱中症。", safety_check="実施（朝礼・KY・工具点検）",
                          quality_check="測定値を基準値と照合。1区間で再測定予定。",
                          problem="要員2名が別現場対応のため不足。測定に遅れ。", next_day_plan="ONU設置本格着手。光成端の準備。",
                          note="接続損失測定が予定より遅延。工期予測を要確認。", status="DRAFT")
        dr2 = DailyReport(project_id=p1.id, site_id=site.id, report_date=date(2026, 7, 20), weather="曇り",
                          temperature="31℃", place="熊本中央局舎 局前区間", crew="第二班", manager_id=users["高橋 誠"].id,
                          start_time="08:00", finish_time="16:30", plan_workers=6, actual_workers=6, worker_count=6,
                          work_description="光ファイバ融着完了。接続損失測定開始。", process="光ファイバ融着 / 接続損失測定",
                          checker_id=users["山田 太郎"].id, status="SUBMITTED", submitted_at=datetime(2026, 7, 20, 17, 0))
        s.add_all([dr1, dr2]); s.flush()
        s.add(DailyReportTask(report_id=dr1.id, task_id=wbs_map["3.2"].id))
        s.add(DailyReportTask(report_id=dr1.id, task_id=wbs_map["3.3"].id))
        s.add(DailyReportPhoto(report_id=dr1.id, photo_id=photo_rows[0].id))
        s.add(DailyReport(project_id=projects["KM-2026-003"].id, report_date=date(2026, 7, 21), weather="晴れ",
                          worker_count=8, plan_workers=8, actual_workers=8, manager_id=users["田中 一郎"].id,
                          approver_id=users["田中 一郎"].id, status="APPROVED",
                          work_description="通信管路敷設、ハンドホール据付。"))

        # ===== Ver.0.1.2 業務基盤 =====
        by_name = {p.name: p for p in projects.values()}

        # Task↔Asset（1工程で複数設備・写真アップロード連動用）
        child_wbs = [w for w in wbs_map if "." in w]
        for i, a in enumerate(assets_map.values()):
            for w in child_wbs[i * 2: i * 2 + 3]:
                s.add(TaskAsset(task_id=wbs_map[w].id, asset_id=a.id))

        # 会社・班・資格
        comp_self = Company(name="株式会社SYSKEN 施工管理部", is_partner=False)
        comp_kt = Company(name="協力会社 九州テクノ", is_partner=True)
        comp_hg = Company(name="協力会社 肥後設備", is_partner=True)
        s.add_all([comp_self, comp_kt, comp_hg]); s.flush()
        comp_map = {"施工管理部": comp_self, "九州テクノ": comp_kt, "肥後設備": comp_hg}
        teams = {n: Team(name=n) for n in ["第一班", "第二班", "第三班", "応援"]}
        s.add_all(list(teams.values())); s.flush()

        WORKERS = [
            ("山田 太郎", "施工管理部 第一課", "第一班", "工事長", ["職長・安全衛生責任者", "光ファイバ融着", "普通自動車免許"], "熊本中央局 光設備更改工事", ["稼働", "稼働", "稼働", "稼働", "稼働", "休暇", "休暇"], "稼働", 5, "—", "現場責任者"),
            ("田中 一郎", "施工管理部 第一課", "第一班", "現場責任者", ["高所作業車", "玉掛け", "小型移動式クレーン", "普通自動車免許"], "菊陽町 通信管路敷設工事", ["稼働", "稼働", "稼働", "稼働", "稼働", "稼働", "休暇"], "稼働", 6, "—", "連続勤務注意"),
            ("高橋 誠", "施工管理部 第二課", "第二班", "技術者", ["光ファイバ融着", "低圧電気取扱", "フルハーネス特別教育"], "熊本中央局 光設備更改工事", ["稼働", "稼働", "稼働", "稼働", "稼働", "待機", "休暇"], "稼働", 5, "—", "融着・測定担当"),
            ("鈴木 健", "施工管理部 第三課", "第三班", "技術者", ["電気工事士", "フルハーネス特別教育", "普通自動車免許"], "合志市 基地局設備更新工事", ["稼働", "稼働", "移動中", "稼働", "稼働", "休暇", "休暇"], "移動中", 3, "—", "2現場を兼務"),
            ("佐藤 花子", "施工管理部 第二課", "第二班", "現場責任者", ["職長・安全衛生責任者", "光ファイバ融着", "普通自動車免許"], "八代エリア FTTH増設工事", ["稼働", "稼働", "稼働", "稼働", "稼働", "休暇", "休暇"], "稼働", 5, "—", ""),
            ("伊藤 直樹", "施工管理部 第一課", "第一班", "技術者", ["高所作業車", "玉掛け", "低圧電気取扱"], "熊本市東区 光ケーブル切替工事", ["稼働", "稼働", "稼働", "稼働", "稼働", "待機", "休暇"], "稼働", 4, "—", "切替作業担当"),
            ("渡辺 修", "施工管理部 第三課", "第三班", "現場責任者", ["職長・安全衛生責任者", "酸素欠乏危険作業", "普通自動車免許"], "天草地区 通信設備復旧工事", ["稼働", "稼働", "稼働", "稼働", "稼働", "稼働", "待機"], "稼働", 7, "要調整", "連続7日 過剰勤務警告"),
            ("中村 亮", "施工管理部 第二課", "第二班", "技術者", ["高所作業車", "フルハーネス特別教育", "普通自動車免許"], "待機", ["待機", "待機", "稼働", "稼働", "稼働", "休暇", "休暇"], "待機", 0, "—", "配置可能"),
            ("小林 大輔", "協力会社 九州テクノ", "応援", "作業員", ["光ファイバ融着", "玉掛け"], "待機", ["待機", "稼働", "稼働", "稼働", "稼働", "休暇", "休暇"], "待機", 0, "—", "融着応援可"),
            ("加藤 隆", "協力会社 肥後設備", "応援", "作業員", ["高所作業車", "交通誘導"], "菊陽町 通信管路敷設工事", ["稼働", "稼働", "稼働", "待機", "稼働", "休暇", "休暇"], "稼働", 3, "—", ""),
            ("吉田 昇", "施工管理部 第一課", "第一班", "作業員", ["玉掛け", "普通自動車免許"], "熊本中央局 光設備更改工事", ["稼働", "稼働", "稼働", "稼働", "稼働", "休暇", "休暇"], "稼働", 5, "—", ""),
            ("松本 康", "施工管理部 第三課", "第三班", "作業員", ["酸素欠乏危険作業", "普通自動車免許"], "休暇", ["休暇", "休暇", "稼働", "稼働", "稼働", "稼働", "休暇"], "休暇", 0, "7/21-7/22", "有給休暇"),
        ]
        qual_cache: dict[str, Qualification] = {}
        for nm, org, crew, role, lics, assigned, sched, st, cont, vac, note in WORKERS:
            comp = comp_kt if "九州テクノ" in org else comp_hg if "肥後設備" in org else comp_self
            w = Worker(user_id=(users[nm].id if nm in users else None), name=nm, org=org, company_id=comp.id,
                       team_id=teams[crew].id, role=role, status=st, continuous_days=cont, vacation=vac, note=note,
                       schedule=json.dumps(sched, ensure_ascii=False))
            s.add(w); s.flush()
            for lic in lics:
                if lic not in qual_cache:
                    q = Qualification(name=lic); s.add(q); s.flush(); qual_cache[lic] = q
                exp = date(2026, 8, 20) if lic == "高所作業車" else None
                s.add(WorkerQualification(worker_id=w.id, qualification_id=qual_cache[lic].id,
                                          acquired_at=date(2024, 4, 1), expires_at=exp))
            if assigned in by_name:
                s.add(WorkerAssignment(worker_id=w.id, project_id=by_name[assigned].id,
                                       assigned_from=date(2026, 7, 1), role=role, status=st))

        # 工程の担当会社（横断工程表の「担当会社別」表示用）。
        # 会社名が同一でも別レコード（別法人格）を区別できるよう、名前ではなくIDで割り当てる。
        COMPANY_KEYS = {
            "施工管理部": comp_self,
            "九州テクノ": partner,          # 既存の「協力会社 九州テクノ」
            "九州テクノ（別法人格）": comp_kt,  # 同名だが別レコード（ID基準の集約確認用）
            "肥後設備": comp_hg,
        }

        # p1 の工程にも担当会社を割り当てる（親工程は自社、敷設・接続は協力会社）
        for wbs, t in wbs_map.items():
            head = wbs.split(".")[0]
            t.company_id = (partner if head in ("2", "3") and "." in wbs else comp_self).id

        # 工程（p1 以外）— 横断工程表は複数案件を横断表示するため各案件に工程が必要
        for code, rows in CROSS_TASKS.items():
            p = projects[code]
            local: dict[str, Task] = {}
            for wbs, name, wt, pt, ps, pe, as_, ae, prog, pw, aw, st, mgr, comp_key in rows:
                parent_id = local[wbs.split(".")[0]].id if "." in wbs else None
                t = Task(
                    project_id=p.id, parent_task_id=parent_id, wbs_code=wbs, name=name,
                    work_type_id=wtypes[wt].id if wt in wtypes else None,
                    process_type_id=ptypes[pt].id if pt in ptypes else None,
                    planned_start_at=_dt_half_start(ps), planned_finish_at=_dt_half_end(pe),
                    actual_start_at=_dt_half_start(as_), actual_finish_at=_dt_half_end(ae),
                    planned_progress=prog, actual_progress=prog, planned_workers=pw, actual_workers=aw,
                    manager_id=users[mgr].id if mgr else None,
                    company_id=COMPANY_KEYS[comp_key].id if comp_key else None,
                    status=st, schedule_precision=_precision_of(ps, pe, as_, ae),
                )
                s.add(t); s.flush(); local[wbs] = t
            # 同一階層の工程は前工程に依存（横断工程表でも依存線を確認できるようにする）
            children = [w for w in local if "." in w]
            for i in range(1, len(children)):
                prev, cur = local[children[i - 1]], local[children[i]]
                if prev.wbs_code.split(".")[0] == cur.wbs_code.split(".")[0]:
                    s.add(TaskDependency(task_id=cur.id, depends_on_task_id=prev.id))

        # 工事台帳（projects基本＋台帳固有項目）
        billing = ["未請求", "請求済", "入金済", "一部入金", "未請求", "請求済", "未請求", "未請求"]
        docs_status = ["作成中", "完了", "完了", "未着手", "確認中", "作成中", "未着手", "未着手"]
        for i, pr in enumerate(PROJECTS):
            p = projects[pr["code"]]
            s.add(ProjectLedger(project_id=p.id, contract_no=f"C-{pr['code'][3:]}",
                                cost_planned=pr["bp"], cost_actual=pr["bu"],
                                billing_status=billing[i % len(billing)], document_status=docs_status[i % len(docs_status)]))

        # 図面・書類（版管理）
        DRAWINGS = [
            ("DWG-001", "熊本中央局 局内配線系統図", "系統図", "Rev.3", "山田 太郎", "承認済み"),
            ("DWG-002", "局前 光ケーブル敷設平面図", "平面図", "Rev.2", "田中 一郎", "承認済み"),
            ("DWG-003", "クロージャ接続図", "接続図", "Rev.1", "高橋 誠", "確認中"),
            ("DWG-004", "MDF室 ラック実装図", "実装図", "Rev.2", "鈴木 健", "承認済み"),
            ("DWG-005", "切替手順図", "手順図", "Rev.1", "伊藤 直樹", "差し戻し"),
            ("DWG-006", "完成図（全体）", "完成図", "Rev.0", "山田 太郎", "未提出"),
        ]
        for no, name, dtype, rev, editor, appr in DRAWINGS:
            eid = users[editor].id if editor in users else None
            d = Document(project_id=p1.id, doc_no=no, name=name, doc_type=dtype, status=appr, current_rev=rev, updated_by=eid)
            s.add(d); s.flush()
            rn = int(rev.split(".")[1])
            for r in range(rn + 1):
                # 最新版には実ファイル（PDF/PNG）を付与しブラウザ閲覧を可能にする
                fp = fname = None
                if r == rn:
                    if no in ("DWG-001", "DWG-003", "DWG-006"):
                        fp = f"documents/seed/{no}.pdf"; fname = f"{no}.pdf"
                        get_storage().save(fp, _sample_pdf(f"{no} {name}"), "application/pdf")
                    elif no in ("DWG-002", "DWG-004"):
                        fp = f"documents/seed/{no}.png"; fname = f"{no}.png"
                        get_storage().save(fp, _sample_png(no), "image/png")
                s.add(DocumentVersion(document_id=d.id, rev=f"Rev.{r}", file_path=fp,
                                      original_filename=fname or f"{no}_r{r}.dwg",
                                      note=("初版" if r == 0 else f"改訂{r}"), updated_by=eid))

        # 資材（materials / project_materials）
        MATERIALS = [
            ("光成端箱", "M-001", "OTB-24", "住友電工", "台", 4, 2, "入荷済", "2.3"),
            ("パッチコード", "M-002", "SC/APC 2m", "フジクラ", "本", 24, 12, "入荷済", "2.3"),
            ("融着スリーブ", "M-003", "60mm", "住友電工", "個", 60, 40, "使用中", "2.4"),
            ("クロージャ", "M-004", "中容量", "古河電工", "台", 3, 3, "消費済", "2.2"),
            ("ケーブル固定金具", "M-005", "汎用", None, "個", 40, 28, "使用中", "2.1"),
        ]
        for mname, mcode, model, maker, unit, plan, used, mst, wbs in MATERIALS:
            mat = Material(code=mcode, name=mname, model_number=model, manufacturer=maker, unit=unit)
            s.add(mat); s.flush()
            s.add(ProjectMaterial(project_id=p1.id, material_id=mat.id, task_id=(wbs_map[wbs].id if wbs in wbs_map else None),
                                  qty_planned=plan, qty_used=used, arrival_planned=date(2026, 6, 25),
                                  arrival_actual=(date(2026, 6, 26) if mst != "未入荷" else None), status=mst))

        # 試験記録（光工事）
        asset_list = list(assets_map.values())
        TESTS = [
            ("光損失測定", "0.28", "dB", "≤0.5dB", "合格", "光パワーメータ PM-200", "2.3", 0, "区間A 良好"),
            ("OTDR", "0.31", "dB", "≤0.5dB", "合格", "OTDR AQ7280", "2.3", 1, "反射・損失異常なし"),
            ("導通確認", "OK", "—", "導通あり", "合格", "光源・受光器", "2.4", 2, "全芯導通確認"),
            ("光損失測定", "0.62", "dB", "≤0.5dB", "不合格", "光パワーメータ PM-200", "2.4", 3, "基準超過。再融着予定"),
        ]
        for ttype, val, unit, std, judge, instr, wbs, ai, comment in TESTS:
            s.add(TestRecord(project_id=p1.id, site_id=site.id,
                             asset_id=asset_list[ai % len(asset_list)].id if asset_list else None,
                             task_id=wbs_map[wbs].id if wbs in wbs_map else None,
                             test_type=ttype, measured_at=datetime(2026, 7, 20, 10 + ai, 15),
                             tester_id=users["田中 一郎"].id, measured_value=val, unit=unit, standard_value=std,
                             judge=judge, instrument=instr, comment=comment))

        # 通知
        NOTIFS = [
            ("工程遅延", "接続損失測定が遅延しています", "熊本中央局 光設備更改工事の「接続損失測定」が予定より2日遅延しています。要員不足が原因です。", "熊本中央局 光設備更改工事", "2026/07/21 11:05", False, True, "/schedule"),
            ("写真未提出", "施工写真が未提出です", "接続損失測定の測定結果写真が未提出です（提出期限 7/23）。", "熊本中央局 光設備更改工事", "2026/07/21 11:00", False, True, "/photos"),
            ("再撮影依頼", "ONU設置写真の再撮影依頼", "設備タグ未装着のため再撮影を依頼しました。", "熊本中央局 光設備更改工事", "2026/07/21 09:32", False, False, "/quality"),
            ("品質確認待ち", "品質確認待ちが7件あります", "ケーブル余長・固定間隔ほか、確認待ち項目があります。", "熊本中央局 光設備更改工事", "2026/07/21 10:15", False, False, "/quality"),
            ("承認依頼", "現場日報の承認依頼", "7/20の日報が提出されました。確認・承認をお願いします。", "熊本中央局 光設備更改工事", "2026/07/21 08:20", True, False, "/daily-report"),
            ("資格期限接近", "高所作業車 特別教育の期限接近", "田中 一郎の資格更新期限が近づいています（残り30日）。", None, "2026/07/21 07:50", True, False, "/personnel"),
            ("要員重複", "要員の重複配置の可能性", "鈴木 健が2案件に重複配置されています。調整してください。", "合志市 基地局設備更新工事", "2026/07/20 18:10", True, False, "/personnel"),
            ("図面更新", "切替手順図が差し戻されました", "DWG-005 切替手順図が差し戻されました。修正が必要です。", "熊本中央局 光設備更改工事", "2026/07/21 08:06", False, False, "/drawings"),
            ("天候注意", "強風注意報", "本日午後、南の風やや強く 最大7m/s。高所作業に注意してください。", None, "2026/07/21 06:30", True, False, "/dashboard"),
            ("日報未提出", "日報未提出があります", "天草地区 通信設備復旧工事の7/20日報が未提出です。", "天草地区 通信設備復旧工事", "2026/07/20 20:00", True, False, "/daily-report"),
        ]
        for kind, title, body, projname, at, read, imp, link in NOTIFS:
            pid = by_name[projname].id if projname and projname in by_name else None
            s.add(Notification(user_id=None, kind=kind, title=title, body=body, project_id=pid,
                               target_url=link, is_read=read, important=imp,
                               created_at=datetime.strptime(at, "%Y/%m/%d %H:%M")))

        # 開発用フィクスチャであることを内部的に識別できるマーカー（既存 audit_logs を利用・スキーマ変更なし）
        s.add(AuditLog(user_id=None, action="SEED", entity_type="dev_fixture", entity_id=SEED_FIXTURE_VERSION,
                       after=json.dumps({"app_env": settings.app_env, "note": "development seed fixture — not production data"}, ensure_ascii=False)))
        s.commit()
        print("Seed 完了（開発用フィクスチャ）:")
        cross_count = sum(len(v) for v in CROSS_TASKS.values())
        print(f"  ユーザー {len(users)}名 / 案件 {len(projects)}件 / 工程 {len(TASKS) + cross_count}件"
              f"（うち他案件 {cross_count}件）/ 写真 27枚 / 品質 7 / 日報 3")
        print(f"  要員 {len(WORKERS)} / 図面 {len(DRAWINGS)} / 通知 {len(NOTIFS)} / 台帳 {len(PROJECTS)}")
        print(f"  資材 {len(MATERIALS)} / 試験記録 {len(TESTS)}")
        print(f"  fixture={SEED_FIXTURE_VERSION} / APP_ENV={settings.app_env}")
        print(f"  管理者ログイン: {settings.seed_admin_email} / {settings.seed_admin_password}")


if __name__ == "__main__":
    run(reset_first="--reset" in sys.argv, allow_production="--force-production" in sys.argv)
    engine.dispose()
