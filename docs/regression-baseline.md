# 回帰確認の基準（Phase 0）

大きな改修（横断工程表・カレンダー・現場連絡など）の前後で、既存機能が
壊れていないことを同じ手順で確認するための基準。

## 1. 品質ゲート（コマンド）

| ゲート | コマンド | 基準値（Phase 0 時点） |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | エラー 0 |
| ESLint | `npm run lint` | **エラー 0**（警告は Badge.tsx の HMR 警告 1件のみ） |
| production build | `npm run build` | 成功（bundle 500kB超の警告は既知） |
| 時間軸エンジン | `npm run test:timeline` | **21 passed / 0 failed** |
| Backend テスト | `cd backend && python -m pytest` | **43 passed** |

## 2. 画面の回帰確認（実ブラウザ）

```bash
# Backend 起動（別ターミナル）
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000
# Frontend をビルドして配信
npm run build && npm run preview -- --host 127.0.0.1 --port 4173

# 改修前に基準を取得 → 改修後に同じコマンドで比較
npm i -D playwright   # 未導入の場合のみ
PW_CHROME=<chromeのパス> node scripts/e2e-regression.mjs --out /tmp/baseline
PW_CHROME=<chromeのパス> node scripts/e2e-regression.mjs --out /tmp/after
```

`scripts/e2e-regression.mjs` はログイン後に全主要ルートを開き、
スクリーンショット・コンソールエラー・失敗HTTPリクエストを `summary.json` に記録する。

### 基準値（Phase 0 時点・1920×1080）

| ルート | 確認内容 |
|---|---|
| `/dashboard` | KPI 8種・案件別進捗・遅延/注意案件・通知が表示。天候は「未連携」 |
| `/projects` | 案件一覧（8件）が表示 |
| `/projects/1` | 案件詳細・タブ切替 |
| `/schedule` | WBS＋ガント。バー・依存線・今日線・土日/祝の着色 |
| `/photos` | 写真一覧・AI解析結果（未解析時は Empty State） |
| `/drawings` | 図面一覧＋PDF/画像プレビュー。未登録は Empty State |
| `/quality` | 品質チェック一覧・試験記録 |
| `/daily-report` | 日報の一覧・編集フォーム |
| `/personnel` | 要員一覧・案件配置 |
| `/ledger` | 工事台帳 |
| `/reports` | 帳票選択・プレビュー |
| `/notifications` | 通知一覧 |
| `/settings` | 設定タブ |

**合格条件: コンソールエラー 0 / 失敗リクエスト 0 / 全ルートが描画される。**

## 3. 工程表の座標検証（Phase 0 で追加）

日付→座標の計算は `src/lib/timeline.ts` に集約している。ヘッダーの列とバーは
同じ `timeline.slots` を参照するため、構造的にずれない。

`npm run test:timeline` が検証する内容:

- 日スケールで列数・列幅・`totalWidth` が一致する
- バー幅が「終了日を含む日数 × 列幅」になる
- 0.5日（AM/PM）の工程でも最小幅（`MIN_BAR_WIDTH`）以上で描画される
- 月スケールで、2月のように長さが違う月でも位置が正しい（列内の按分）
- 3時間スケールで 1日 = 8列になる
- タイムゾーンが Asia/Tokyo に統一される（UTC 15:00 = JST 翌日 0:00）
- 表示範囲外の工程は描画しない（`visible: false`）
- 工程が 0 件でも有効な表示範囲を返す

### 実ブラウザでの実測（Phase 0 実施結果）

- 各バーの幅が `(終了日 − 開始日 + 1) × 列幅` と一致
  （06-01〜06-03 = 102px = 3日 × 34px など）
- バー間の距離が日数と一致（06-03 → 06-08 が 170px = 5日）
- 「本日」線が 06-01 から 60.47 日の位置。06-01 → 07-31 は 60 日で、
  端数は実行時刻（JST 11:33）に対応 → バーと今日線が同一基準で正しい

## 4. Phase 0 で意図的に変わった点（回帰ではない）

| 変更 | 変更前 | 変更後 |
|---|---|---|
| 「今日」 | `2026-07-21` の固定値 | 実際の現在日（JST） |
| 表示期間 | `2026-06-01`〜`2026-08-12` の固定値 | 工程の実期間＋前後7日（今日を含む） |
| 今日線の位置 | 日の中央に固定 | 実時刻の位置 |
| 進行中工程の実績バー | 固定の「今日」まで | 実際の今日まで |

これらは「固定値の撤廃」が目的の変更であり、レイアウト・配色・列構成・
バーの見た目・操作は変更していない。
