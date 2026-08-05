/**
 * デプロイ設定の監査。
 *
 *   node scripts/deploy-config-audit.mjs
 *
 * 公開環境に「架空の業務データ」や「既知パスワードの利用者」を作ってしまう設定へ
 * 戻っていないかを見る。以前 render.yaml は起動時に `--force-production` を
 * 指定しており、架空の案件8件と、全員が同じパスワードの利用者10名を
 * 公開環境へ投入する状態だった。
 */
import { readFileSync, existsSync } from 'node:fs'

let pass = 0
let fail = 0
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}${extra ? ` (${extra})` : ''}`) }
  else { fail++; console.log(`  FAIL ${name} ${extra}`) }
}

console.log('\n== デプロイ設定の監査 ==')

// ---- render.yaml -----------------------------------------------------------
const RENDER = 'render.yaml'
ok(existsSync(RENDER), 'render.yaml がある')
if (existsSync(RENDER)) {
  const text = readFileSync(RENDER, 'utf8')
  // コメント行を除いた「実際に実行される設定」だけを見る
  const active = text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')

  ok(!active.includes('--force-production'),
     '起動コマンドが開発用フィクスチャを投入しない（--force-production を使わない）')
  ok(active.includes('--bootstrap'),
     '起動コマンドが初期投入に --bootstrap を使う（管理者と区分マスタのみ）')
  ok(active.includes('alembic upgrade head'),
     '起動時に migration を適用する')
  ok(/APP_ENV[\s\S]{0,40}production/.test(active),
     'APP_ENV が production')
  ok(/SEED_ADMIN_PASSWORD[\s\S]{0,60}sync:\s*false/.test(active),
     '初期管理者パスワードをリポジトリに書かない（sync:false）')
  ok(/JWT_SECRET[\s\S]{0,60}generateValue:\s*true/.test(active),
     'JWT_SECRET を自動生成する（固定値を書かない）')

  // 秘密情報がベタ書きされていないこと
  const secrets = [/password:\s*["']?\w{4,}/i, /postgres(ql)?:\/\/[^\s"']*:[^\s"']*@/]
  const leaked = secrets.filter((re) => re.test(active))
  ok(leaked.length === 0, '接続文字列・パスワードがベタ書きされていない')
}

// ---- Dockerfile ------------------------------------------------------------
const DOCKERFILE = 'backend/Dockerfile'
if (existsSync(DOCKERFILE)) {
  const text = readFileSync(DOCKERFILE, 'utf8')
  ok(text.includes('BUILD_TIME'),
     'イメージにビルド時刻を残す（稼働中のビルドを画面から確認できるように）')
}

// ---- docker-compose --------------------------------------------------------
const COMPOSE = 'docker-compose.yml'
if (existsSync(COMPOSE)) {
  const text = readFileSync(COMPOSE, 'utf8')
  const active = text.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n')
  // 開発用の compose なのでフィクスチャ投入は許容する。
  // ただし APP_ENV=production と併用していたら、本番のつもりの環境へ架空データが入る。
  const prod = /APP_ENV[=:]\s*production/.test(active)
  ok(!(prod && active.includes('--force-production')),
     'docker-compose が production で開発用フィクスチャを入れない')
}

console.log(`\n結果: ${pass} passed, ${fail} failed`)
if (fail) {
  console.log('※ このまま公開環境へ反映すると、架空データや既知パスワードの利用者が作られます。')
}
process.exit(fail ? 1 : 0)
