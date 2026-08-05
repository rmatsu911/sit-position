/**
 * Ver.0.5 Phase 5 項目3〜5 の実ブラウザ回帰。
 *
 * - 案件詳細「操作履歴」が実際の記録から作られること（固定文言が出ないこと）
 * - システム情報が AI を意味ごとに分けて出すこと（1語にまとめないこと）
 * - AI機能パネルが7機能の状態を実データから出すこと
 *
 * 検証で作った案件・工程は消さない（本番相当データを物理削除しない方針）。
 *
 * 前提: scripts/dev-stack.sh start
 * 実行: node scripts/phase5-status-verify.mjs
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
const NUMBER = `P5ST-${STAMP}`

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
  body: JSON.stringify({ construction_number: NUMBER, name: `Phase5状態表示回帰 ${STAMP}` }),
})
console.log(`検証案件: ${NUMBER} / id=${project.id}`)

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASSWORD)
await page.click('button[type="submit"]')
await page.waitForURL('**/dashboard', { timeout: 20000 })

// ------------------------------------------------------------------ 操作履歴
section('1. 操作履歴は実際の記録から作られる')
await page.goto(`${BASE}/projects/${project.id}`, { waitUntil: 'networkidle' })
await page.click('button:has-text("操作履歴")')
await page.waitForSelector('[data-audit-log], [data-audit-empty]', { timeout: 15000 })
{
  const text = await page.innerText('body')
  // 以前は、どの案件でも同じ5行が出ていた
  for (const fixed of ['高橋 誠', '接続損失測定の進捗を60%に更新', '写真未提出の通知を生成',
                       'ONU設置写真に再撮影依頼', 'クロージャ設置を完了に変更', '切替手順図を更新']) {
    ok(!text.includes(fixed), `固定の履歴文言が出ない: ${fixed}`)
  }
  const rows = await page.locator('[data-audit-entry]').count()
  ok(rows === 1, '登録直後は「案件を登録」の1件だけ', String(rows))
  ok((await page.innerText('[data-audit-log]')).includes('案件を登録'), '実際の操作が出る')
}

section('2. 操作すると履歴が増える')
{
  const t = await api(`/projects/${project.id}/tasks`, {
    method: 'POST',
    body: JSON.stringify({
      name: '履歴確認用の工程', wbs_code: '1',
      planned_start_at: '2026-11-02T00:00:00+09:00',
      planned_finish_at: '2026-11-05T00:00:00+09:00',
    }),
  })
  await api(`/tasks/${t.id}`, {
    method: 'PUT',
    body: JSON.stringify({ actual_progress: 30, change_reason: '回帰テストの進捗更新' }),
  })
  await page.reload({ waitUntil: 'networkidle' })
  await page.click('button:has-text("操作履歴")')
  await page.waitForSelector('[data-audit-log]')
  const text = await page.innerText('[data-audit-log]')
  ok(text.includes('工程を登録'), '工程の登録が履歴に出る')
  ok(text.includes('工程を更新'), '工程の更新が履歴に出る')
  ok(text.includes('実績進捗'), '変更された項目名が出る')
  ok(text.includes('0 → 30'), '変更前後の値が出る')
  ok(text.includes('回帰テストの進捗更新'), '変更理由が出る')
  const changeRows = await page.locator('[data-audit-entry="task_change"]').count()
  ok(changeRows >= 1, '工程変更履歴が別種別として出る', String(changeRows))
}

section('3. 別案件の履歴は混ざらない')
{
  const other = await api('/projects', {
    method: 'POST',
    body: JSON.stringify({ construction_number: `${NUMBER}-B`, name: `別案件 ${STAMP}` }),
  })
  await page.goto(`${BASE}/projects/${other.id}`, { waitUntil: 'networkidle' })
  await page.click('button:has-text("操作履歴")')
  await page.waitForSelector('[data-audit-log], [data-audit-empty]')
  const text = await page.innerText('body')
  ok(!text.includes('履歴確認用の工程'), '他案件の工程は出ない')
  ok(!text.includes('回帰テストの進捗更新'), '他案件の変更理由は出ない')
  console.log(`  検証で作成した案件: ${NUMBER}-B / id=${other.id}（削除しない）`)
}

// ------------------------------------------------------------ システム情報
section('4. システム情報はAIを意味ごとに分けて出す')
await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' })
await page.click('button:has-text("システム情報")')
await page.waitForSelector('[data-system-info]', { timeout: 15000 })
{
  const text = await page.innerText('[data-system-info]')
  ok(!text.includes('AIサービス'), '「AIサービス」という1語にまとめない')
  await page.waitForSelector('[data-ai-runtime]', { timeout: 10000 })
  const ai = await page.innerText('[data-ai-runtime]')
  for (const label of ['登録済みモデル', 'うち学習済み', 'AI Worker', '処理待ちジョブ', '最後に成功した推論']) {
    ok(ai.includes(label), `AIの内訳に「${label}」が出る`)
  }
  const worker = await page.innerText('[data-ai-worker]')
  ok(worker !== '稼働中', 'Worker が動いていないのに「稼働中」とは書かない', worker)
  ok(['待ちジョブなし（稼働は未確認）', '処理中', '動いていません（ジョブが滞留）', '未確認'].includes(worker),
     'Worker の状態が決められた表現で出る', worker)

  // SHA とベースパス
  ok(await page.locator('[data-frontend-sha]').count() === 1, 'フロントのコミットSHAが出る')
  ok(await page.locator('[data-backend-sha]').count() === 1, 'バックエンドのコミットSHAが出る')
  ok(await page.locator('[data-alembic-revision]').count() === 1, 'migration revision が出る')
  const basePath = await page.innerText('[data-frontend-base-path]')
  const apiRoot = await page.innerText('[data-api-root-path]')
  ok(basePath === '/', '画面のベースパスが出る', basePath)
  ok(apiRoot === '/', 'APIの公開パスが出る', apiRoot)

  // 秘密情報が画面に出ていない
  const lower = text.toLowerCase()
  for (const leak of ['password', 'secret', 'postgresql://', 'jwt']) {
    ok(!lower.includes(leak), `秘密情報が出ない: ${leak}`)
  }
}

// ------------------------------------------------------------------ AI機能
section('5. AI機能パネルは7機能の状態を実データから出す')
{
  const status = await api('/ai/status')
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  // AIパネルを開く
  await page.click('[title="AI機能"], button:has-text("AI機能")').catch(() => {})
  const opened = await page.locator('[data-ai-features]').count()
  if (opened === 0) {
    // ヘッダーのAIボタンの見つけ方が変わっている場合に備え、aria から探す
    await page.locator('header button').filter({ hasText: /AI/ }).first().click().catch(() => {})
  }
  await page.waitForSelector('[data-ai-features]', { timeout: 15000 })

  const cards = await page.locator('[data-ai-feature]').count()
  ok(cards === 7, '7機能すべてを出す', String(cards))
  ok(status.features.length === 7, 'APIも7機能を返す', String(status.features.length))

  for (const f of status.features) {
    const shown = await page.locator(`[data-ai-feature="${f.key}"] [data-ai-status]`).getAttribute('data-ai-status')
    ok(shown === f.status, `${f.title}: 画面の状態がAPIと一致する`, `${shown}`)
  }

  // 未実装の機能を「実装済み」とは書かない
  const notImplemented = status.features.filter((f) => f.status === 'not_implemented')
  ok(notImplemented.length >= 1, '未実装の機能がそのまま未実装と出る', String(notImplemented.length))
  const panelText = await page.innerText('[data-ai-features]')
  for (const f of notImplemented) {
    ok(panelText.includes(f.title), `${f.title} が一覧に出る`)
  }
  ok(panelText.includes('未実装'), '「未実装」という表示が実際に出る')

  const summary = await page.innerText('[data-ai-runtime-summary]')
  ok(summary.includes(`学習済みモデル ${status.trained_model_count}件`), '学習済みモデル数がAPIと一致する', summary.split('\n')[0])
  ok(summary.includes('最後に成功した推論'), '最後に成功した推論の時刻を出す')
}

section('コンソール')
ok(consoleErrors.length === 0, 'コンソールエラー 0', consoleErrors.slice(0, 3).join(' | '))

console.log(`\n検証で作成した案件: ${NUMBER} / id=${project.id}（削除しない）`)
console.log(`結果: ${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail ? 1 : 0)
