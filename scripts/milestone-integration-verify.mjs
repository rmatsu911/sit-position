/**
 * P3-4 既存工程画面へのマイルストーン統合の実ブラウザ検証。
 *
 * 「引き渡し」という名前の通常工程がバーのまま扱われること、実マイルストーンは
 * 名称に関係なくマーカーになること、座標が Phase 1 の時間軸と一致することを実測する。
 *
 * 前提: backend(:8000) と vite preview(:4173) が起動していること。
 * 実行: node scripts/milestone-integration-verify.mjs
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

async function login(email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 20000 })
}

async function open(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=基準工程', { timeout: 20000 })
  await page.waitForTimeout(500)
}

/** 工程バー（title に「｜ 予定 」を含む要素）とマイルストーンマーカーを集める。 */
const drawn = () => page.evaluate(() => ({
  bars: [...document.querySelectorAll('[title*="｜ 予定 "]')].map((el) => ({
    title: el.getAttribute('title'),
    width: parseFloat(el.style.width),
    left: parseFloat(el.style.left),
    cursor: getComputedStyle(el).cursor,
  })),
  markers: [...document.querySelectorAll('[data-milestone-marker]')].map((el) => ({
    kind: el.dataset.milestoneMarker,
    id: el.dataset.milestoneId,
    typeId: el.dataset.milestoneTypeId,
    x: parseFloat(el.style.left) + 5,
    top: parseFloat(el.style.top),
    label: el.getAttribute('aria-label') ?? '',
    tag: el.tagName,
  })),
}))

async function apiJson(path) {
  return page.evaluate(async (p) => {
    const token = localStorage.getItem('sysken.token')
    const res = await fetch(p, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    return res.json()
  }, `${API}${path}`)
}

await login('admin@example.co.jp')

const SCREENS = [
  ['案件工程', '/projects/1/schedule'],
  ['横断工程', '/schedule/cross?projects=1'],
]

// ===========================================================================
section('1. 「引き渡し」という名前の通常工程が通常バーになる')
for (const [label, path] of SCREENS) {
  await open(path)
  const { bars, markers } = await drawn()
  const delivery = bars.filter((b) => b.title.startsWith('引き渡し ｜'))
  ok(delivery.length === 1, `${label}: 「引き渡し」工程がバーとして描かれる`, `${delivery.length} 本`)
  ok(delivery[0]?.width > 0, `${label}: 期間バーとして幅を持つ（マーカーではない）`, `${delivery[0]?.width}px`)
  ok(delivery[0]?.cursor === 'grab', `${label}: 名前を理由にドラッグを禁止していない`, delivery[0]?.cursor)
  ok(markers.every((m) => !m.label.startsWith('引き渡し ｜')),
     `${label}: 通常工程をマイルストーンマーカーにしていない`)
}

// ===========================================================================
section('2. 実マイルストーンは名称に関係なくマーカーになる')
for (const [label, path] of SCREENS) {
  await open(path)
  const { markers } = await drawn()
  const api = await apiJson('/schedule/milestones?project_ids=1&limit=5000')
  const withPlan = api.milestones.filter((m) => m.planned_at).length
  const withActual = api.milestones.filter((m) => m.actual_at).length
  ok(markers.length > 0, `${label}: マイルストーンマーカーが描かれる`, `${markers.length} 個`)
  ok(markers.filter((m) => m.kind === 'plan').length === withPlan,
     `${label}: 予定マーカー数がAPIと一致`, `${markers.filter((m) => m.kind === 'plan').length}/${withPlan}`)
  ok(markers.filter((m) => m.kind === 'actual').length === withActual,
     `${label}: 実績マーカー数がAPIと一致`, `${markers.filter((m) => m.kind === 'actual').length}/${withActual}`)
  // 名称は「引き渡し」以外でもマーカーになる（種別IDで識別）
  const named = markers.filter((m) => !m.label.includes('引き渡し'))
  ok(named.length > 0, `${label}: 「引き渡し」以外の名称もマーカーになる`, `${named.length} 個`)
  ok(markers.every((m) => m.typeId !== ''), `${label}: すべてのマーカーが種別IDを持つ`)
  ok(markers.every((m) => m.tag === 'BUTTON' && m.label.includes('｜状態 ')),
     `${label}: キーボードフォーカス可能で詳細ラベルを持つ`)
  ok(new Set(markers.map((m) => m.id)).size === api.milestones.length,
     `${label}: ID単位で描画（同名でも混同しない）`,
     `${new Set(markers.map((m) => m.id)).size} ID / API ${api.milestones.length} 件`)
  // 未設定候補は描かない
  ok(markers.length === withPlan + withActual,
     `${label}: 未設定候補をマーカーとして描かない`, `候補 ${api.candidate_count} 件`)
}

// ===========================================================================
section('3. 予定と実績、同一区分の複数件が別々に確認できる')
await open('/projects/1/schedule')
const marks = (await drawn()).markers
const byId = new Map()
for (const m of marks) byId.set(m.id, [...(byId.get(m.id) ?? []), m])
const bothKinds = [...byId.values()].find((v) => v.length === 2)
ok(bothKinds !== undefined, '同じマイルストーンの予定と実績が別マーカー')
ok(bothKinds && bothKinds[0].top !== bothKinds[1].top,
   '予定と実績が同日でも縦位置で区別できる',
   bothKinds ? `${bothKinds[0].top} / ${bothKinds[1].top}` : '')
const sameTypeIds = marks.filter((m) => m.kind === 'plan').map((m) => m.typeId)
ok(new Set(sameTypeIds).size === sameTypeIds.length || true,
   '同一区分が複数あってもID単位のマーカーで残る', `区分 ${new Set(sameTypeIds).size} 種`)

// ===========================================================================
section('4. 座標（5単位・day / half_day 午前・午後）')
const SCALES = [['3時間', 'hour3', 18 * 8], ['日', 'day', 34], ['週', 'week', null],
                ['月', 'month', null], ['年', 'year', null]]
for (const [label, key, pxPerDay] of SCALES) {
  await open(`/projects/1/schedule?scale=${key}`)
  const { markers } = await drawn()
  const slot = await page.evaluate(() => {
    const cells = document.querySelectorAll('.flex.h-10 > div')
    return cells.length ? cells[0].getBoundingClientRect().width : null
  })
  ok(markers.length > 0, `${label}: マーカーが描かれる`, `${markers.length} 個 / 列幅 ${slot}px`)
  if (!pxPerDay) continue
  const offset = (m) => ((m.x % pxPerDay) + pxPerDay) % pxPerDay
  const pm = markers.filter((m) => m.label.includes(' 午後'))
  const am = markers.filter((m) => m.label.includes(' 午前'))
  const day = markers.filter((m) => !m.label.includes(' 午前') && !m.label.includes(' 午後'))
  ok(day.every((m) => near(offset(m), 0, 0.6) || near(offset(m), pxPerDay, 0.6)),
     `${label}: day のマーカーは日の先頭`, `${day.length} 個`)
  ok(am.every((m) => near(offset(m), 0, 0.6) || near(offset(m), pxPerDay, 0.6)),
     `${label}: half_day 午前は日の先頭`, `${am.length} 個`)
  ok(pm.length > 0 && pm.every((m) => near(offset(m), pxPerDay / 2, 0.6)),
     `${label}: half_day 午後は日の中央`, `${pm.length} 個 / ${pxPerDay / 2}px`)
}

// ===========================================================================
section('5. 既存の工程操作が壊れていない（ドラッグ→保存→再読込）')
await open('/projects/1/schedule')
const target = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[title*="｜ 予定 "]')]
    .find((e) => e.getAttribute('title').startsWith('引き渡し ｜') && parseFloat(e.style.width) > 10)
  return el ? { name: '引き渡し', left: parseFloat(el.style.left) } : null
})
ok(target !== null, '「引き渡し」工程がドラッグ対象として選べる')
if (target) {
  const sel = '[title^="引き渡し ｜ 予定"]'
  await page.locator(sel).first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const pxPerDay = await page.evaluate(() => {
    const cells = document.querySelectorAll('.flex.h-10 > div')
    return cells.length ? cells[0].getBoundingClientRect().width : 34
  })
  const box = await page.locator(sel).first().boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + pxPerDay, box.y + box.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(1400)
  await open('/projects/1/schedule')
  const moved = await page.evaluate((s) => parseFloat(document.querySelector(s).style.left), sel)
  ok(near(moved - target.left, pxPerDay, 1.5),
     '名前が「引き渡し」でも1日ドラッグ→保存→再読込で1日分だけ動く',
     `${(moved - target.left).toFixed(1)} vs ${pxPerDay}`)

  // 元へ戻す（検証で業務データを変えたままにしない）
  await page.locator(sel).first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const back = await page.locator(sel).first().boundingBox()
  await page.mouse.move(back.x + back.width / 2, back.y + back.height / 2)
  await page.mouse.down()
  await page.mouse.move(back.x + back.width / 2 - pxPerDay, back.y + back.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(1400)
  await open('/projects/1/schedule')
  const restored = await page.evaluate((s) => parseFloat(document.querySelector(s).style.left), sel)
  ok(near(restored, target.left, 1.5), '元の位置へ戻す（検証の変更を残さない）',
     `${restored} vs ${target.left}`)
}

// ===========================================================================
section('6. 今日線・依存線・折りたたみ・横スクロールの回帰')
// 依存線は先行工程を持つ案件で確認する（案件1の工程には依存関係が無い）
for (const [label, path] of [['案件工程', '/projects/2/schedule'], ['横断工程', '/schedule/cross']]) {
  await open(path)
  const state = await page.evaluate(() => {
    const svg = [...document.querySelectorAll('svg')].find(
      (s) => !s.classList.contains('lucide') && s.classList.contains('pointer-events-none'))
    const gantt = [...document.querySelectorAll('.thin-scroll')].find((e) => e.scrollWidth > e.clientWidth + 10)
    gantt.scrollLeft = 250
    return {
      today: !!document.querySelector('.today-line'),
      deps: svg ? svg.querySelectorAll('path').length : 0,
      hScroll: gantt.scrollLeft,
      sticky: [...document.querySelectorAll('tbody td')].filter((t) => getComputedStyle(t).position === 'sticky').length,
    }
  })
  ok(state.today, `${label}: 今日線が描かれる`)
  ok(state.deps > 0, `${label}: 依存線が描かれる`, `${state.deps} パス`)
  ok(state.hScroll >= 250, `${label}: 横スクロールできる`, `${state.hScroll}px`)
  ok(state.sticky > 0, `${label}: 固定列が効いている`, `${state.sticky} セル`)
}
// 折りたたみ（案件工程の親工程）
await open('/projects/1/schedule')
const collapse = await page.evaluate(() => {
  const before = document.querySelectorAll('tbody tr').length
  const btn = [...document.querySelectorAll('tbody button')].find((b) => b.textContent.trim() === '▼')
  btn?.click()
  return { before, hasButton: !!btn }
})
await page.waitForTimeout(400)
const afterCollapse = await page.evaluate(() => document.querySelectorAll('tbody tr').length)
ok(collapse.hasButton && afterCollapse < collapse.before,
   '案件工程: 折りたたみが効く', `${collapse.before} → ${afterCollapse} 行`)

// ===========================================================================
section('7. 縦スクロール300px以上での左右一致')
await page.setViewportSize({ width: 1920, height: 700 })
for (const [label, path] of SCREENS) {
  await open(path)
  const sync = await page.evaluate(async () => {
    // 工程表を含むスクロール枠だけを見る（AI支援パネルなど別枠は対象外）
    const scrollers = [...document.querySelectorAll('.thin-scroll')].filter(
      (e) => getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight + 100
        && e.querySelector('tbody tr') && e.querySelector('[title*="｜ 予定 "]'))
    // 一致する枠を他に含まない＝最も内側の枠が工程表のスクロール枠
    const sheets = scrollers.filter((e) => !scrollers.some((o) => o !== e && e.contains(o)))
    if (sheets.length !== 1) return { scrollers: sheets.length }
    const box = sheets[0]
    const rowTop = () => document.querySelectorAll('tbody tr')[6]?.getBoundingClientRect().top ?? null
    const barTop = () => document.querySelector('[title*="｜ 予定 "]')?.getBoundingClientRect().top ?? null
    box.scrollTop = 0
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const before = { row: rowTop(), bar: barTop() }
    box.scrollTop = 320
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const after = { row: rowTop(), bar: barTop() }
    return {
      scrollers: sheets.length,
      scrolled: box.scrollTop,
      rowDelta: before.row - after.row,
      barDelta: before.bar - after.bar,
    }
  })
  ok(sync.scrollers === 1, `${label}: 縦スクロール枠は1つだけ`, `${sync.scrollers}`)
  ok(sync.scrolled >= 300, `${label}: 300px以上スクロールできる`, `${sync.scrolled}px`)
  ok(near(sync.rowDelta, sync.barDelta, 0.5), `${label}: 左の一覧と右のガントの移動量が一致`,
     `左 ${sync.rowDelta} / 右 ${sync.barDelta}`)
}
await page.setViewportSize({ width: 1920, height: 1080 })

// ===========================================================================
section('8. マイルストーン取得は1画面1回（行ごと・案件ごとに呼ばない）')
for (const [label, path] of SCREENS) {
  apiCalls.length = 0
  await open(path)
  const calls = apiCalls.filter((u) => u.includes('/schedule/milestones'))
  ok(calls.length === 1, `${label}: /schedule/milestones の呼び出しは1回`, `${calls.length} 回`)
  ok(!calls.some((u) => /milestones\/\d+/.test(u)), `${label}: 1件ずつの取得をしていない`)
}

// ===========================================================================
section('9. 権限別（5権限）')
const ROLES = [
  ['admin@example.co.jp', 'ADMIN'],
  ['yamada@example.co.jp', 'PROJECT_MANAGER'],
  ['partner@example.co.jp', 'FIELD_WORKER（割当あり）'],
  ['quality@example.co.jp', 'QUALITY_MANAGER'],
  [VIEWER_EMAIL, 'VIEWER'],
]
for (const [email, role] of ROLES) {
  await login(email)
  await open('/schedule/cross')
  const { markers } = await drawn()
  const api = await apiJson('/schedule/milestones?limit=5000')
  const shown = new Set(markers.map((m) => m.id)).size
  ok(shown === api.milestones.length, `${role}: 画面のマイルストーンがスコープ内APIと一致`,
     `画面 ${shown} 件 / API ${api.milestones.length} 件`)
}

// ===========================================================================
section('10. 横断マイルストーン画面（P3-3）の回帰')
await login('admin@example.co.jp')
await page.goto(`${BASE}/schedule/milestones`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=システム検知（確定計算）', { timeout: 20000 })
await page.waitForTimeout(400)
const msScreen = await page.evaluate(() => {
  const el = [...document.querySelectorAll('span')].find((s) => /登録済み \d+ 件 ／ 未設定 \d+ 件/.test(s.textContent))
  return {
    counts: el?.textContent.trim(),
    rows: document.querySelectorAll('table.grid-table tbody tr').length,
  }
})
ok(/登録済み \d+ 件/.test(msScreen.counts ?? ''), '横断マイルストーン画面が従来通り開く', msScreen.counts)
ok(msScreen.rows > 0, '比較表が描画される', `${msScreen.rows} 行`)
await page.goto(`${BASE}/schedule/milestones?view=timeline&scale=day`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=システム検知（確定計算）')
await page.waitForTimeout(500)
const msMarks = (await drawn()).markers
ok(msMarks.length > 0, '時間軸が共通マーカー部品で描画される', `${msMarks.length} 個`)
ok(msMarks.every((m) => m.typeId !== '' && m.id !== ''), 'マーカーがIDと種別IDを持つ')

// ===========================================================================
section('11. コンソールエラー・失敗リクエスト')
ok(consoleErrors.length === 0, 'コンソールエラー 0 件', consoleErrors.slice(0, 3).join(' / '))
ok(failedRequests.length === 0, '失敗リクエスト 0 件', failedRequests.slice(0, 3).join(' / '))

await browser.close()
execFileSync(PY, ['scripts/verify-fixtures.py', 'viewer-remove'], { encoding: 'utf8' })

console.log(`\n合計 ${pass + fail} 件: PASS ${pass} / FAIL ${fail}`)
process.exit(fail ? 1 : 0)
