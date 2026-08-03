/**
 * Ver.0.4 Phase 4「案件ライフサイクルと工程への業務導線」の実ブラウザ回帰。
 *
 * 一意な工事番号で新規案件を1件だけ作り、その同じ案件で
 * 登録 → 一覧で強調 → 詳細 → 更新 → 再読込維持 → 工程追加 → 工程編集 →
 * ドラッグ → 進捗更新 → 再読込維持 → 横断工程へ反映 → 戻る/進む復元 →
 * 別タブ更新後の再取得 まで通しで確認する。
 * あわせて、条件で隠れたときの案内、2ページ目、複数ページにまたがる
 * 絞り込み結果、total と全ページ合計の一致、5権限、未選択状態の4画面、
 * コンソールエラーと失敗リクエストを実測する。
 *
 * 検証で作った案件・工程は消さない（本番相当データを物理削除しない方針）。
 * 一時的に作る VIEWER だけは verify-fixtures.py で後始末する。
 *
 * 前提: backend(:8000) と vite preview(:4173) が起動していること。
 * 実行: node scripts/phase4-verify.mjs
 */
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'
const EMAIL = process.env.E2E_EMAIL ?? 'admin@example.co.jp'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Passw0rd!'
const VIEWER_EMAIL = process.env.E2E_VIEWER_EMAIL ?? 'verify.viewer@example.co.jp'
const CHROME = process.env.PW_CHROME
const PY = process.env.E2E_PYTHON ?? 'backend/.venv/bin/python'

let pass = 0
let fail = 0
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}${extra ? ` (${extra})` : ''}`) }
  else { fail++; console.log(`  FAIL ${name} ${extra}`) }
}
const section = (t) => console.log(`\n== ${t} ==`)

// 検証対象の案件（毎回一意）
const STAMP = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)
const NUMBER = `P4-${STAMP}`
const NAME = `Phase4回帰 ${STAMP}`
const NAME_UPDATED = `${NAME}（更新後）`
const NAME_OTHER_TAB = `${NAME}（別タブ更新）`
const TASK_PARENT = `Phase4回帰 親工程 ${STAMP}`
const TASK_CHILD = `Phase4回帰 子工程 ${STAMP}`
const TASK_CHILD_UPDATED = `${TASK_CHILD}（編集後）`

execFileSync(PY, ['scripts/verify-fixtures.py', 'viewer-add'], { encoding: 'utf8' })

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
const page = await context.newPage()

const consoleErrors = []
const failedRequests = []
// 権限テストなど「拒否されるのが正しい」通信は、期待済みとして分けて数える
let expecting = null
const expectedFailures = []
const track = (entry) => {
  if (expecting && expecting.test(entry)) expectedFailures.push(entry)
  else failedRequests.push(entry)
}
page.on('console', (m) => {
  if (m.type() !== 'error') return
  // 権限テスト中の 403 はブラウザもコンソールエラーとして記録するため、期待済みへ振り分ける
  if (expecting && /403|Forbidden/.test(m.text())) { expectedFailures.push(`console: ${m.text()}`); return }
  consoleErrors.push(m.text())
})
page.on('requestfailed', (r) => {
  const err = r.failure()?.errorText ?? ''
  if (err.includes('ERR_ABORTED')) return
  track(`${r.url()} ${err}`)
})
page.on('response', (r) => { if (r.status() >= 400) track(`${r.status()} ${r.url()}`) })

async function login(p, email) {
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await p.fill('input[type="email"]', email)
  await p.fill('input[type="password"]', PASSWORD)
  await p.click('button[type="submit"]')
  await p.waitForURL('**/dashboard', { timeout: 20000 })
}

async function logout(p) {
  await p.evaluate(() => { localStorage.clear() })
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
}

/** 案件一覧を開き、行が描画されるまで待つ */
async function openProjects(query = '') {
  await page.goto(`${BASE}/projects${query}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-project-count], .grid-table, [data-empty]', { timeout: 20000 })
    .catch(() => {})
  await page.waitForTimeout(300)
}

const modal = () => page.locator('div[data-print="hide"]').last()
// モーダルの主ボタン（保存／登録／更新）。画面のツールバーにも同名のボタンがあるため必ずモーダル内から選ぶ。
const modalSubmit = () => modal().locator('button.btn-primary')
const rowIds = () => page.$$eval('[data-project-row]', (rows) =>
  rows.map((r) => Number(r.getAttribute('data-project-row'))))
const countText = () => page.locator('[data-project-count]').innerText()

// =====================================================================
section('前提：検証開始時点の件数')
await login(page, EMAIL)
await openProjects('?per_page=100')
const before = await rowIds()
ok(before.length >= 8, '登録前から案件が8件以上ある', `${before.length}件`)

// =====================================================================
section('Step 1-2: 新規登録 → 1ページ目で強調表示')
await openProjects()
await page.click('button:has-text("新規案件登録")')
await page.waitForSelector('text=新規案件登録', { timeout: 5000 })
const newFields = modal().locator('input.field')
await newFields.nth(0).fill(NUMBER)
await newFields.nth(1).fill(NAME)
// 顧客は架空名を入れず空欄のまま（任意項目が空でも登録できることも同時に確認する）
await newFields.nth(3).fill('熊本市中央区')
await newFields.nth(5).fill('2026-09-01')
await newFields.nth(6).fill('2026-10-31')
await modalSubmit().click()
await page.waitForSelector('text=案件を登録しました', { timeout: 15000 })
ok(true, '登録成功時だけ「案件を登録しました」が出る')
await page.waitForTimeout(800)

const url1 = new URL(page.url())
const NEW_ID = Number(url1.searchParams.get('new'))
ok(Number.isFinite(NEW_ID) && NEW_ID > 0, 'URLに登録した案件のIDが入る', `new=${NEW_ID}`)
ok(url1.searchParams.get('page') === null, '1ページ目に戻っている', url1.search)

const afterIds = await rowIds()
ok(afterIds.length === before.length + 1, `一覧が ${before.length} → ${afterIds.length} 件に増える`)
ok(afterIds[0] === NEW_ID, '登録した案件が1ページ目の先頭に出る', `先頭=${afterIds[0]}`)
const highlighted = await page.$$eval('[data-new="true"]', (r) => r.length)
ok(highlighted === 1, '登録した案件だけが強調表示される', `${highlighted}行`)
ok((await page.locator(`[data-project-row="${NEW_ID}"]`).innerText()).includes('新規'),
   '「新規」バッジが付く')
ok((await countText()).startsWith(`${afterIds.length}件中`),
   'total は画面集計ではなくAPIの値', await countText())

// =====================================================================
section('Step 3: 一覧から詳細へ')
await page.click(`[data-project-row="${NEW_ID}"] td:nth-child(3)`)
await page.waitForURL(`**/projects/${NEW_ID}`, { timeout: 15000 })
await page.waitForSelector('text=基本情報を編集', { timeout: 15000 })
let detail = await page.locator('main, body').first().innerText()
ok(detail.includes(NUMBER) && detail.includes(NAME), '詳細に登録した工事番号・工事名が出る')
ok(detail.includes('2026-09-01') && detail.includes('2026-10-31'), '入力した予定期間が保存されている')

// =====================================================================
section('Step 4-5: 詳細で更新 → 再読込で維持')
await page.click('[data-edit-project]')
await page.waitForSelector('text=案件基本情報を編集', { timeout: 5000 })
await modal().locator('input.field').nth(0).fill(NAME_UPDATED)
await modal().locator('select.field').selectOption('施工中')
await modalSubmit().click()
await page.waitForTimeout(1200)
detail = await page.locator('body').innerText()
ok(detail.includes(NAME_UPDATED), '保存後に画面が更新後の工事名になる')
ok(detail.includes('施工中'), 'ステータスも更新される')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=基本情報を編集', { timeout: 15000 })
detail = await page.locator('body').innerText()
ok(detail.includes(NAME_UPDATED) && detail.includes('施工中'), '再読込しても更新結果が維持される')

// =====================================================================
section('Step 6: 工程を追加')
await page.goto(`${BASE}/projects/${NEW_ID}/schedule`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=基準工程', { timeout: 20000 })
await page.waitForTimeout(500)
ok((await page.locator('body').innerText()).includes('工程がまだ登録されていません'),
   '工程0件は架空データではなく明示される')

await page.click('button[title="工程追加"]')
await page.waitForSelector('text=工程を追加', { timeout: 5000 })
await modal().locator('input.field').nth(1).fill(TASK_PARENT)
await modalSubmit().click()
await page.waitForSelector('text=工程を追加しました', { timeout: 15000 })
await page.waitForTimeout(900)
ok((await page.locator('body').innerText()).includes(TASK_PARENT), '親工程が追加される')

// 子工程（ガント上でドラッグできる末端の工程）
await page.locator('tbody tr', { hasText: TASK_PARENT }).first().click()
await page.click('button[title="子工程追加"]')
await page.waitForSelector('text=子工程を追加', { timeout: 5000 })
await modal().locator('input.field').nth(1).fill(TASK_CHILD)
await modalSubmit().click()
await page.waitForSelector('text=工程を追加しました', { timeout: 15000 })
await page.waitForTimeout(900)
ok((await page.locator('tbody tr').count()) === 2, '親工程と子工程の2行になる')
ok((await page.locator('body').innerText()).includes(TASK_CHILD), '子工程が一覧に出る')

// =====================================================================
section('Step 7: 工程を編集')
const childRow = () => page.locator('tbody tr', { hasText: TASK_CHILD_UPDATED }).first()
await page.locator('tbody tr', { hasText: TASK_CHILD }).first().click()
await page.click('button[title="編集"]')
await page.waitForSelector('text=工程を編集', { timeout: 5000 })
await modal().locator('input.field').nth(1).fill(TASK_CHILD_UPDATED)
await modalSubmit().click()
await page.waitForSelector('text=工程を更新しました', { timeout: 15000 })
await page.waitForTimeout(900)
ok(await childRow().count() === 1, '編集した工程名が反映される')

// =====================================================================
section('Step 8: ガントチャートのドラッグ（1日ずらす）')
const slotWidth = await page.evaluate(() => {
  const h = document.querySelectorAll('.thin-scroll .flex.h-10 > div')
  return h.length ? h[0].getBoundingClientRect().width : 0
})
ok(slotWidth > 0, '日単位の列幅を実測できる', `${slotWidth}px`)
const childCell = (i) => childRow().locator('td').nth(i).innerText()
const startBefore = await childCell(5)
const bar = page.locator(`[title^="${TASK_CHILD_UPDATED} ｜ 予定"]`).first()
const box = await bar.boundingBox()
ok(!!box, 'ガントバーが描画されている', box ? `left=${Math.round(box.x)} w=${Math.round(box.width)}` : '')
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + box.width / 2 + slotWidth, box.y + box.height / 2, { steps: 12 })
await page.mouse.up()
await page.waitForSelector('text=日程変更を保存しました', { timeout: 15000 })
await page.waitForTimeout(1200)
const startAfter = await childCell(5)
ok(startBefore !== startAfter, 'ドラッグで予定開始日が変わる', `${startBefore} → ${startAfter}`)

// =====================================================================
section('Step 9: 進捗を更新')
await childRow().click({ button: 'right' })
await page.waitForSelector('text=進捗を更新', { timeout: 5000 })
await page.click('text=進捗を更新')
await page.waitForSelector('input[type="range"]', { timeout: 5000 })
const range = page.locator('input[type="range"]')
await range.focus()
for (let i = 0; i < 12; i++) await range.press('ArrowRight')
await modalSubmit().click()
await page.waitForSelector('text=進捗を 60% に更新しました', { timeout: 15000 })
await page.waitForTimeout(900)
ok((await childCell(10)).trim() === '60%', '進捗が60%になる', (await childCell(10)).trim())

// =====================================================================
section('Step 10: 工程画面を再読込しても維持')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=基準工程', { timeout: 20000 })
await page.waitForTimeout(600)
ok(await childRow().count() === 1, '再読込後も編集した工程名が残る')
ok((await childCell(5)) === startAfter, '再読込後もドラッグ結果が残る', await childCell(5))
ok((await childCell(10)).trim() === '60%', '再読込後も進捗が残る')

// =====================================================================
section('Step 11: 横断工程へ反映')
const jstDay = (offset) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' })
  .format(new Date(Date.now() + offset * 86400000))
// ドラッグで1日ずらしているため、前後に余裕をもった期間で確認する
await page.goto(`${BASE}/schedule/cross?from=${jstDay(-1)}&to=${jstDay(3)}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const cross = await page.locator('body').innerText()
ok(cross.includes(TASK_CHILD_UPDATED), '横断工程に新しい案件の工程が出る')
ok(cross.includes(NAME_UPDATED) || cross.includes(NUMBER), '横断工程に案件名（または工事番号）が出る')

// =====================================================================
section('Step 12: 戻る／進むで検索条件が復元される')
await openProjects()
await page.fill('input[placeholder="キーワードを入力"]', 'KM-2026')
await page.waitForTimeout(900)
const filteredIds = await rowIds()
ok(!filteredIds.includes(NEW_ID), 'キーワードで新規案件が絞り込まれる（サーバー側）')
ok(new URL(page.url()).searchParams.get('q') === 'KM-2026', 'URLに条件が入る', page.url())

await page.goBack({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
ok(new URL(page.url()).searchParams.get('q') === null, '戻るで条件が外れる', page.url())
ok((await rowIds()).includes(NEW_ID), '戻ると新規案件が再び表示される')
await page.goForward({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
ok(new URL(page.url()).searchParams.get('q') === 'KM-2026', '進むで条件が復元される', page.url())
ok(!(await rowIds()).includes(NEW_ID), '進むと絞り込み結果も復元される')

// =====================================================================
section('条件で隠れているときの案内と「条件を解除して表示」')
await openProjects(`?new=${NEW_ID}`)
await page.fill('input[placeholder="キーワードを入力"]', 'KM-2026')
await page.waitForTimeout(900)
ok((await page.locator('body').innerText()).includes('現在の絞り込み条件では表示されていません'),
   '隠れている場合は「登録済みだが条件で非表示」と案内する')
await page.click('button:has-text("条件を解除して表示")')
await page.waitForTimeout(900)
ok((await page.$$eval('[data-new="true"]', (r) => r.length)) === 1,
   '「条件を解除して表示」で登録した案件が強調表示に戻る')
ok(new URL(page.url()).searchParams.get('q') === null, '条件解除がURLにも反映される', page.url())

// =====================================================================
section('2ページ目・複数ページにまたがる結果・total と全ページ合計の一致')
await openProjects('?per_page=5&page=2')
const page2 = await rowIds()
ok(page2.length > 0, '2ページ目に行がある', `${page2.length}行`)
ok((await page.locator('[data-page="2"]').getAttribute('class')).includes('bg-sysken-500'),
   '2ページ目が選択状態で分かる')
const c2 = await countText()
ok(/(\d+)件中 6〜/.test(c2), '2ページ目の表示範囲が正しい', c2)

async function sumAllPages(query, perPage) {
  await openProjects(`${query}&per_page=${perPage}&page=1`)
  const total = Number((await countText()).match(/^(\d+)件中/)[1])
  const pages = await page.locator('[data-page]').count()
  const seen = []
  for (let i = 1; i <= pages; i++) {
    await openProjects(`${query}&per_page=${perPage}&page=${i}`)
    const t = Number((await countText()).match(/^(\d+)件中/)[1])
    if (t !== total) return { total, sum: -1, pages, unique: -1, mismatch: i }
    seen.push(...(await rowIds()))
  }
  return { total, sum: seen.length, pages, unique: new Set(seen).size }
}

const all = await sumAllPages('?q=', 3)
ok(all.sum === all.total, '全ページの行数合計と total が一致する', `${all.sum} / ${all.total}（${all.pages}ページ）`)
ok(all.unique === all.total, 'ページ間で同じ案件が重複しない', `${all.unique}件`)

const filtered = await sumAllPages('?q=KM', 3)
ok(filtered.pages >= 2, '絞り込み結果が複数ページにまたがる', `${filtered.pages}ページ`)
ok(filtered.sum === filtered.total, '絞り込み時も合計と total が一致する', `${filtered.sum} / ${filtered.total}`)
ok(filtered.total < all.total, '絞り込みで total 自体が減る（画面集計ではない）',
   `${filtered.total} < ${all.total}`)

// =====================================================================
section('5権限での案件一覧と操作可否')
const ROLES = [
  ['admin@example.co.jp', 'ADMIN', true, true],
  ['yamada@example.co.jp', 'PROJECT_MANAGER', true, true],
  ['quality@example.co.jp', 'QUALITY_MANAGER', false, true],
  [VIEWER_EMAIL, 'VIEWER', false, true],
  ['partner@example.co.jp', 'FIELD_WORKER', false, false],
]
for (const [email, role, canCreate, seesNew] of ROLES) {
  await logout(page)
  await login(page, email)
  await openProjects('?per_page=100')
  const ids = await rowIds()
  const create = await page.locator('button:has-text("新規案件登録")').count()
  ok((create > 0) === canCreate, `${role}: 新規案件登録ボタンの表示が権限どおり`, `${create}個`)
  ok(ids.includes(NEW_ID) === seesNew, `${role}: 案件スコープどおりの一覧`, `${ids.length}件`)
  if (seesNew) {
    await page.goto(`${BASE}/projects/${NEW_ID}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    const edit = await page.locator('[data-edit-project]').count()
    ok((edit > 0) === canCreate, `${role}: 「基本情報を編集」の表示が権限どおり`, `${edit}個`)
  } else {
    // 割当外の案件は403。0件の一覧とは別の見え方になる。
    expecting = new RegExp(`403 .*/projects/${NEW_ID}$`)
    await page.goto(`${BASE}/projects/${NEW_ID}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(700)
    const body = await page.locator('body').innerText()
    ok(body.includes('アクセス権がありません'), `${role}: 割当外案件は権限エラーとして示される`)
    ok(expectedFailures.some((e) => e.startsWith('403')), `${role}: APIも403を返す`)
    expecting = null
  }
}

// =====================================================================
section('未選択状態（施工写真・品質管理・現場日報・報告書）')
await logout(page)
await login(page, EMAIL)
for (const [label, path] of [
  ['施工写真', '/photos'], ['品質管理', '/quality'],
  ['現場日報', '/daily-report'], ['報告書', '/reports'],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  ok((await page.locator('[data-project-select]').count()) > 0, `${label}: 案件セレクタがある`)
  ok((await page.locator('[data-project-select]').inputValue()) === '',
     `${label}: 既定では案件を勝手に選ばない`)
  ok((await page.locator('[data-no-project]').count()) > 0, `${label}: 未選択の空状態を出す`)

  // 選択するとURLに残り、再読込でも同じ案件が開く
  await page.selectOption('[data-project-select]', String(NEW_ID))
  await page.waitForTimeout(900)
  ok(new URL(page.url()).searchParams.get('project_id') === String(NEW_ID),
     `${label}: 選択がURLに保存される`)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  ok((await page.locator('[data-project-select]').inputValue()) === String(NEW_ID),
     `${label}: 再読込しても同じ案件が開く`)
  ok((await page.locator('[data-no-project]').count()) === 0, `${label}: 選択後は空状態を出さない`)
}

// =====================================================================
section('Step 13: 別タブで更新したあとの再取得')
await openProjects('?per_page=100')
const tab2 = await context.newPage()
await tab2.goto(`${BASE}/projects/${NEW_ID}`, { waitUntil: 'networkidle' })
await tab2.waitForSelector('[data-edit-project]', { timeout: 15000 })
await tab2.click('[data-edit-project]')
await tab2.waitForSelector('text=案件基本情報を編集', { timeout: 5000 })
await tab2.locator('div[data-print="hide"]').last().locator('input.field').nth(0).fill(NAME_OTHER_TAB)
await tab2.locator('div[data-print="hide"]').last().locator('button.btn-primary').click()
await tab2.waitForTimeout(1200)
ok((await tab2.locator('body').innerText()).includes(NAME_OTHER_TAB), '別タブでの更新が保存される')

// 1つ目のタブは一覧を開いたまま（画面遷移せずに保持する）。
ok(!(await page.locator('body').innerText()).includes(NAME_OTHER_TAB),
   '別タブの更新は、開いたままの画面へ自動では反映されない（自動更新しない設計）')
// 画面内の操作で条件が変わると、キャッシュではなくAPIから取り直す
await page.fill('input[placeholder="キーワードを入力"]', NUMBER)
await page.waitForTimeout(1200)
ok((await page.locator('body').innerText()).includes(NAME_OTHER_TAB),
   '検索条件を変えると別タブの更新結果を取り直す')
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(900)
ok((await page.locator('body').innerText()).includes(NAME_OTHER_TAB),
   '再読込でも別タブの更新結果を取り直す')
await page.goto(`${BASE}/projects/${NEW_ID}`, { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
ok((await page.locator('body').innerText()).includes(NAME_OTHER_TAB),
   '詳細も別タブの更新結果を取り直す')
await tab2.close()

// =====================================================================
section('コンソール・通信')
ok(consoleErrors.length === 0, 'コンソールエラー 0', consoleErrors.slice(0, 3).join(' | '))
ok(failedRequests.length === 0, '想定外の失敗リクエスト 0', failedRequests.slice(0, 5).join(' | '))
console.log(`  （権限テストで想定どおり拒否された通信: ${expectedFailures.length}件）`)

console.log(`\n検証で作成した案件: ${NUMBER} / id=${NEW_ID}（削除しない）`)
console.log(`結果: ${pass} passed, ${fail} failed`)
await browser.close()
execFileSync(PY, ['scripts/verify-fixtures.py', 'viewer-remove'], { encoding: 'utf8' })
process.exit(fail ? 1 : 0)
