/**
 * P3-5 カレンダー画面の実ブラウザ検証。
 *
 * 月表示・週表示、前／次／今日、URL保存と復元、工程とマイルストーンの表示、
 * day / half_day、JSTの日付境界、月跨ぎ・年跨ぎ、同日複数件、同名別ID、
 * 論理削除・権限外の除外、5権限、複合フィルター、保存検索、0件と truncated、
 * 元データへの遷移、リクエスト回数を実測する。
 *
 * 前提: backend(:8000) と vite preview(:4173) が起動していること。
 * 実行: node scripts/calendar-verify.mjs
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
const section = (t) => console.log(`\n== ${t} ==`)

execFileSync(PY, ['scripts/verify-fixtures.py', 'viewer-add'], { encoding: 'utf8' })

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

const consoleErrors = []
const failedRequests = []
const apiCalls = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('requestfailed', (r) => {
  const err = r.failure()?.errorText ?? ''
  if (err.includes('ERR_ABORTED')) return
  failedRequests.push(`${r.url()} ${err}`)
})
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`) })
page.on('request', (r) => { if (r.url().includes('/api/')) apiCalls.push(r.url()) })
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
  await page.waitForSelector('[data-calendar-title]', { timeout: 20000 })
  await page.waitForTimeout(400)
}

const state = () => page.evaluate(() => ({
  title: document.querySelector('[data-calendar-title]')?.textContent?.trim(),
  days: [...document.querySelectorAll('[data-calendar-day]')].map((d) => d.dataset.calendarDay),
  today: [...document.querySelectorAll('[data-today="true"]')].map((d) => d.dataset.calendarDay),
  events: [...document.querySelectorAll('[data-calendar-event]')].map((e) => ({
    id: e.dataset.calendarEvent,
    kind: e.dataset.sourceKind,
    record: e.dataset.recordKind,
    day: e.closest('[data-calendar-day]')?.dataset.calendarDay,
    label: e.getAttribute('aria-label') ?? '',
    tag: e.tagName,
  })),
  shown: document.body.innerText.match(/イベント (\d+) 件/)?.[1],
}))

async function apiJson(path) {
  return page.evaluate(async (p) => {
    const token = localStorage.getItem('sysken.token')
    const res = await fetch(p, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return res.json()
  }, `${API}${path}`)
}

await login('admin@example.co.jp')

// ===========================================================================
section('1. 月表示・週表示と前／次／今日')
await open('/schedule/calendar?date=2026-08-02')
let s = await state()
ok(s.title === '2026年8月', '月表示の見出し', s.title)
ok(s.days.length === 42, '月表示は月曜始まりの6週=42マス', `${s.days.length} マス`)
ok(s.days[0] === '2026-07-27', '月表示の先頭は当月を含む週の月曜', s.days[0])
// 「今日」はJSTの現在日。固定日付で判定しない（日をまたぐと壊れるため）
const jstToday = await page.evaluate(() => new Intl.DateTimeFormat('sv-SE',
  { timeZone: 'Asia/Tokyo' }).format(new Date()))
ok(s.today.length === 1 && s.today[0] === jstToday, '今日のマスを明示（JST基準）',
   `${s.today.join()} / JST ${jstToday}`)

await page.click('button[aria-label="次へ"]')
await page.waitForTimeout(600)
s = await state()
ok(s.title === '2026年9月', '「次へ」で翌月', s.title)
ok(page.url().includes('date=2026-09-02'), '基準日をURLへ保存', new URL(page.url()).search)
await page.click('button[aria-label="前へ"]')
await page.waitForTimeout(600)
ok((await state()).title === '2026年8月', '「前へ」で前月へ戻る')

await open('/schedule/calendar?date=2026-01-05')
await page.click('button:has-text("今日")')
await page.waitForTimeout(600)
s = await state()
ok(s.today.length === 1, '「今日」で当日を含む月へ移動', s.title)

await page.click('[role="group"][aria-label="表示方式"] button:has-text("週表示")')
await page.waitForTimeout(600)
s = await state()
ok(s.days.length === 7, '週表示は7マス', `${s.days.length} マス`)
ok(page.url().includes('view=week'), 'view= をURLへ保存', new URL(page.url()).search)

// ===========================================================================
section('2. URL保存・再読込・戻る／進む')
await open('/schedule/calendar?date=2026-08-02&view=week&kinds=milestone')
const weekState = await state()
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('[data-calendar-title]')
await page.waitForTimeout(400)
const reloaded = await state()
ok(reloaded.title === weekState.title && reloaded.days.length === 7,
   '再読込しても週表示と基準日を復元', reloaded.title)
ok(reloaded.events.every((e) => e.kind === 'milestone'), '再読込しても絞り込みを復元',
   `${reloaded.events.length} 件`)

await open('/schedule/calendar?date=2026-08-02')
await page.click('button[aria-label="次へ"]')
await page.waitForTimeout(600)
await page.goBack({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
ok((await state()).title === '2026年8月', '戻るで元の月へ')
await page.goForward({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
ok((await state()).title === '2026年9月', '進むで翌月へ')

// ===========================================================================
section('3. 工程・マイルストーン・各期限の表示とJST')
await open('/schedule/calendar?date=2026-07-22')
s = await state()
const api = await apiJson('/schedule/calendar/events?date_from=2026-06-29&date_to=2026-08-09&limit=5000')
const uniqueShown = new Set(s.events.map((e) => e.id))
ok(uniqueShown.size === api.displayed, '画面のイベント数がAPIと一致',
   `画面 ${uniqueShown.size} / API ${api.displayed}`)
const kinds = new Set(s.events.map((e) => e.kind))
for (const kind of ['task', 'milestone', 'quality_check', 'daily_report', 'test_record']) {
  ok(kinds.has(kind), `${kind} を表示`, `${s.events.filter((e) => e.kind === kind).length} 件`)
}
const records = new Set(s.events.map((e) => e.record))
ok(records.has('plan') && records.has('actual') && records.has('due'),
   '予定・実績・期限を区別して表示', [...records].join('/'))
ok(s.events.every((e) => e.tag === 'BUTTON' && e.label.includes('｜状態 ')),
   'キーボード操作可能で aria-label に詳細を持つ')

// JSTの日付境界: APIの start_at の日付とマスの日付が一致する（単日イベント）
const single = api.events.filter((e) => !e.end_at)
const byId = new Map(s.events.map((e) => [e.id, e]))
const mismatched = single.filter((e) => {
  const shown = byId.get(e.event_id)
  return shown && shown.day !== e.start_at.slice(0, 10)
})
ok(mismatched.length === 0, 'JSTの日付境界でずれない（単日イベントの配置）',
   `検査 ${single.length} 件 / ずれ ${mismatched.length} 件`)

// half_day 午前・午後がラベルへ出る
const halfPm = s.events.filter((e) => e.label.includes(' 午後'))
const halfAm = s.events.filter((e) => e.label.includes(' 午前'))
ok(halfPm.length > 0, 'half_day 午後を午後として表示', `${halfPm.length} 件`)
ok(halfAm.length + halfPm.length > 0, 'half_day 午前・午後を区別', `午前 ${halfAm.length} / 午後 ${halfPm.length}`)

// 複数日の工程は期間中のすべてのマスに出る（半開区間）
const spanning = api.events.find((e) => e.end_at && e.end_at.slice(0, 10) !== e.start_at.slice(0, 10))
if (spanning) {
  const cells = s.events.filter((e) => e.id === spanning.event_id).map((e) => e.day).sort()
  const lastDay = new Date(`${spanning.end_at.slice(0, 10)}T00:00:00+09:00`)
  lastDay.setDate(lastDay.getDate() - 1)
  const lastKey = lastDay.toISOString().slice(0, 10)
  ok(cells.length > 1, '期間のある工程は複数マスに並ぶ', `${cells.length} マス`)
  ok(!cells.includes(spanning.end_at.slice(0, 10)) || spanning.end_at.slice(11, 16) !== '00:00',
     '終了日時（exclusive）の当日は含めない', `終了 ${spanning.end_at} / 最終マス ${cells[cells.length - 1]} (期待 ${lastKey})`)
}

// ===========================================================================
section('4. 月跨ぎ・年跨ぎ')
await open('/schedule/calendar?date=2026-12-15')
s = await state()
ok(s.days[0] < '2026-12-01' || s.days[s.days.length - 1] > '2026-12-31',
   '月表示は前後の月のマスを含む', `${s.days[0]} 〜 ${s.days[s.days.length - 1]}`)
await page.click('button[aria-label="次へ"]')
await page.waitForTimeout(600)
s = await state()
ok(s.title === '2027年1月', '年跨ぎで翌年1月へ', s.title)
await page.click('button[aria-label="前へ"]')
await page.waitForTimeout(600)
ok((await state()).title === '2026年12月', '年跨ぎから戻れる')

// ===========================================================================
section('5. 同日複数件・同名別ID')
await open('/schedule/calendar?date=2026-07-22')
s = await state()
const perDay = new Map()
for (const e of s.events) perDay.set(e.day, [...(perDay.get(e.day) ?? []), e])
const busiest = [...perDay.values()].sort((a, b) => b.length - a.length)[0] ?? []
ok(busiest.length > 1, '同じ日の複数イベントを積み重ねて表示', `最大 ${busiest.length} 件/日`)
ok(new Set(busiest.map((e) => e.id)).size === busiest.length, '同日イベントを1件にまとめない')
const titles = api.events.map((e) => e.title)
const dupTitle = titles.find((t) => titles.filter((x) => x === t).length > 1)
if (dupTitle) {
  const sameName = api.events.filter((e) => e.title === dupTitle)
  ok(new Set(sameName.map((e) => e.event_id)).size === sameName.length,
     '同名でも event_id が別なので混同しない', `${dupTitle} が ${sameName.length} 件`)
}

// ===========================================================================
section('6. 複合フィルターのAND適用と保存検索')
const FILTER_CASES = [
  ['種別1つ', 'kinds=milestone'],
  ['種別2つ', 'kinds=milestone,quality_check'],
  ['案件＋種別', 'projects=1&kinds=task'],
  ['キーワード', 'q=' + encodeURIComponent('検査')],
]
const API_KEY = { projects: 'project_ids', kinds: 'source_kinds', statuses: 'statuses',
                  responsibles: 'responsible_ids', companies: 'company_ids', q: 'q' }
for (const [label, query] of FILTER_CASES) {
  await open(`/schedule/calendar?date=2026-07-22&${query}`)
  const shown = await state()
  const apiQuery = query.split('&').map((kv) => {
    const [k, v] = kv.split('=')
    return `${API_KEY[k] ?? k}=${v}`
  }).join('&')
  const expected = await apiJson(
    `/schedule/calendar/events?date_from=2026-06-29&date_to=2026-08-09&limit=5000&${apiQuery}`)
  ok(new Set(shown.events.map((e) => e.id)).size === expected.displayed,
     `${label}: 画面の件数がAPIのAND結果と一致`,
     `画面 ${new Set(shown.events.map((e) => e.id)).size} / API ${expected.displayed}`)
}

await open('/schedule/calendar?date=2026-07-22&kinds=milestone&view=week')
promptAnswer = `P3-5検証 ${Date.now()}`
await page.click('button[title="現在の条件を保存"]')
await page.waitForTimeout(900)
const savedName = promptAnswer
promptAnswer = null
ok(await page.evaluate((n) => [...document.querySelectorAll('select option')]
   .some((o) => o.textContent.trim() === n), savedName), '検索条件を保存できる', savedName)

await open('/schedule/calendar?date=2026-07-22')
await page.waitForTimeout(400)
const savedId = await page.evaluate((n) => {
  const sel = [...document.querySelectorAll('select')].find((x) =>
    [...x.options].some((o) => o.textContent.trim() === n))
  return [...sel.options].find((o) => o.textContent.trim() === n).value
}, savedName)
await page.selectOption(`select:has(option:text-is("${savedName}"))`, savedId)
await page.waitForTimeout(800)
const restoredUrl = new URL(page.url()).search
ok(restoredUrl.includes('kinds=milestone') && restoredUrl.includes('view=week'),
   '保存した条件を呼び出すとURLごと復元', restoredUrl)

page.once('dialog', (d) => d.accept())
await page.click('button[title="選択中の条件を削除"]')
await page.waitForTimeout(900)
ok(!(await page.evaluate((n) => [...document.querySelectorAll('select option')]
   .some((o) => o.textContent.trim() === n), savedName)), '検索条件を削除できる')

// ===========================================================================
section('7. 0件・truncated・元データへの遷移')
await open('/schedule/calendar?date=2020-01-15')
const emptyText = await page.evaluate(() => document.body.innerText)
ok(emptyText.includes('この期間に表示できる予定はありません'), '0件の空状態を表示')
ok((await state()).events.length === 0, '架空のイベントを描かない')

const truncated = await apiJson(
  '/schedule/calendar/events?date_from=2026-01-01&date_to=2026-12-31&limit=3')
ok(truncated.truncated === true && truncated.displayed === 3 && truncated.total > 3,
   'APIが total / displayed / truncated を区別して返す',
   `total ${truncated.total} / displayed ${truncated.displayed}`)

await open('/schedule/calendar?date=2026-07-22&kinds=milestone')
await page.locator('[data-calendar-event]').first().click()
await page.waitForTimeout(900)
ok(page.url().includes('/schedule/milestones'), 'マイルストーンから元画面へ遷移',
   new URL(page.url()).pathname + new URL(page.url()).search)

await open('/schedule/calendar?date=2026-07-22&kinds=task')
await page.locator('[data-calendar-event]').first().click()
await page.waitForTimeout(900)
ok(/\/projects\/\d+\/schedule$/.test(new URL(page.url()).pathname), '工程から案件工程へ遷移',
   new URL(page.url()).pathname)

// ===========================================================================
section('8. リクエスト回数（画面ごと1回）')
apiCalls.length = 0
await open('/schedule/calendar?date=2026-07-22')
const eventCalls = apiCalls.filter((u) => u.includes('/calendar/events'))
ok(eventCalls.length === 1, 'イベント取得は1画面につき1回', `${eventCalls.length} 回`)
ok(!apiCalls.some((u) => /calendar\/events\/\d+/.test(u)), '1件ずつの取得をしていない')

// ===========================================================================
section('9. 5権限と案件スコープ')
const ROLES = [
  ['admin@example.co.jp', 'ADMIN'],
  ['yamada@example.co.jp', 'PROJECT_MANAGER'],
  ['partner@example.co.jp', 'FIELD_WORKER（割当あり）'],
  ['quality@example.co.jp', 'QUALITY_MANAGER'],
  [VIEWER_EMAIL, 'VIEWER'],
]
for (const [email, role] of ROLES) {
  await login(email)
  await open('/schedule/calendar?date=2026-07-22')
  const shown = await state()
  const expected = await apiJson(
    '/schedule/calendar/events?date_from=2026-06-29&date_to=2026-08-09&limit=5000')
  const ids = new Set(shown.events.map((e) => e.id))
  ok(ids.size === expected.displayed, `${role}: 画面の件数がスコープ内APIと一致`,
     `画面 ${ids.size} / API ${expected.displayed}`)
  const projects = new Set(expected.events.map((e) => e.project_id))
  ok(role.startsWith('FIELD_WORKER') ? projects.size <= 1 : projects.size >= 1,
     `${role}: 案件スコープが効いている`, `案件 ${projects.size} 件`)
}

// ===========================================================================
section('10. 案件詳細ルート')
await login('admin@example.co.jp')
await open('/projects/1/schedule/calendar?date=2026-07-22')
const scoped = await apiJson(
  '/schedule/calendar/events?project_id=1&date_from=2026-06-29&date_to=2026-08-09&limit=5000')
ok([...new Set(scoped.events.map((e) => e.project_id))].every((p) => p === 1),
   '案件詳細ルートは対象案件だけ', `案件 ${[...new Set(scoped.events.map((e) => e.project_id))].join()}`)
await open('/projects/1/schedule/calendar?date=2026-07-22&projects=2')
const widened = await state()
ok(widened.events.every((e) => e.label.includes('KM-2026-001')) || widened.events.length === 0,
   '案件詳細ルートでURLクエリを足しても範囲が広がらない', `${widened.events.length} 件`)

// ===========================================================================
section('11. コンソールエラー・失敗リクエスト')
ok(consoleErrors.length === 0, 'コンソールエラー 0 件', consoleErrors.slice(0, 3).join(' / '))
ok(failedRequests.length === 0, '失敗リクエスト 0 件', failedRequests.slice(0, 3).join(' / '))

await browser.close()
execFileSync(PY, ['scripts/verify-fixtures.py', 'viewer-remove'], { encoding: 'utf8' })

console.log(`\n合計 ${pass + fail} 件: PASS ${pass} / FAIL ${fail}`)
process.exit(fail ? 1 : 0)
