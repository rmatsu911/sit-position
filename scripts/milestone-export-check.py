"""横断マイルストーンの「画面／Excel／PDF」の件数・条件一致を実測する。

画面が使う API（/schedule/milestones と /summary）と、出力 API
（/schedule/milestones/export）を同じ絞り込み条件で呼び、
- 登録済み件数
- 未設定候補件数
- 並び順（1行目・最終行）
- 出力に載る条件・出力者・出力日時・計算基準日
が一致することを確認する。Excel は openpyxl、PDF は内容ストリームを
展開して Identity-H のテキストを取り出して読む（外部依存を増やさない）。

実行: backend/.venv/bin/python scripts/milestone-export-check.py
"""
from __future__ import annotations

import base64
import io
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
import zlib

BASE = os.environ.get("E2E_API_BASE", "http://localhost:8000/api")
EMAIL = os.environ.get("E2E_EMAIL", "admin@example.co.jp")
PASSWORD = os.environ.get("E2E_PASSWORD", "Passw0rd!")
VIEWER_EMAIL = os.environ.get("E2E_VIEWER_EMAIL", "verify.viewer@example.co.jp")

# 5権限。VIEWER はシードにいないため scripts/verify-fixtures.py で一時作成する。
ROLE_ACCOUNTS = [
    ("admin@example.co.jp", "ADMIN"),
    ("yamada@example.co.jp", "PROJECT_MANAGER"),
    ("partner@example.co.jp", "FIELD_WORKER（割当あり）"),
    ("tanaka@example.co.jp", "FIELD_WORKER（割当なし）"),
    ("quality@example.co.jp", "QUALITY_MANAGER"),
    (VIEWER_EMAIL, "VIEWER"),
]

passed = 0
failed = 0


def ok(cond: bool, name: str, extra: str = "") -> None:
    global passed, failed
    if cond:
        passed += 1
        print(f"  PASS {name}" + (f" ({extra})" if extra else ""))
    else:
        failed += 1
        print(f"  FAIL {name} {extra}")


def call(path: str, token: str | None = None, method: str = "GET", body: dict | None = None) -> bytes:
    req = urllib.request.Request(BASE + path, method=method)
    payload = None
    if body is not None:
        req.add_header("Content-Type", "application/json")
        payload = json.dumps(body).encode()
    if token:
        req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, payload) as res:
        return res.read()


def login(email: str, password: str) -> str:
    return json.loads(call("/auth/login", method="POST", body={"email": email, "password": password}))["access_token"]


# ===== PDF テキスト抽出（reportlab: ASCII85 + Flate、CIDフォントは UTF-16BE） =====
_ESCAPES = {b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b", b"f": b"\f",
            b"(": b"(", b")": b")", b"\\": b"\\"}


def _unescape(raw: bytes) -> bytes:
    out = bytearray()
    i = 0
    while i < len(raw):
        c = raw[i:i + 1]
        if c != b"\\":
            out += c
            i += 1
            continue
        nxt = raw[i + 1:i + 2]
        if nxt in _ESCAPES:
            out += _ESCAPES[nxt]
            i += 2
        elif nxt.isdigit():
            digits = raw[i + 1:i + 4]
            digits = digits[:len(digits) - len([d for d in digits if not d in b"01234567"])]
            out += bytes([int(digits, 8) & 0xFF])
            i += 1 + len(digits)
        else:
            out += nxt
            i += 2
    return bytes(out)


def pdf_text(data: bytes) -> str:
    chunks: list[str] = []
    for m in re.finditer(rb"stream\n(.*?)endstream", data, re.S):
        try:
            body = zlib.decompress(base64.a85decode(m.group(1).strip(b"\r\n"), adobe=True))
        except Exception:
            continue
        for s in re.finditer(rb"\((?:[^()\\]|\\.)*\)\s*Tj", body, re.S):
            raw = _unescape(s.group(0).rsplit(b")", 1)[0][1:])
            if len(raw) % 2:
                raw += b"\x00"
            try:
                chunks.append(raw.decode("utf-16-be"))
            except UnicodeDecodeError:
                continue
    return "\n".join(chunks)


def pdf_flat(data: bytes) -> str:
    """PDFは折り返しで文字列が分割されるため、空白を落として突き合わせる。"""
    return re.sub(r"\s+", "", pdf_text(data))


def flat(value: str) -> str:
    return re.sub(r"\s+", "", value)


def pdf_pages(data: bytes) -> int:
    m = re.search(rb"/Count (\d+) /Kids", data)
    return int(m.group(1)) if m else 0


def xlsx_rows(data: bytes) -> list[list[str]]:
    from openpyxl import load_workbook
    wb = load_workbook(io.BytesIO(data), read_only=True)
    ws = wb[wb.sheetnames[0]]
    return [["" if c is None else str(c) for c in row] for row in ws.iter_rows(values_only=True)]


HEADER = ["区分", "案件番号", "案件名", "マイルストーン名"]


def data_rows(rows: list[list[str]]) -> list[list[str]]:
    """見出し行（区分…）より後ろの明細行だけを取り出す。"""
    for i, row in enumerate(rows):
        if row[:4] == HEADER:
            return [r for r in rows[i + 1:] if any(v for v in r)]
    return []


CASES: list[tuple[str, str, dict]] = [
    ("条件なし（全件）", "", {}),
    ("案件2件＋種別1件", "project_ids=1,2&milestone_type_ids=5", {}),
    ("期限超過のみ", "overdue_only=true", {}),
    ("近日予定のみ（14日）", "due_soon_only=true&due_soon_days=14", {}),
    ("日程矛盾のみ", "conflict_only=true", {}),
    ("実績未入力のみ", "actual=missing", {}),
    ("案件詳細ルート（project_id=1）", "project_id=1", {}),
    ("種別別グループ", "group=type", {}),
    ("上限1件（truncated）", "limit=1", {}),
    ("0件になる条件", "q=" + urllib.request.quote("該当なしのはず"), {}),
]

print("== 画面API / Excel / PDF の件数・条件一致 ==")
token = login(EMAIL, PASSWORD)

for label, query, _ in CASES:
    q = ("?" + query) if query else ""
    listed = json.loads(call(f"/schedule/milestones{q}", token))
    summary = json.loads(call(f"/schedule/milestones/summary{q}", token))
    xlsx = call(f"/schedule/milestones/export?format=xlsx" + (f"&{query}" if query else ""), token)
    pdf = call(f"/schedule/milestones/export?format=pdf" + (f"&{query}" if query else ""), token)

    xrows = data_rows(xlsx_rows(xlsx))
    screen = listed["returned_count"] + listed["candidate_count"]
    ok(len(xrows) == screen,
       f"{label}: Excel の明細行 = 画面の表示件数", f"Excel {len(xrows)} / 画面 {screen}")
    ok(summary["registered_count"] == listed["registered_count"]
       and summary["candidate_count"] == listed["candidate_count"],
       f"{label}: /summary と一覧の件数が一致",
       f"{summary['registered_count']}+{summary['candidate_count']}")

    text = pdf_flat(pdf)
    ok(flat(f"{listed['registered_count']} 件（出力 {listed['returned_count']} 件）") in text,
       f"{label}: PDF に登録済み件数を明記", f"{listed['registered_count']}/{listed['returned_count']}")
    ok(flat(f"未設定候補：{listed['candidate_count']} 件") in text, f"{label}: PDF に未設定候補件数を明記")
    ok("出力者" in text and "ADMIN" in text, f"{label}: PDF に出力者")
    ok(listed["calculated_at"] in text, f"{label}: PDF に計算基準日", listed["calculated_at"])
    ok("AI" not in text.replace("ADMIN", ""), f"{label}: PDF に「AI予測」表記がない")

    # 明細の並び順が画面と一致すること（先頭・末尾の登録済み行で確認）
    if listed["milestones"]:
        first = listed["milestones"][0]
        ok(xrows[0][1] == first["project_number"] and xrows[0][3] == first["name"],
           f"{label}: Excel 1行目が画面の先頭と一致", f"{xrows[0][1]} {xrows[0][3]}")
        last = listed["milestones"][-1]
        idx = listed["returned_count"] - 1
        ok(xrows[idx][1] == last["project_number"] and xrows[idx][3] == last["name"],
           f"{label}: Excel 最終登録行が画面の末尾と一致", f"{xrows[idx][1]} {xrows[idx][3]}")
    # 未設定候補は「（未設定）」として登録済みと区別する
    if listed["candidate_count"]:
        cand = xrows[listed["returned_count"]:]
        ok(all(r[3] == "（未設定）" for r in cand),
           f"{label}: Excel の未設定候補を登録済みと区別", f"{len(cand)} 行")
        ok(all(r[4] == "—" and r[5] == "—" for r in cand),
           f"{label}: 未設定候補に架空の日付を書かない")
    if listed["truncated"]:
        ok(flat(f"上限 {listed['limit']} 件で打ち切っています（該当 {listed['total']} 件）") in text,
           f"{label}: PDF に打ち切りを明記")
    ok(pdf_pages(pdf) >= 1, f"{label}: PDF が生成される", f"{pdf_pages(pdf)} ページ / {len(pdf)} バイト")

print("== 出力に載る検索条件が画面の条件と1対1 ==")
cond_query = "project_ids=1,2&milestone_type_ids=5&responsible_ids=1&company_ids=1&statuses=" \
    + urllib.request.quote("予定") + "&actual=missing&overdue_only=true&due_soon_days=14&date_from=2026-01-01&date_to=2026-12-31"
pdf = call(f"/schedule/milestones/export?format=pdf&{cond_query}", token)
text = pdf_flat(pdf)
for label, value in [("案件ID", "1, 2"), ("種別ID", "5"), ("担当者ID", "1"), ("担当会社ID", "1"),
                     ("状態(DB)", "予定"), ("実績", "未入力のみ"), ("期限超過のみ", "はい"),
                     ("近日予定の日数", "14 日以内"), ("予定日", "2026-01-01 〜 2026-12-31")]:
    ok(flat(label) in text and flat(value) in text, f"PDF に条件「{label}」を記載", value)

print("== 権限ごとの出力件数（スコープ外を含めない） ==")
# VIEWER はシードにいないため、この確認の間だけ用意して最後に消す
subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "verify-fixtures.py"),
                "viewer-add"], check=True)
for email, role in ROLE_ACCOUNTS:
    try:
        t = login(email, PASSWORD)
    except urllib.error.HTTPError as e:
        ok(False, f"{role}: ログイン", str(e))
        continue
    listed = json.loads(call("/schedule/milestones", t))
    xrows = data_rows(xlsx_rows(call("/schedule/milestones/export?format=xlsx", t)))
    ok(len(xrows) == listed["returned_count"] + listed["candidate_count"],
       f"{role}: Excel と画面の件数一致",
       f"登録済み {listed['registered_count']} / 候補 {listed['candidate_count']}")

subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "verify-fixtures.py"),
                "viewer-remove"], check=True)

print(f"\n合計 {passed + failed} 件: PASS {passed} / FAIL {failed}")
sys.exit(1 if failed else 0)
