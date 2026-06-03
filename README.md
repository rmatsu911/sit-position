# 宴会座席抽選

スマホから同じ抽選画面を見られる座席抽選アプリです。管理者画面でメンバーと固定席を設定し、抽選結果をLINEグループへ自動送信できます。

## ローカル起動

```bash
npm install
npm start
```

起動後に表示されるURLへアクセスします。

- 抽選ページ: `http://localhost:3000/`
- 管理者画面: `http://localhost:3000/admin.html`
- ホストURL: `http://localhost:3000/?host=...`

抽選開始やLINE設定保存はホストトークンが必要です。ホストURLを一度開くと、このブラウザにトークンが保存されます。

## LINE Bot連携

1. LINE DevelopersでMessaging APIチャンネルを作成します。
2. チャンネルアクセストークンとチャンネルシークレットを取得します。
3. Webhook URLを `https://公開URL/webhook` に設定します。
4. BotをLINEグループに追加します。
5. 管理者画面の「LINE Bot 連携」で設定を保存します。

画像で送信するには、RenderなどHTTPSで外部公開されているURLを「サーバー公開URL」に入力してください。未入力の場合はFlexメッセージで送信します。

## Render環境変数

Renderにデプロイする場合は、必要に応じて以下を設定します。

| 変数名 | 内容 |
| --- | --- |
| `HOST_TOKEN` | 管理者操作用の任意文字列 |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINEのチャンネルアクセストークン |
| `LINE_CHANNEL_SECRET` | LINEのチャンネルシークレット |
| `LINE_GROUP_ID` | 送信先グループID |
| `LINE_PUBLIC_URL` | Renderの公開URL |

## Render + Xserverで公開する流れ

1. このプロジェクトをGitHubへpushします。
2. Renderで「New Web Service」を作成し、GitHubリポジトリを接続します。
3. Build Commandは `npm install`、Start Commandは `npm start` にします。
4. Renderの公開URLを確認します。例: `https://sit-position.onrender.com`
5. `xserver/index.php` と `xserver/webhook.php` 内の `YOUR-RENDER-APP.onrender.com` をRenderのURLへ変更します。
6. Xserverの `public_html` に `xserver/index.php` をアップロードします。
7. LINE DevelopersのWebhook URLは、確実性優先なら `https://RenderのURL/webhook`、Xserver経由にしたい場合は `https://xxxtrw77777.xsrv.jp/webhook.php` を設定します。

Xserver側は入口ページです。アプリ本体、リアルタイム同期、LINE送信、画像生成はRender側で動きます。
