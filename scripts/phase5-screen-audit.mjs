/**
 * Ver.0.5 Phase 5 項目6「全画面の実データ監査とナビゲーション」。
 *
 * 全17画面を、案件を選んだ状態と選んでいない状態の両方で開き、
 * 次を実測する。
 *
 *  - 画面が「実データ」「空状態」「エラー」のいずれかを必ず示すこと
 *    （白紙のまま止まらない・読み込み中のまま止まらない）
 *  - 案件配下ルートでは対象案件が固定表示され、別案件へ変えられないこと
 *  - 案件が必要な画面で未選択のとき、案内が出て操作UIを描かないこと
 *  - パンくずから戻れること／案件配下ルートを再読込しても同じ案件が開くこと
 *  - コンソールエラーと失敗リクエストが出ないこと
 *  - 画面に「準備中」と書いてあるものが、実際に未提供であること
 *
 * 検証で作ったデータは消さない（本番相当データを物理削除しない方針）。
 *
 * 前提: scripts/dev-stack.sh start
 * 実行: node scripts/phase5-screen-audit.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'
const API = process.env.E2E_API_BASE_URL ?? 'http://localhost:8000/api'
const EMAIL = process.env.E2E_EMAIL ?? 'admin@example.co.jp'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Passw0rd!'
const CHROME = process.env.PW_CHROME

let pass = 0
let fail = 0
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}${extra ? ` (${extra})` : ''}`) }
  else { fail++; console.log(`  FAIL ${name} ${extra}`) }
}
const section = (t) => console.log(`\n== ${t} ==`)

const STAMP = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
const NUMBER = `P5SA-${STAMP}`

let token = ''
async function api(path, init = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  })
  if (!r.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${r.status} ${await r.text()}`)
  return r.status === 204 ? null : r.json()
}

const auth = await (await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})).json()
token = auth.access_token

const project = await api('/projects', {
  method: 'POST',
  body: JSON.stringify({ construction_number: NUMBER, name: `Phase5全画面監査 ${STAMP}` }),
})
// 工程を1件入れて、案件配下の画面が「実データ」を持つ状態にする
await api(`/projects/${project.id}/tasks`, {
  method: 'POST',
  body: JSON.stringify({
    name: '監査用の工程', wbs_code: '1',
    planned_start_at: '2026-11-10T00:00:00+09:00',
    planned_finish_at: '2026-11-13T00:00:00+09:00',
  }),
})
console.log(`検証案件: ${NUMBER} / id=${project.id}`)

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })

const consoleErrors = []
const failedRequests = []
// 404 を出すこと自体を確かめる区間では、その通信を想定外に数えない
let expecting404 = false
page.on('console', (m) => {
  if (m.type() !== 'error') return
  if (expecting404 && m.text().includes('404')) return
  consoleErrors.push(`${page.url()} ${m.text()}`)
})
page.on('requestfailed', (r) => {
  const err = r.failure()?.errorText ?? ''
  if (err.includes('ERR_ABORTED')) return
  failedRequests.push(`${r.url()} ${err}`)
})
page.on('response', (r) => {
  if (r.status() < 400) return
  if (expecting404 && r.status() === 404) return
  failedRequests.push(`${r.status()} ${r.url()}`)
})

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASSWORD)
await page.click('button[type="submit"]')
await page.waitForURL('**/dashboard', { timeout: 20000 })

/**
 * 全画面。
 *  - `scoped` … 案件配下ルートを持つ画面
 *  - `needsProject` … 案件が決まらないと内容を出せない画面
 */
const SCREENS = [
  { name: 'ダッシュボード', path: '/dashboard' },
  { name: '案件一覧', path: '/projects' },
  { name: '案件詳細', path: `/projects/${project.id}` },
  { name: '工程管理', path: '/schedule', scoped: 'schedule', needsProject: true },
  { name: '横断工程表', path: '/schedule/cross', scoped: 'schedule/cross' },
  { name: '横断マイルストーン', path: '/schedule/milestones', scoped: 'schedule/milestones' },
  { name: 'カレンダー', path: '/schedule/calendar', scoped: 'schedule/calendar' },
  { name: '施工写真', path: '/photos', scoped: 'photos', needsProject: true },
  { name: '図面・書類', path: '/drawings', scoped: 'drawings', needsProject: true },
  { name: '品質管理', path: '/quality', scoped: 'quality', needsProject: true },
  { name: '現場日報', path: '/daily-report', scoped: 'daily-report', needsProject: true },
  { name: '要員管理', path: '/personnel', scoped: 'personnel' },
  { name: '工事台帳', path: '/ledger', scoped: 'ledger' },
  { name: '報告書', path: '/reports', scoped: 'reports', needsProject: true },
  { name: '通知', path: '/notifications' },
  { name: '設定', path: '/settings' },
  { name: 'AI施工判断', path: '/consultation' },
]

/** 画面が「何かを示している」か。白紙・読み込み中のまま止まっていないこと。 */
async function settled() {
  await page.waitForLoadState('networkidle')
  // 読み込み中の表示が残っていないこと
  for (let i = 0; i < 20; i += 1) {
    const loading = await page.locator('text=/読み込んで|取得しています|確認しています/').count()
    if (loading === 0) break
    await page.waitForTimeout(300)
  }
  const body = (await page.innerText('body')).trim()
  return body
}

section(`1. 全${SCREENS.length}画面が内容・空状態・エラーのいずれかを示す`)
for (const s of SCREENS) {
  await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' })
  const body = await settled()
  ok(body.length > 80, `${s.name}: 白紙にならない`, `${body.length}文字`)
  ok(!body.includes('読み込んでいます'), `${s.name}: 読み込み中のまま止まらない`)
  // 見出し（PageHeader）が必ずある＝どの画面にいるか分かる
  const h1 = await page.locator('h1').count()
  ok(h1 >= 1, `${s.name}: 画面名の見出しがある`)
}

section('2. 案件が必要な画面は、未選択のとき案内を出し操作UIを描かない')
for (const s of SCREENS.filter((x) => x.needsProject)) {
  await page.goto(`${BASE}${s.path}`, { waitUntil: 'networkidle' })
  await settled()
  ok(await page.locator('[data-no-project]').count() === 1, `${s.name}: 未選択の案内が出る`)
  ok(await page.locator('[data-project-select]').count() >= 1, `${s.name}: 案件セレクタが出る`)
  // 一覧・登録などの操作UIは描かない
  const tables = await page.locator('table tbody tr').count()
  ok(tables === 0, `${s.name}: 未選択では一覧行を描かない`, String(tables))
}

section('3. 案件配下ルートは対象案件を固定し、別案件へ変えられない')
for (const s of SCREENS.filter((x) => x.scoped)) {
  const url = `${BASE}/projects/${project.id}/${s.scoped}`
  await page.goto(url, { waitUntil: 'networkidle' })
  await settled()
  const fixed = await page.locator('[data-fixed-project]').count()
  ok(fixed >= 1, `${s.name}: 対象案件を固定表示する`, String(fixed))
  ok(await page.locator('[data-project-select]').count() === 0,
     `${s.name}: 案件セレクタを出さない（URLが正本）`)
  const label = await page.locator('[data-fixed-project]').first().innerText()
  ok(label.includes(NUMBER), `${s.name}: 固定表示が工事番号を含む`, label)
  ok(await page.locator('[data-no-project]').count() === 0, `${s.name}: 未選択の空状態にならない`)

  // 再読込しても同じ案件
  await page.reload({ waitUntil: 'networkidle' })
  await settled()
  ok((await page.locator('[data-fixed-project]').first().innerText()).includes(NUMBER),
     `${s.name}: 再読込しても同じ案件が開く`)
}

section('4. パンくずから戻れる')
{
  await page.goto(`${BASE}/projects/${project.id}/schedule`, { waitUntil: 'networkidle' })
  await settled()
  const crumbs = await page.locator('nav a, header a').allTextContents()
  ok(crumbs.some((c) => c.includes('案件一覧')), 'パンくずに案件一覧がある', crumbs.join(' / '))
  await page.click('a:has-text("案件一覧")')
  await page.waitForURL('**/projects', { timeout: 15000 })
  ok(page.url().endsWith('/projects'), '案件一覧へ戻れる', page.url())

  await page.goto(`${BASE}/projects/${project.id}`, { waitUntil: 'networkidle' })
  await settled()
  const detailCrumbs = await page.locator('nav a, header a').allTextContents()
  ok(detailCrumbs.some((c) => c.includes('案件一覧')), '案件詳細にも戻る導線がある')
}

section('5. 存在しないURLは404画面を出す')
{
  expecting404 = true
  await page.goto(`${BASE}/no-such-page`, { waitUntil: 'networkidle' })
  const body = await settled()
  ok(body.includes('見つかりません') || body.includes('404'), '不明なURLで404画面が出る', body.slice(0, 60))
  await page.goto(`${BASE}/projects/99999999`, { waitUntil: 'networkidle' })
  const body2 = await settled()
  ok(body2.includes('見つかりません') || body2.includes('404'), '存在しない案件で404画面が出る', body2.slice(0, 60))
  expecting404 = false
}

section('6. 「準備中」と書いてあるものは、実際に未提供である')
{
  // AI施工判断は未実装。回答を生成しないこと。
  await page.goto(`${BASE}/consultation`, { waitUntil: 'networkidle' })
  const body = await settled()
  ok(body.includes('準備中'), 'AI施工判断は準備中と明示する')
  const status = await api('/ai/status')
  const advice = status.features.find((f) => f.key === 'construction_advice')
  ok(advice.status === 'not_implemented', 'APIも未実装として返す', advice.status)

  // 工程管理: 「準備中」と書いてある操作が、実際に設定できるものになっていないこと
  await page.goto(`${BASE}/projects/${project.id}/schedule`, { waitUntil: 'networkidle' })
  await settled()
  await page.locator('tbody tr').first().click({ button: 'right' })
  await page.waitForSelector('text=工程を編集')
  const menu = await page.innerText('body')
  ok(!menu.includes('前工程と関連付け'), '設定できる操作を「準備中」のまま残していない')
  ok(menu.includes('先行工程を設定'), '先行工程は設定できる操作として出す')
  ok(menu.includes('担当者・担当会社を設定'), '担当情報は設定できる操作として出す')
  await page.keyboard.press('Escape')
}

section('7. コンソール・通信')
{
  // 権限テストはしていないので、4xx/5xx はすべて想定外
  const unexpected = failedRequests.filter((r) => !r.includes('/files/'))
  const missingFiles = failedRequests.filter((r) => r.includes('/files/'))
  ok(consoleErrors.length === 0, 'コンソールエラー 0', consoleErrors.slice(0, 3).join(' | '))
  ok(unexpected.length === 0, '想定外の失敗リクエスト 0', unexpected.slice(0, 3).join(' | '))
  if (missingFiles.length) {
    console.log(`  （シード写真の実ファイル未配置による取得失敗: ${missingFiles.length}件 ※storage は git 管理外）`)
  }
}

console.log(`\n検証で作成した案件: ${NUMBER} / id=${project.id}（削除しない）`)
console.log(`結果: ${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail ? 1 : 0)
