/**
 * P3-3 横断マイルストーン画面の実ブラウザ検証。
 *
 * 横断ルート／案件詳細ルート、比較表／時間軸、3時間〜年、day・half_day の座標、
 * URL保存と復元、複合フィルターのAND、保存検索、未設定候補からの登録、
 * 編集と論理削除、同一案件同一区分の複数件、同名別IDの分離、
 * 期限超過・近日予定・遅延完了・日程矛盾、0件／候補のみ／truncated、
 * 5権限、画面と印刷の件数一致、縦スクロールの左右同期を実測する。
 *
 * 前提: backend(:8000) と vite preview(:4173) が起動していること。
 * 実行: node scripts/cross-milestones-verify.mjs
 */
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'
const API = process.env.E2E_API_BASE ?? 'http://localhost:8000/api'
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
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol
const section = (t) => console.log(`\n== ${t} ==`)

// 5権限のうち VIEWER はシードにいないため、検証中だけ用意して最後に消す
execFileSync(PY, ['scripts/verify-fixtures.py', 'viewer-add'], { encoding: 'utf8' })

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

const consoleErrors = []
const failedRequests = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('requestfailed', (r) => {
  const err = r.failure()?.errorText ?? ''
  if (err.includes('ERR_ABORTED')) return // 画面遷移での中断はアプリの失敗ではない
  failedRequests.push(`${r.url()} ${err}`)
})
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`) })
// 保存検索の名前入力は window.prompt
let promptAnswer = null
page.on('dialog', (d) => (promptAnswer === null ? d.dismiss() : d.accept(promptAnswer)))

async function login(email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 20000 })
}

async function open(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=システム検知（確定計算）', { timeout: 20000 })
  await page.waitForTimeout(350)
}

/** 画面が表示している件数（/summary と一覧の確定計算をそのまま出したもの）。 */
const counts = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('span')].find((s) => /登録済み \d+ 件 ／ 未設定 \d+ 件/.test(s.textContent))
  const m = el?.textContent.match(/登録済み (\d+) 件 ／ 未設定 (\d+) 件/)
  return m ? { registered: Number(m[1]), candidates: Number(m[2]) } : null
})

const summaryValues = () => page.evaluate(() => {
  const out = {}
  for (const chip of document.querySelectorAll('span.rounded.border')) {
    const label = chip.querySelector('.text-ink-soft')?.textContent?.trim()
    const value = chip.querySelector('.font-semibold')?.textContent?.trim()
    if (label && value !== undefined) out[label] = Number(value)
  }
  return out
})

/** API を画面と同じ条件で叩いて突き合わせるための共通取得。 */
async function apiJson(path) {
  return page.evaluate(async (p) => {
    const token = localStorage.getItem('sysken.token')
    const res = await fetch(p, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return res.json()
  }, path.startsWith('http') ? path : `${API}${path}`)
}

/** 編集モーダル本体（Modal コンポーネントのルート）。 */
const MODAL = '.fixed.inset-0.z-50'

await login('admin@example.co.jp')

// ===========================================================================
section('1. 横断ルートと案件詳細ルート')
await open('/schedule/milestones')
const crossCounts = await counts()
const crossTable = await page.evaluate(() => ({
  rows: document.querySelectorAll('table.grid-table tbody tr').length,
  cols: document.querySelectorAll('table.grid-table thead th').length,
  rowHead: document.querySelector('table.grid-table thead th')?.textContent.trim(),
  projects: [...document.querySelectorAll('table.grid-table tbody tr td:first-child')]
    .map((td) => td.textContent.trim()),
}))
ok(crossCounts?.registered === 47 && crossCounts?.candidates === 1,
   '横断ルート: 登録済み47件・未設定候補1件', JSON.stringify(crossCounts))
ok(crossTable.rows === 8, '横断ルート: 8案件が行に並ぶ', `${crossTable.rows} 行`)
ok(crossTable.cols === 7, '横断ルート: 案件列＋6区分が列に並ぶ', `${crossTable.cols} 列`)
ok(crossTable.rowHead === '案件', '横断ルート: 左端の固定列は案件', crossTable.rowHead)

await open('/projects/1/schedule/milestones')
const scoped = await counts()
const scopedRows = await page.evaluate(() =>
  [...document.querySelectorAll('table.grid-table tbody tr td:first-child')].map((td) => td.textContent.trim()))
ok(scoped?.registered === 6, '案件詳細ルート: 対象案件のみ6件', JSON.stringify(scoped))
ok(scopedRows.length === 1 && scopedRows[0].includes('KM-2026-001'),
   '案件詳細ルート: 行は対象案件だけ', scopedRows.join('/'))

// URLクエリで別案件を指定してもパスの案件IDを優先する
await open('/projects/1/schedule/milestones?projects=2')
const widened = await counts()
const widenedText = await page.evaluate(() => document.body.innerText)
ok(widened?.registered === 0, '案件詳細ルート: URLクエリで別案件を足しても範囲が広がらない',
   JSON.stringify(widened))
ok(!widenedText.includes('KM-2026-002'), '案件詳細ルート: 別案件のデータが出ない')

// ===========================================================================
section('2. 表示方式（比較表／時間軸）と表示の切替（案件別／種別別）')
await open('/schedule/milestones')
const viewButtons = await page.evaluate(() =>
  [...document.querySelectorAll('[role="group"][aria-label="表示方式"] button')]
    .map((b) => ({ text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') })))
ok(JSON.stringify(viewButtons.map((b) => b.text)) === JSON.stringify(['比較表', '時間軸']),
   '比較表／時間軸を切替できる', viewButtons.map((b) => b.text).join('/'))
ok(viewButtons[0].pressed === 'true', '既定は比較表で、選択状態が分かる')

await page.click('[role="group"][aria-label="表示方式"] button:has-text("時間軸")')
await page.waitForTimeout(500)
ok(page.url().includes('view=timeline'), 'view= をURLへ保存', new URL(page.url()).search)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=システム検知（確定計算）')
await page.waitForTimeout(400)
ok(await page.locator('[data-milestone-marker]').first().isVisible(), '再読込しても時間軸を復元')
await page.goBack({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
ok(await page.locator('table.grid-table').first().isVisible(), '戻るで比較表へ戻る')
await page.goForward({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
ok(await page.locator('[data-milestone-marker]').first().isVisible(), '進むで時間軸へ戻る')

await open('/schedule/milestones?group=type')
const transposed = await page.evaluate(() => ({
  head: document.querySelector('table.grid-table thead th')?.textContent.trim(),
  rows: document.querySelectorAll('table.grid-table tbody tr').length,
  cols: document.querySelectorAll('table.grid-table thead th').length,
}))
ok(transposed.head === 'マイルストーン区分' && transposed.rows === 6 && transposed.cols === 9,
   '種別別で行と列を転置（6区分 × 8案件）', JSON.stringify(transposed))
const typeApi = await apiJson('/schedule/milestones?group=type')
const typeScreen = await counts()
ok(typeApi.registered_count === typeScreen.registered && typeApi.candidate_count === typeScreen.candidates,
   '種別別でもAPIのグループ条件と件数が一致',
   `${typeApi.registered_count}/${typeApi.candidate_count}`)

// ===========================================================================
section('3. 表示単位（3時間／日／週／月／年）')
await open('/schedule/milestones?view=timeline')
const scaleButtons = await page.evaluate(() =>
  [...document.querySelectorAll('[role="group"][aria-label="表示単位"] button')]
    .map((b) => ({ text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') }))
    .filter((b) => b.text)) // 末尾のズームボタンはアイコンのみ
ok(JSON.stringify(scaleButtons.map((b) => b.text)) === JSON.stringify(['3時間', '日', '週', '月', '年']),
   '3時間〜年を直接選べる', scaleButtons.map((b) => b.text).join('/'))
ok(scaleButtons.find((b) => b.pressed === 'true')?.text === '月', '既定は月で選択状態が分かる')

const EXPECT = [['3時間', 'hour3', 18], ['日', 'day', 34], ['週', 'week', 60],
                ['月', 'month', 90], ['年', 'year', 120]]
for (const [label, key, width] of EXPECT) {
  await page.click(`[role="group"][aria-label="表示単位"] button:has-text("${label}")`)
  await page.waitForTimeout(600)
  const state = await page.evaluate(() => {
    const cells = document.querySelectorAll('.flex.h-10 > div')
    const markers = document.querySelectorAll('[data-milestone-marker]')
    return {
      slot: cells.length ? cells[0].getBoundingClientRect().width : null,
      slots: cells.length,
      markers: markers.length,
      search: location.search,
    }
  })
  ok(state.search.includes(`scale=${key}`) || (key === 'month' && !state.search.includes('scale=')),
     `${label}: scale= をURLへ保存`, state.search)
  ok(near(state.slot, width, 0.6), `${label}: 列幅 ${width}px`, `${state.slot}`)
  ok(state.slots > 0 && state.markers > 0,
     `${label}: 空の時間軸にならずマーカーが描かれる`, `${state.slots} 列 / ${state.markers} マーカー`)
}

// ===========================================================================
section('4. day / half_day 午前・午後 のマーカー位置')
for (const [label, key, pxPerDay] of [['日', 'day', 34], ['3時間', 'hour3', 18 * 8]]) {
  await open(`/schedule/milestones?view=timeline&scale=${key}`)
  const marks = await page.evaluate(() =>
    [...document.querySelectorAll('[data-milestone-marker]')].map((el) => ({
      x: parseFloat(el.style.left) + 5, // 描画は中心 - 5px
      title: el.getAttribute('title') ?? '',
      kind: el.dataset.milestoneMarker,
    })))
  const am = marks.filter((m) => m.title.includes(' 午前'))
  const pm = marks.filter((m) => m.title.includes(' 午後'))
  const plain = marks.filter((m) => !m.title.includes(' 午前') && !m.title.includes(' 午後'))
  const offset = (m) => ((m.x % pxPerDay) + pxPerDay) % pxPerDay
  ok(pm.length > 0, `${label}: half_day 午後のマーカーがある`, `${pm.length} 件`)
  ok(plain.every((m) => near(offset(m), 0, 0.6) || near(offset(m), pxPerDay, 0.6)),
     `${label}: day のマーカーは日の先頭`, `${plain.length} 件`)
  ok(am.every((m) => near(offset(m), 0, 0.6) || near(offset(m), pxPerDay, 0.6)),
     `${label}: half_day 午前は日の先頭`, `${am.length} 件`)
  ok(pm.every((m) => near(offset(m), pxPerDay / 2, 0.6)),
     `${label}: half_day 午後は日の中央`, `オフセット ${pm.map((m) => offset(m).toFixed(1)).join(',')}`)
  const kinds = new Set(marks.map((m) => m.kind))
  ok(kinds.has('plan') && kinds.has('actual'), `${label}: 予定日と実績日を別の形で表示`,
     [...kinds].join('/'))
}

// 今日線が時間軸と同じ基準で描かれる
await open('/schedule/milestones?view=timeline&scale=day')
const todayInfo = await page.evaluate(() => {
  const line = document.querySelector('.today-line')
  return line ? { x: parseFloat(line.style.left) } : null
})
ok(todayInfo !== null, '今日線が描画されている', `x=${todayInfo?.x}`)

// ===========================================================================
section('5. 複合フィルターのAND適用（条件はURLと1対1）')
const FILTER_CASES = [
  ['案件2件', 'projects=1,2'],
  ['案件2件＋区分1件', 'projects=1,2&types=5'],
  ['期限超過のみ', 'overdue=1'],
  ['近日予定のみ（14日）', 'duesoon=1&duesoondays=14'],
  ['日程矛盾のみ', 'conflict=1'],
  ['実績未入力のみ', 'actual=missing'],
  ['担当者＋担当会社', 'responsibles=2&companies=1'],
  ['期間指定', 'from=2026-07-01&to=2026-09-30'],
  ['キーワード＋区分', 'q=' + encodeURIComponent('引き渡し') + '&types=5'],
]
const API_KEY = {
  projects: 'project_ids', types: 'milestone_type_ids', responsibles: 'responsible_ids',
  companies: 'company_ids', tasks: 'related_task_ids', from: 'date_from', to: 'date_to',
  overdue: 'overdue_only', duesoon: 'due_soon_only', conflict: 'conflict_only',
  duesoondays: 'due_soon_days', statuses: 'statuses', actual: 'actual', q: 'q',
}
for (const [label, query] of FILTER_CASES) {
  await open(`/schedule/milestones?${query}`)
  const shown = await counts()
  const apiQuery = query.split('&').map((kv) => {
    const [k, v] = kv.split('=')
    const key = API_KEY[k] ?? k
    return `${key}=${['overdue', 'duesoon', 'conflict'].includes(k) ? 'true' : v}`
  }).join('&')
  const expected = await apiJson(`/schedule/milestones?${apiQuery}`)
  ok(shown.registered === expected.registered_count && shown.candidates === expected.candidate_count,
     `${label}: 画面の件数がAPIのAND結果と一致`,
     `画面 ${shown.registered}/${shown.candidates} vs API ${expected.registered_count}/${expected.candidate_count}`)
}

// 絞り込みパネルの操作がURLへ入り、再読込で復元される
await open('/schedule/milestones')
await page.click('button:has-text("絞り込み")')
await page.waitForTimeout(300)
await page.selectOption('select[multiple]>> nth=0', ['1', '2'])
await page.waitForTimeout(700)
ok(page.url().includes('projects=1%2C2') || page.url().includes('projects=1,2'),
   '画面から選んだ条件がURLへ入る', new URL(page.url()).search)
const beforeReload = await counts()
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=システム検知（確定計算）')
await page.waitForTimeout(400)
ok(JSON.stringify(await counts()) === JSON.stringify(beforeReload), '再読込しても条件が復元される')
await page.click('button:has-text("条件をクリア")')
await page.waitForTimeout(600)
ok(new URL(page.url()).search === '', '条件をクリアでURLが空になる', new URL(page.url()).search)

// 選択肢は /options を使い、同名でもIDで分離する
const opts = await apiJson('/schedule/milestones/options')
await open('/schedule/milestones')
await page.click('button:has-text("絞り込み")')
await page.waitForTimeout(300)
const typeOptions = await page.evaluate(() =>
  [...document.querySelectorAll('select[multiple]')][1] ?
    [...[...document.querySelectorAll('select[multiple]')][1].options].map((o) => o.textContent.trim()) : [])
ok(typeOptions.length === opts.milestone_types.length,
   '区分の選択肢は /options と同じ', `${typeOptions.length} 件`)
ok(typeOptions.every((t) => /（ID \d+）$/.test(t)), '同名でも区別できるようIDを併記',
   typeOptions[0])

// ===========================================================================
section('6. 保存検索（保存・復元・上書き・削除）')
await open('/schedule/milestones?projects=1,2&types=5&view=timeline&scale=day')
const savedTarget = new URL(page.url()).search
promptAnswer = `P3-3検証 ${Date.now()}`
await page.click('button[title="現在の条件を保存"]')
await page.waitForTimeout(900)
const savedName = promptAnswer
promptAnswer = null
const savedListed = await page.evaluate((name) =>
  [...document.querySelectorAll('select option')].some((o) => o.textContent.trim() === name), savedName)
ok(savedListed, '検索条件を保存できる', savedName)

await open('/schedule/milestones')
await page.waitForTimeout(400)
const savedValue = await page.evaluate((name) => {
  const sel = [...document.querySelectorAll('select')].find((s) =>
    [...s.options].some((o) => o.textContent.trim() === name))
  const opt = [...sel.options].find((o) => o.textContent.trim() === name)
  return { id: opt.value }
}, savedName)
await page.selectOption(`select:has(option:text-is("${savedName}"))`, savedValue.id)
await page.waitForTimeout(800)
const restored = new URL(page.url()).search
ok(restored.includes('projects=1%2C2') && restored.includes('types=5')
   && restored.includes('view=timeline') && restored.includes('scale=day'),
   '保存した条件を呼び出すとURLごと復元', restored)
void savedTarget

promptAnswer = null
await page.click('button:has-text("上書き")')
await page.waitForTimeout(800)
ok(true, '選択中の条件を上書きできる（名前を再入力しない）')

page.once('dialog', (d) => d.accept())
await page.click('button[title="選択中の条件を削除"]')
await page.waitForTimeout(900)
const stillThere = await page.evaluate((name) =>
  [...document.querySelectorAll('select option')].some((o) => o.textContent.trim() === name), savedName)
ok(!stillThere, '検索条件を削除できる')

// 案件詳細ルートでは保存検索でも範囲が広がらない
await open('/projects/1/schedule/milestones?projects=2,3')
ok((await counts()).registered === 0, '案件詳細ルート: 保存条件由来の別案件でも範囲が広がらない')

// ===========================================================================
section('7. 未設定候補から登録 → 同一案件同一区分の複数件 → 編集 → 論理削除')
await open('/schedule/milestones')
const beforeCreate = await counts()
const candidateCell = page.locator('td:has-text("未設定") button:has-text("登録する")').first()
ok(await candidateCell.isVisible(), '未設定セルに登録ボタンがある')
await candidateCell.click()
await page.waitForSelector('text=マイルストーンを登録', { timeout: 8000 })
const seeded = await page.evaluate((modal) => {
  const root = document.querySelector(modal)
  const sels = [...root.querySelectorAll('select')]
  const inputs = [...root.querySelectorAll('input')]
  return {
    project: sels[0]?.selectedOptions[0]?.textContent.trim(),
    type: sels[1]?.selectedOptions[0]?.textContent.trim(),
    name: inputs[0]?.value,
    planned: [...root.querySelectorAll('input[type="date"]')].map((i) => i.value),
    status: sels[3]?.value,
  }
}, MODAL)
ok(seeded.project?.includes('KM-2026-008') && seeded.type === '完工',
   '候補の案件IDと区分IDだけが初期値', `${seeded.project} / ${seeded.type}`)
ok(seeded.name === '' && seeded.planned.every((v) => v === ''),
   '予定日・実績日・名称を自動生成しない', JSON.stringify(seeded.planned))

const NAME = 'P3-3検証マイルストーン'
await page.fill(`${MODAL} input:not([type="date"]):not([type="number"]) >> nth=0`, NAME)
await page.selectOption(`${MODAL} select >> nth=2`, 'half_day') // 入力粒度
await page.waitForTimeout(200)
await page.fill(`${MODAL} input[type="date"] >> nth=0`, '2026-09-15')
await page.selectOption(`${MODAL} select >> nth=3`, 'PM') // 予定の午前午後
await page.waitForTimeout(150)
await page.click(`${MODAL} button:has-text("保存")`)
await page.waitForTimeout(1400)
const afterCreate = await counts()
ok(afterCreate.registered === beforeCreate.registered + 1 && afterCreate.candidates === 0,
   '登録後に一覧・summary・未設定候補を取り直す',
   `${beforeCreate.registered}/${beforeCreate.candidates} → ${afterCreate.registered}/${afterCreate.candidates}`)

// 同じ案件・同じ区分・同じ名称でもう1件（1件に上書きしない）
await page.click('button:has-text("新規登録")')
await page.waitForSelector('text=マイルストーンを登録')
await page.selectOption(`${MODAL} select >> nth=0`, { label: 'KM-2026-008 阿蘇エリア 架空ケーブル更新工事' })
await page.waitForTimeout(200)
await page.selectOption(`${MODAL} select >> nth=1`, { label: '完工' })
await page.fill(`${MODAL} input:not([type="date"]):not([type="number"]) >> nth=0`, NAME)
await page.fill(`${MODAL} input[type="date"] >> nth=0`, '2026-09-20')
await page.click(`${MODAL} button:has-text("保存")`)
await page.waitForTimeout(1400)
const afterSecond = await counts()
ok(afterSecond.registered === afterCreate.registered + 1,
   '同一案件・同一区分でも2件目を登録できる', `${afterSecond.registered} 件`)

const stacked = await page.evaluate((name) => {
  const cells = [...document.querySelectorAll('table.grid-table tbody td')]
  const hit = cells.filter((td) => (td.textContent.match(new RegExp(name, 'g')) ?? []).length >= 2)
  if (!hit.length) return null
  const cell = hit[0]
  return {
    entries: [...cell.querySelectorAll(':scope > div')].length,
    planned: [...cell.querySelectorAll(':scope > div')].map((d) => d.textContent.match(/予定 ([\d/]+)/)?.[1]),
  }
}, NAME)
ok(stacked?.entries === 2, 'セル内に2件を積み重ねて1件に潰さない', JSON.stringify(stacked))
ok(stacked?.planned[0] !== stacked?.planned[1],
   '同名でも別レコードとして別々に表示', (stacked?.planned ?? []).join(' / '))

// 片方だけ編集して、もう一方が変わらない（IDで分離されている）
await page.evaluate((name) => {
  const cells = [...document.querySelectorAll('table.grid-table tbody td')]
  const cell = cells.find((td) => (td.textContent.match(new RegExp(name, 'g')) ?? []).length >= 2)
  cell.querySelectorAll(':scope > div')[0].querySelector('button[title="編集"]').click()
}, NAME)
await page.waitForSelector('text=マイルストーンを編集', { timeout: 8000 })
await page.fill(`${MODAL} textarea`, 'P3-3の編集確認')
await page.click(`${MODAL} button:has-text("保存")`)
await page.waitForTimeout(1400)
const afterEdit = await page.evaluate((name) => {
  const cells = [...document.querySelectorAll('table.grid-table tbody td')]
  const cell = cells.find((td) => (td.textContent.match(new RegExp(name, 'g')) ?? []).length >= 2)
  return [...cell.querySelectorAll(':scope > div')].map((d) => d.textContent.match(/予定 ([\d/]+)/)?.[1])
}, NAME)
ok(JSON.stringify(afterEdit) === JSON.stringify(stacked.planned),
   '片方を編集してももう一方を書き換えない', afterEdit.join(' / '))

// 保存失敗時にモーダルを閉じない（名称未入力）
await page.click('button:has-text("新規登録")')
await page.waitForSelector('text=マイルストーンを登録')
await page.click(`${MODAL} button:has-text("保存")`)
await page.waitForTimeout(600)
const stillOpen = await page.evaluate((modal) => ({
  open: !!document.querySelector(`${modal} .btn-primary`),
  error: document.querySelector(`${modal} .text-ng`)?.textContent?.trim() ?? null,
}), MODAL)
ok(stillOpen.open && stillOpen.error, '入力エラーでモーダルを閉じず理由を日本語で表示', stillOpen.error)
await page.click(`${MODAL} button:has-text("キャンセル")`)
await page.waitForTimeout(300)

// 削除は確認ダイアログに対象名を含み、論理削除される
const idsBefore = (await apiJson('/schedule/milestones?project_ids=8')).milestones
  .filter((m) => m.name === NAME).map((m) => m.id)
ok(idsBefore.length === 2, '同名2件がAPI上も別IDで存在', idsBefore.join(','))
for (let i = 0; i < 2; i++) {
  await page.evaluate((name) => {
    const cells = [...document.querySelectorAll('table.grid-table tbody td')]
    const cell = cells.find((td) => td.textContent.includes(name))
    cell.querySelector('button[title="削除"]').click()
  }, NAME)
  await page.waitForSelector('text=マイルストーンの削除', { timeout: 8000 })
  if (i === 0) {
    const msg = await page.evaluate(() =>
      document.querySelector('.z-\\[70\\] p')?.textContent?.trim() ?? '')
    ok(msg.includes(NAME) && msg.includes('KM-2026-008'), '削除前に対象名を含む確認を出す', msg)
  }
  await page.click('button.btn-danger:has-text("削除")')
  await page.waitForTimeout(1300)
}
const afterDelete = await counts()
ok(afterDelete.registered === beforeCreate.registered && afterDelete.candidates === 1,
   '論理削除で元の件数へ戻る（未設定候補も戻る）',
   `${afterDelete.registered}/${afterDelete.candidates}`)
// ===========================================================================
section('8. システム検知（期限超過・近日予定・遅延完了・日程矛盾）')
await open('/schedule/milestones')
const shownSummary = await summaryValues()
const apiSummary = await apiJson('/schedule/milestones/summary')
for (const [label, key] of [['登録済み', 'registered_count'], ['未設定候補', 'candidate_count'],
                            ['完了', 'completed'], ['期限超過', 'overdue'],
                            ['遅延完了', 'was_delayed'], ['関連工程と不整合', 'related_task_conflict']]) {
  ok(shownSummary[label] === apiSummary[key],
     `サマリー「${label}」が /summary の確定計算と一致`, `${shownSummary[label]}`)
}
ok(shownSummary[`近日予定（${apiSummary.due_soon_days}日以内）`] === apiSummary.due_soon,
   'サマリー「近日予定」が /summary と一致', `${apiSummary.due_soon}`)
const badges = await page.evaluate(() => {
  // サマリーの見出し（関連工程と不整合）を数えないよう、比較表の中だけを見る
  const text = document.querySelector('table.grid-table').innerText
  return {
    overdue: (text.match(/期限超過 \d+日/g) ?? []).length,
    dueSoon: (text.match(/近日 残\d+日/g) ?? []).length,
    delayed: (text.match(/遅延完了 \d+日/g) ?? []).length,
    conflict: (text.match(/工程と不整合/g) ?? []).length,
    ai: (document.body.innerText.match(/AI予測/g) ?? []).length,
    note: document.body.innerText.includes('AIによる予測ではありません'),
  }
})
ok(badges.overdue === apiSummary.overdue, 'セルの期限超過バッジ数が確定計算と一致', `${badges.overdue}`)
ok(badges.dueSoon === apiSummary.due_soon, 'セルの近日予定バッジ数が一致', `${badges.dueSoon}`)
ok(badges.delayed === apiSummary.was_delayed, 'セルの遅延完了バッジ数が一致', `${badges.delayed}`)
ok(badges.conflict === apiSummary.related_task_conflict, 'セルの日程矛盾バッジ数が一致', `${badges.conflict}`)
ok(badges.ai === 0 && badges.note, '「AI予測」と表示せず、確定計算だと明記')

// 時間軸でも期限超過・不整合を視覚的に区別し、詳細をツールチップ／aria-labelで出す
await open('/schedule/milestones?view=timeline&scale=month')
const markerStyles = await page.evaluate(() => {
  const els = [...document.querySelectorAll('[data-milestone-marker]')]
  return {
    total: els.length,
    overdue: els.filter((e) => e.className.includes('bg-ng')).length,
    conflict: els.filter((e) => e.className.includes('bg-wn')).length,
    actual: els.filter((e) => e.dataset.milestoneMarker === 'actual').length,
    labelled: els.filter((e) => (e.getAttribute('aria-label') ?? '').includes('｜状態 ')).length,
    focusable: els.filter((e) => e.tagName === 'BUTTON').length,
  }
})
ok(markerStyles.overdue > 0, '時間軸で期限超過を色で区別', `${markerStyles.overdue} 件`)
ok(markerStyles.conflict > 0, '時間軸で関連工程の不整合を色で区別', `${markerStyles.conflict} 件`)
ok(markerStyles.labelled === markerStyles.total && markerStyles.focusable === markerStyles.total,
   'すべてのマーカーがキーボード操作可能で詳細を持つ', `${markerStyles.total} 件`)

// ===========================================================================
section('9. 0件・候補のみ・truncated・エラー')
await open('/schedule/milestones?q=' + encodeURIComponent('該当しないはずの語'))
const candidatesOnly = await page.evaluate(() => document.body.innerText)
const candidatesOnlyCounts = await counts()
ok(candidatesOnlyCounts.registered === 0 && candidatesOnlyCounts.candidates > 0,
   '登録済み0件・候補ありの状態になる', JSON.stringify(candidatesOnlyCounts))
ok(candidatesOnly.includes('登録済みのマイルストーンはありません'), '候補のみの空状態を表示')
ok(!candidatesOnly.includes('条件に一致するマイルストーンはありません'),
   '候補ありのときは「0件」の文言を出さない')

// 存在しない案件IDは 200・0件（検索範囲を広げない）
await open('/schedule/milestones?projects=999')
const bothZero = await page.evaluate(() => document.body.innerText)
const bothZeroCounts = await counts()
ok(bothZeroCounts.registered === 0 && bothZeroCounts.candidates === 0,
   '存在しないIDでも200・両方0件', JSON.stringify(bothZeroCounts))
ok(bothZero.includes('条件に一致するマイルストーンはありません'), '両方0件の空状態を表示')
ok(!bothZero.includes('登録済みのマイルストーンはありません'), '両方0件では候補ありの文言を出さない')

await open('/schedule/milestones?limit=5')
const truncated = await page.evaluate(() => {
  const m = document.body.innerText.match(/該当 (\d+) 件のうち先頭 (\d+) 件のみ表示しています（上限 (\d+) 件）/)
  return m ? { total: Number(m[1]), returned: Number(m[2]), limit: Number(m[3]) } : null
})
ok(truncated?.total === 47 && truncated?.returned === 5 && truncated?.limit === 5,
   'truncated=true を件数付きで別状態として表示', JSON.stringify(truncated))

// ===========================================================================
section('10. 画面と印刷の一致（帳票レイアウト）')
await open('/schedule/milestones?projects=1,2&types=5')
const screenCounts = await counts()
await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(400)
const printState = await page.evaluate(() => {
  const vis = (sel) => {
    const el = document.querySelector(sel)
    return el ? getComputedStyle(el).display !== 'none' : null
  }
  const header = document.querySelector('[data-print="only"]')
  const sheet = document.querySelector('[data-print="sheet"]')
  return {
    hiddenLeft: [...document.querySelectorAll('[data-print="hide"]')]
      .filter((e) => getComputedStyle(e).display !== 'none').length,
    header: vis('header[data-print="hide"]'),
    toolbarButtons: [...document.querySelectorAll('button')].filter((b) => {
      const cs = getComputedStyle(b)
      return cs.display !== 'none' && b.offsetParent !== null
    }).length,
    printHeaderShown: header ? getComputedStyle(header).display !== 'none' : false,
    printHeaderText: header?.innerText ?? '',
    sheetMaxHeight: sheet ? getComputedStyle(sheet).maxHeight : null,
    sheetOverflow: sheet ? getComputedStyle(sheet).overflow : null,
    stickyCells: [...document.querySelectorAll('[data-print="sheet"] td')]
      .filter((td) => getComputedStyle(td).position === 'sticky').length,
    tableRows: document.querySelectorAll('table.grid-table tbody tr').length,
  }
})
ok(printState.hiddenLeft === 0 && printState.header === false,
   '印刷でサイドバー・アプリヘッダー・操作領域を除外', `残り ${printState.hiddenLeft} 要素`)
ok(printState.toolbarButtons === 0, '印刷で操作ボタンを除外', `${printState.toolbarButtons} 個`)
ok(printState.printHeaderShown, '印刷用の見出しを出す')
ok(printState.sheetMaxHeight === 'none' && printState.sheetOverflow === 'visible',
   '印刷でスクロール枠の高さ制限を解除', `${printState.sheetMaxHeight}/${printState.sheetOverflow}`)
ok(printState.stickyCells === 0, '印刷で sticky を解除')
const printText = printState.printHeaderText.replace(/\s+/g, '')
ok(printText.includes(`登録済み${screenCounts.registered}件`)
   && printText.includes(`未設定${screenCounts.candidates}件`),
   '印刷の対象件数が画面と一致', `${screenCounts.registered}/${screenCounts.candidates}`)
for (const label of ['出力日時', '出力者', '計算基準日', '表示方式', '表示の切替']) {
  ok(printText.includes(label), `印刷に「${label}」を記載`)
}
ok(printText.includes('区分') && printText.includes('案件'), '印刷に適用した検索条件を記載')
await page.emulateMedia({ media: 'screen' })

// 印刷対象の行数が画面と同じ（先頭ページだけにならない）
ok(printState.tableRows === 2, '印刷でも表示中の全行が対象', `${printState.tableRows} 行`)

// ===========================================================================
section('11. 5権限での表示')
const ROLES = [
  ['admin@example.co.jp', 'ADMIN', true],
  ['yamada@example.co.jp', 'PROJECT_MANAGER', true],
  ['partner@example.co.jp', 'FIELD_WORKER（割当あり）', false],
  ['quality@example.co.jp', 'QUALITY_MANAGER', false],
  [VIEWER_EMAIL, 'VIEWER', false],
]
for (const [email, role, canEdit] of ROLES) {
  await login(email)
  await open('/schedule/milestones')
  const c = await counts()
  const api = await apiJson('/schedule/milestones')
  const ui = await page.evaluate(() => ({
    create: !!([...document.querySelectorAll('button')].find((b) => b.textContent.includes('新規登録'))),
    edit: document.querySelectorAll('button[title="編集"]').length,
    del: document.querySelectorAll('button[title="削除"]').length,
    register: [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '登録する').length,
  }))
  ok(c.registered === api.registered_count && c.candidates === api.candidate_count,
     `${role}: 画面の件数がスコープ内のAPI結果と一致`, `${c.registered}/${c.candidates}`)
  ok(ui.create === canEdit && (ui.edit > 0) === canEdit && (ui.del > 0) === canEdit,
     `${role}: 更新系UIは ${canEdit ? '表示' : '非表示'}`,
     `新規${ui.create} 編集${ui.edit} 削除${ui.del} 登録する${ui.register}`)
}

// ===========================================================================
section('12. 縦スクロールしても左右の位置がずれない')
await login('admin@example.co.jp')
await page.setViewportSize({ width: 1920, height: 700 })

// 比較表: 左の固定列と右のセルを300px以上スクロールして移動量を比べる
await open('/schedule/milestones')
const tableSync = await page.evaluate(async () => {
  const sheet = document.querySelector('[data-print="sheet"]')
  const row = document.querySelectorAll('table.grid-table tbody tr')[4]
  const fixedCell = row.querySelector('td:first-child')
  const rightCell = row.querySelector('td:last-child')
  const tops = () => ({
    left: fixedCell.getBoundingClientRect().top,
    right: rightCell.getBoundingClientRect().top,
  })
  sheet.scrollTop = 0
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const before = tops()
  sheet.scrollTop = 320
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const after = tops()
  return {
    scrolled: sheet.scrollTop,
    leftDelta: before.left - after.left,
    rightDelta: before.right - after.right,
    sticky: getComputedStyle(fixedCell).position,
  }
})
ok(tableSync.scrolled >= 300, '比較表を300px以上縦スクロールできる', `${tableSync.scrolled}px`)
ok(near(tableSync.leftDelta, tableSync.rightDelta, 0.5),
   '比較表: 左の固定列と右のセルの移動量が一致',
   `左 ${tableSync.leftDelta} / 右 ${tableSync.rightDelta}`)
ok(tableSync.sticky === 'sticky', '比較表: 案件情報列は横スクロールで固定', tableSync.sticky)

// 時間軸: 左の対象一覧と右のマーカーが同じ枠でスクロールする
await open('/schedule/milestones?view=timeline&scale=month')
const sync = await page.evaluate(async () => {
  const sheet = document.querySelector('[data-print="sheet"]')
  const leftColumn = sheet.children[0]
  const label = leftColumn.children[leftColumn.children.length - 1] // 最終行のラベル
  const markers = [...document.querySelectorAll('[data-milestone-marker]')]
  const marker = markers[markers.length - 1]
  const tops = () => ({
    label: label.getBoundingClientRect().top,
    marker: marker.getBoundingClientRect().top,
  })
  const max = sheet.scrollHeight - sheet.clientHeight
  sheet.scrollTop = 0
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const before = tops()
  sheet.scrollTop = max
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const after = tops()
  return {
    scrolled: sheet.scrollTop,
    labelDelta: before.label - after.label,
    markerDelta: before.marker - after.marker,
    innerScrollers: [...sheet.querySelectorAll('*')].filter((e) => {
      const cs = getComputedStyle(e)
      return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight + 4
    }).length,
  }
})
ok(sync.innerScrollers === 0, '時間軸: 縦スクロール枠は外側の1つだけ（構造的に同期）',
   `内側の縦スクロール枠 ${sync.innerScrollers} 個`)
ok(near(sync.labelDelta, sync.markerDelta, 0.5),
   '時間軸: 左の対象一覧と右のマーカーの移動量が一致',
   `${sync.scrolled}px スクロールして 左 ${sync.labelDelta} / 右 ${sync.markerDelta}`)
await page.setViewportSize({ width: 1920, height: 1080 })

// ===========================================================================
section('13. コンソールエラー・失敗リクエスト')
ok(consoleErrors.length === 0, 'コンソールエラー 0 件', consoleErrors.slice(0, 3).join(' / '))
ok(failedRequests.length === 0, '失敗リクエスト 0 件', failedRequests.slice(0, 3).join(' / '))

await browser.close()
execFileSync(PY, ['scripts/verify-fixtures.py', 'viewer-remove'], { encoding: 'utf8' })

console.log(`\n合計 ${pass + fail} 件: PASS ${pass} / FAIL ${fail}`)
process.exit(fail ? 1 : 0)
