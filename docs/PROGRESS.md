# PROGRESS（現在状態の正）

> このファイルが**現在状態の正**。仕様の正は `docs/MASTER_SPEC.md`。
> 次回セッションは過去チャットではなく **docs を参照**して続きから作業する。

## 開発ルール（トークン消費を最小化）

- 毎回リポジトリ全体を再調査しない
- `docs/MASTER_SPEC.md` を仕様の正とする
- `docs/PROGRESS.md` を現在状態の正とする
- 作業対象に必要なファイルだけ確認する
- 関係ない機能へ変更を広げない
- 既存UIを再解析し直さない
- 大規模リファクタリングを避ける
- 既に完了した内容を再説明しない
- 作業後は PROGRESS.md へ**差分だけ**追記する
- 次回作業を 1〜3 項目で記録する
- 完了報告は「実装内容 / テスト / 残課題 / 次の作業」のみ・各項目簡潔に

## 現在のバージョン

Ver.0.1（実用システム基盤）完了。ブランチ `claude/session-rkd93u`。

## 完了済み（要点のみ）

- フロント（React/TS/Vite/Tailwind/Router/Recharts/date-fns）：全15画面＋ログイン。デザイン=SYSKEN青/白/グレー、1920×1080固定
- 認証：JWT/bcrypt、5ロール、案件スコープ（API側認可）、監査ログ
- Backend（`/backend` FastAPI+SQLAlchemy2+Alembic+PostgreSQL）：案件/現場/設備/マスタ6/工程(履歴)/写真メタ/品質/日報/AI骨格
- AI：DB・APIの骨格のみ（推論未実装、`analyze`はジョブQUEUED登録のみ）
- ファイルアップロード（ローカル/S3抽象・Pillowサムネ）、Seed（ユーザー11/案件8/工程25/写真27）
- フロントAPI接続：ログイン・案件一覧・案件詳細・工程管理(読)。他画面はダミー維持
- インフラ/docs：docker-compose、Dockerfile、docs一式、README、.env.example
- テスト：pytest 10件通過、フロント build 成功、ブラウザE2E確認済み

## 残課題（未実装・設計は MASTER_SPEC 参照）

- テーブル未実装：要員(workers/teams/qualifications/…)、資材、試験記録、図面版管理(documents/document_versions)、通知、weather_records
- フロント未API化：施工写真・品質・日報・要員・工事台帳・報告書・図面・通知・ダッシュボード集計
- AI実推論（YOLO/ViT/OCR/RAG/LLM/工期予測）と AI Worker（`ai_analysis_jobs`購読→`ai_predictions`書込）
- 帳票のPDF/Excel実出力

## 次回作業（1〜3項目）

1. 施工写真画面のAPI化（`/photos` GET/POST接続、既存UI維持）
2. AI Worker雛形（ジョブ購読→ダミー`ai_predictions`書込→写真/品質画面へ接続）
3. 品質・日報画面のAPI化

## 変更ログ（差分のみ追記）

- 2026-07-23 Ver.0.1 完了（backend基盤・認証・案件/工程API・Seed・docs・テスト）
- 2026-07-23 開発ルールを追記、MASTER_SPEC.md / PROGRESS.md を新設
