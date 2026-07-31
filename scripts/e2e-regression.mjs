/**
 * 既存機能の回帰確認スクリプト（Phase 0 基準）。
 *
 * 主要ルートを実ブラウザで開き、スクリーンショット・コンソールエラー・
 * 失敗した HTTP リクエストを収集する。改修の前後で同じ手順を実行し、
 * 「現行と同じ見た目・同じエラー0」であることを確認するために使う。
 *
 * 前提:
 *   - Backend が起動していること（既定 http://localhost:8000）
 *   - Frontend が配信されていること（既定 http://localhost:4173）
 *   - playwright が導入されていること（`npm i -D playwright`。既定ブラウザが
 *     無い環境では PW_CHROME に実行ファイルパスを指定する）
 *
 * 使い方:
 *   node scripts/e2e-regression.mjs --out /tmp/baseline
 *   node scripts/e2e-regression.mjs --out /tmp/after --base http://localhost:4173
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const BASE = opt('base', process.env.E2E_BASE_URL ?? 'http://localhost:4173')
const OUT = opt('out', '/tmp/e2e-regression')
const EMAIL = process.env.E2E_EMAIL ?? 'admin@example.co.jp'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Passw0rd!'
const CHROME = process.env.PW_CHROME // 例: /opt/pw-browsers/chromium-1194/chrome-linux/chrome

// 確認対象ルート（label はファイル名に使う）
const ROUTES = [
  ['dashboard', '/dashboard'],
  ['projects', '/projects'],
  ['project-detail', '/projects/1'],
  ['schedule', '/schedule'],
  ['photos', '/photos'],
  ['drawings', '/drawings'],
  ['quality', '/quality'],
  ['daily-report', '/daily-report'],
  ['personnel', '/personnel'],
  ['ledger', '/ledger'],
  ['reports', '/reports'],
  ['notifications', '/notifications'],
  ['settings', '/settings'],
]

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

const consoleErrors = []
const failedRequests = []
let currentRoute = 'login'
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push({ route: currentRoute, text: m.text() })
})
page.on('pageerror', (e) => consoleErrors.push({ route: currentRoute, text: `PAGEERROR: ${e.message}` }))
page.on('response', (r) => {
  if (r.status() >= 400) failedRequests.push({ route: currentRoute, status: r.status(), url: r.url() })
})

// ---- ログイン ----
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type=email]', EMAIL)
await page.fill('input[type=password]', PASSWORD)
await page.click('button[type=submit]')
await page.waitForTimeout(2500)
const loggedIn = !page.url().includes('/login')
console.log(`login: ${loggedIn ? 'OK' : 'FAILED'} (${page.url()})`)
if (!loggedIn) {
  console.error('ログインに失敗したため中断します。Backend 起動と認証情報を確認してください。')
  await browser.close()
  process.exit(1)
}

// ---- 各ルートを開いて記録 ----
const results = []
for (const [label, path] of ROUTES) {
  currentRoute = label
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${OUT}/${label}.png` })
  // 画面が「壊れていない」ことの最小確認: 本文に文字がある / 例外画面でない
  const bodyLen = (await page.textContent('body'))?.trim().length ?? 0
  results.push({ label, path, url: page.url(), bodyLen })
  console.log(`  ${label.padEnd(15)} ${String(bodyLen).padStart(6)} chars  -> ${label}.png`)
}

const summary = {
  base: BASE,
  at: new Date().toISOString(),
  routes: results,
  consoleErrors,
  failedRequests,
}
writeFileSync(`${OUT}/summary.json`, JSON.stringify(summary, null, 2))

console.log(`\nconsole errors : ${consoleErrors.length}`)
consoleErrors.slice(0, 10).forEach((e) => console.log(`  [${e.route}] ${e.text}`))
console.log(`failed requests: ${failedRequests.length}`)
failedRequests.slice(0, 10).forEach((r) => console.log(`  [${r.route}] ${r.status} ${r.url}`))
console.log(`\n出力: ${OUT}`)

await browser.close()
process.exit(consoleErrors.length === 0 ? 0 : 2)
