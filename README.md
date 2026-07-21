# 業務管理システム（Business Console）

React + TypeScript + Vite で構築した、Windows PC 向けの業務Webアプリです。案件・メンバー・スケジュール・売上レポートを一画面で管理するダッシュボードを備えています。

> 本アプリはフロントエンドのみで動作します。バックエンド／データベース／API接続は無く、すべてダミーデータで表示しています。

## 技術構成

| 分類 | 使用技術 |
| --- | --- |
| フレームワーク | React 18 |
| 言語 | TypeScript |
| ビルドツール | Vite 6 |
| スタイリング | Tailwind CSS 3 |
| ルーティング | React Router 7 |
| アイコン | Lucide React |
| グラフ | Recharts 2 |
| 日付処理 | date-fns 4 |

## 前提

- Node.js 18 以上
- 画面は **1920×1080 の Windows PC 向け固定レイアウト**（`.app-canvas` で 1920×1080 に固定）
- UI はすべて日本語

## セットアップ

```bash
npm install
```

## 開発サーバー起動

```bash
npm run dev
```

表示された URL（既定 `http://localhost:5173/`）にアクセスします。

## 本番ビルド

```bash
npm run build      # 型チェック(tsc) + Viteビルド。出力先は dist/
npm run preview    # ビルド結果のローカルプレビュー
```

## 画面構成

| ルート | 画面 | 内容 |
| --- | --- | --- |
| `/` | ダッシュボード | KPIカード、月次売上推移、案件カテゴリ構成、期限が近いタスク、進行中案件 |
| `/projects` | 案件管理 | 案件一覧テーブル（ステータス絞り込み・進捗バー） |
| `/members` | メンバー | メンバーカード一覧（部署・稼働状況） |
| `/schedule` | スケジュール | 月間カレンダー（date-fns）と今後の予定 |
| `/reports` | レポート | 売上 vs 目標、週間アクティビティのグラフ |
| `/settings` | 設定 | プロフィール・通知・表示設定 |

## ディレクトリ構成

```
src/
├── main.tsx              エントリーポイント（BrowserRouter）
├── App.tsx              レイアウト＋ルーティング
├── index.css           Tailwind＋固定レイアウト用スタイル
├── types.ts            型定義
├── data/mockData.ts    ダミーデータ
├── lib/format.ts       金額・日付フォーマット（date-fns）
├── components/         Sidebar / Topbar / 共通UI
└── pages/              各画面
```

## ダミーデータについて

すべての表示内容は `src/data/mockData.ts` に定義した静的データです。実データと連携する場合は、このファイルを差し替えるか、各ページのデータ取得箇所を API 呼び出しに置き換えてください。
