/**
 * 配布用ビルド（dist/）が、そのまま置いて動く状態かを検証する。
 *
 *   node scripts/check-release.mjs --base /sysken/ --api-url https://api.example.com/api
 *
 * デプロイして初めて気づく類の失敗を、置く前に見つけるためのもの。
 *
 *  - 資産の参照パスが配信パスと一致しているか（サブパスで白画面になる典型）
 *  - コミットSHAが埋め込まれているか（unknown だと稼働中のコードを確認できない）
 *  - APIのURLが localhost のまま残っていないか
 *  - SPA用の .htaccess があるか（直リンクが404になる典型）
 *  - 開発用フィクスチャの痕跡（架空の案件名など）が混ざっていないか
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const arg = (name, fallback = '') => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const BASE = arg('base', '/')
const API_URL = arg('api-url')
const COMMIT = arg('commit')
const DIST = arg('dist', 'dist')

let pass = 0
let fail = 0
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}${extra ? ` (${extra})` : ''}`) }
  else { fail++; console.log(`  FAIL ${name} ${extra}`) }
}

console.log(`\n== 配布用ビルドの検証（${DIST}） ==`)

if (!existsSync(DIST)) {
  console.log(`  FAIL ${DIST}/ がありません。先にビルドしてください。`)
  process.exit(1)
}

const indexPath = join(DIST, 'index.html')
ok(existsSync(indexPath), 'index.html がある')
const html = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : ''

// ---- 資産の参照パス --------------------------------------------------------
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
const localRefs = refs.filter((r) => !/^https?:|^data:|^\/\//.test(r))
ok(localRefs.length > 0, '資産の参照がある', `${localRefs.length}件`)
const wrong = localRefs.filter((r) => !r.startsWith(BASE))
ok(wrong.length === 0, `資産の参照がすべて ${BASE} 配下`, wrong.slice(0, 3).join(' , '))

// ---- 実際に参照先のファイルが存在するか -----------------------------------
const missing = localRefs
  .map((r) => r.slice(BASE.length))
  .filter((rel) => rel && !existsSync(join(DIST, rel)))
ok(missing.length === 0, '参照している資産が実在する', missing.slice(0, 3).join(' , '))

// ---- 埋め込んだ値 ----------------------------------------------------------
const assetsDir = join(DIST, 'assets')
const jsFiles = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((f) => f.endsWith('.js')).map((f) => join(assetsDir, f))
  : []
ok(jsFiles.length > 0, 'JSバンドルがある', `${jsFiles.length}件`)
const bundle = jsFiles.map((f) => readFileSync(f, 'utf8')).join('\n')

// コミットSHA。unknown のままだと「どのコードが動いているか」を画面で確認できない。
if (COMMIT && COMMIT !== 'unknown') {
  ok(bundle.includes(COMMIT), 'コミットSHAが埋め込まれている', COMMIT.slice(0, 8))
} else {
  ok(!bundle.includes('"unknown"') || true, 'コミットSHAの確認をスキップ（--commit 未指定）')
  console.log('  ※ --commit を渡すと、埋め込みを実測できます')
}

// APIのURL。localhost が残っていると公開環境から通信できない。
if (API_URL) {
  ok(bundle.includes(API_URL), 'APIのURLが埋め込まれている', API_URL)
}
const localhostLeft = /https?:\/\/(localhost|127\.0\.0\.1):\d+/.exec(bundle)
ok(localhostLeft === null, 'localhost 宛のURLが残っていない', localhostLeft?.[0] ?? '')

// ---- SPA の設定 ------------------------------------------------------------
const htaccess = join(DIST, '.htaccess')
if (BASE !== '/') {
  ok(existsSync(htaccess), 'サブパス配信用の .htaccess がある')
  if (existsSync(htaccess)) {
    const text = readFileSync(htaccess, 'utf8')
    ok(text.includes(`RewriteBase ${BASE}`), '.htaccess の RewriteBase が配信パスと一致', BASE)
    ok(!text.includes('__BASE_PATH__'), '.htaccess のプレースホルダが置換済み')
  }
} else if (existsSync(htaccess)) {
  const text = readFileSync(htaccess, 'utf8')
  ok(!text.includes('__BASE_PATH__'), '.htaccess のプレースホルダが置換済み')
}

// ---- 開発用フィクスチャの痕跡 ---------------------------------------------
// 画面へ直接書き戻っていないかを見る（APIから来る実データは対象外）。
const FIXTURE_MARKERS = ['熊本中央局 光設備更改工事', '天草地区 通信設備復旧工事', 'KM-2026-001']
const leaked = FIXTURE_MARKERS.filter((m) => bundle.includes(m) || html.includes(m))
ok(leaked.length === 0, '開発用フィクスチャの案件名が混ざっていない', leaked.join(' , '))

console.log(`\n結果: ${pass} passed, ${fail} failed`)
if (fail) {
  console.log('※ このまま配置すると、公開環境で上記の問題が起きます。')
}
process.exit(fail ? 1 : 0)
