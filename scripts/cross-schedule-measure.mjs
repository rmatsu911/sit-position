/**
 * 横断工程表の座標検証（Ver.0.3 Phase 2）。
 *
 * ヘッダーの列・工程バー・今日線・依存線・ドラッグ後の位置が、すべて
 * 同じ座標基準（src/lib/timeline.ts の slots）になっているかを実ブラウザで実測する。
 *
 * 実行:
 *   PW_CHROME=<chromeのパス> node scripts/cross-schedule-measure.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'
const EMAIL = process.env.E2E_EMAIL ?? 'admin@example.co.jp'
const PASSWORD = process.env.E2E_PASSWORD ?? 'Passw0rd!'
const CHROME = process.env.PW_CHROME

let pass = 0
let fail = 0
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}${extra ? ` (${extra})` : ''}`) }
  else { fail++; console.log(`  FAIL ${name} ${extra}`) }
}
const near = (a, b, tol = 0.75) => Math.abs(a - b) <= tol

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
page.on('console', (m) => { if (m.type() === 'error') console.log(`  [console] ${m.text()}`) })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASSWORD)
await page.click('button[type="submit"]')
await page.waitForURL('**/dashboard', { timeout: 15000 })

/** ガント上のバーを title 属性の前方一致で探し、絶対座標を返す。 */
async function barBox(titlePrefix) {
  const el = page.locator(`[title^="${titlePrefix}"]`).first()
  await el.waitFor({ state: 'attached', timeout: 10000 })
  return el.boundingBox()
}

async function gotoCross(query = '') {
  await page.goto(`${BASE}/schedule/cross${query}`, { waitUntil: 'networkidle' })
  // 凡例は常に描画される。システム検知は0件だと出ないため待機条件に使わない。
  await page.waitForSelector('text=基準工程', { timeout: 15000 })
  await page.waitForTimeout(400)
}

console.log('== 1. ヘッダーの列とバーが同じ座標基準か（日表示） ==')
await gotoCross('?scale=day')

// ヘッダー列の実寸（既定の日スケール = 34px）
const slotW = await page.evaluate(() => {
  const header = document.querySelectorAll('.thin-scroll .flex.h-10 > div')
  return header.length ? header[0].getBoundingClientRect().width : null
})
ok(near(slotW, 34, 0.5), 'ヘッダー列の幅 = 34px', slotW)

// 「光ケーブル敷設」= 2026-06-22〜07-04（13日間）
const cable = await barBox('光ケーブル敷設 ｜ 予定')
ok(cable !== null, '予定バーが描画されている')
ok(near(cable.width, 13 * slotW, 1.5), '13日の工程バー幅 = 13 × 列幅', `${cable.width} vs ${13 * slotW}`)

// 「クロージャ設置」= 2026-07-06〜07-11（6日間）。開始差は 06-22 → 07-06 = 14日
const closure = await barBox('クロージャ設置 ｜ 予定')
ok(near(closure.width, 6 * slotW, 1.5), '6日の工程バー幅 = 6 × 列幅', `${closure.width}`)
ok(near(closure.x - cable.x, 14 * slotW, 1.5), 'バー間の距離 = 日数 × 列幅', `${closure.x - cable.x}`)

console.log('== 2. 0.5日工程は実寸で1日の半分（最小幅でごまかさない） ==')
// 同名工程が複数案件にあるため、期間（0.5日）を含む title で一意に特定する
const HALF = '[title^="道路使用許可確認 ｜ 予定"][title*="（0.5日）"]'
const halfBar = await page.locator(HALF).first().boundingBox()
ok(near(halfBar.width, slotW / 2, 1.0), '0.5日バーの幅 = 列幅の半分', `${halfBar.width} vs ${slotW / 2}`)
// 「夜間切替作業（第1回）」は 07-21 午後 〜 07-22 午前 = 1日
const nightBar = await barBox('夜間切替作業（第1回） ｜ 予定')
ok(near(nightBar.width, slotW, 1.0), '午後開始〜翌午前終了は1日幅', `${nightBar.width}`)
// 午後開始なので列の中央から始まる
const nightOffset = (nightBar.x - cable.x) % slotW
ok(near(Math.min(nightOffset, slotW - nightOffset), slotW / 2, 1.0),
   '午後開始のバーは列の中央から始まる', `offset=${nightOffset}`)

console.log('== 3. 今日線がバーと同じ基準にあるか ==')
const todayLine = await page.locator('.today-line').first().boundingBox()
ok(todayLine !== null, '今日線が描画されている')
const measured = await page.evaluate(() => {
  const el = document.querySelector('.today-line')
  return el ? parseFloat(el.style.left) : null
})
// 「光ケーブル敷設」開始 2026-06-22 からの日数差で今日線の位置を検算する
const cableLeft = await page.evaluate(() => {
  const el = document.querySelector('[title^="光ケーブル敷設 ｜ 予定"]')
  return el ? parseFloat(el.style.left) : null
})
const daysToToday = (measured - cableLeft) / slotW
const expectedDays = (Date.now() - Date.parse('2026-06-22T00:00:00+09:00')) / 86400000
ok(near(daysToToday, expectedDays, 0.05),
   '今日線の位置 = 実時刻との日数差', `${daysToToday.toFixed(3)} vs ${expectedDays.toFixed(3)} 日`)

console.log('== 4. 依存線がバーの端に接続しているか ==')
// 依存線はガント本体の SVG のみ。lucide アイコンも同じ class を持つため除外する。
const dep = await page.evaluate(() => {
  const svg = [...document.querySelectorAll('svg')].find(
    (s) => !s.classList.contains('lucide') && s.classList.contains('pointer-events-none'),
  )
  if (!svg) return null
  const paths = svg.querySelectorAll('path')
  if (!paths.length) return null
  const m = paths[0].getAttribute('d').match(/^M([\d.-]+),([\d.-]+)/)
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]), count: paths.length } : null
})
ok(dep !== null, '依存線が描画されている', dep ? `パス ${dep.count} 本` : '')
if (!dep) { console.log('\n結果: 依存線が見つからないため以降を中断'); await browser.close(); process.exit(1) }
const barRights = await page.evaluate(() => {
  const out = []
  for (const el of document.querySelectorAll('[title*="｜ 予定 "]')) {
    out.push(parseFloat(el.style.left) + parseFloat(el.style.width))
  }
  return out
})
ok(barRights.some((r) => Math.abs(r - dep.x) < 1.5),
   '依存線の始点がいずれかのバーの右端と一致', `x=${dep.x}`)

console.log('== 5. 表示単位を変えてもヘッダーとバーの基準が一致する ==')
for (const [scale, expectW] of [['week', 60], ['month', 90], ['year', 120]]) {
  await gotoCross(`?scale=${scale}`)
  const w = await page.evaluate(() => {
    const header = document.querySelectorAll('.thin-scroll .flex.h-10 > div')
    return header.length ? header[0].getBoundingClientRect().width : null
  })
  ok(near(w, expectW, 0.5), `${scale} のヘッダー列幅 = ${expectW}px`, w)
  const total = await page.evaluate(() => {
    const header = document.querySelectorAll('.thin-scroll .flex.h-10 > div')
    return { count: header.length, sum: [...header].reduce((a, e) => a + e.getBoundingClientRect().width, 0) }
  })
  ok(near(total.sum, total.count * w, 1.5), `${scale} の総幅 = 列数 × 列幅`, `${total.count}列`)
}

console.log('== 6. 0.5日工程を0.5日刻みでドラッグ→保存→再取得 ==')
await gotoCross('?scale=day&q=道路使用許可確認')
const leftOfHalf = () => page.evaluate((sel) => {
  const el = document.querySelector(sel)
  return el ? parseFloat(el.style.left) : null
}, HALF)
// 今日の位置へ自動スクロールしているため、対象バーを画面内へ入れてから操作する
await page.locator(HALF).first().scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
const before = await page.locator(HALF).first().boundingBox()
const beforeLeft = await leftOfHalf()
ok(before !== null && before.x > 0 && before.x < 1920, 'ドラッグ対象が画面内にある', JSON.stringify(before))
// 列幅の半分だけ右へドラッグ（= 0.5日）
await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
await page.mouse.down()
await page.mouse.move(before.x + before.width / 2 + slotW / 2, before.y + before.height / 2, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(1200)

await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=基準工程', { timeout: 15000 })
await page.waitForTimeout(500)
const afterLeft = await leftOfHalf()
const afterBar = await page.locator(HALF).first().boundingBox()
ok(near(afterLeft - beforeLeft, slotW / 2, 1.0),
   '0.5日ドラッグ → 再読込しても 0.5列分だけ移動', `${afterLeft - beforeLeft} vs ${slotW / 2}`)
ok(near(afterBar.width, slotW / 2, 1.0), '移動しても幅は 0.5日のまま', `${afterBar.width}`)

// 元の位置へ戻す（検証用の変更を残さない）
await page.locator(HALF).first().scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
const back = await page.locator(HALF).first().boundingBox()
await page.mouse.move(back.x + back.width / 2, back.y + back.height / 2)
await page.mouse.down()
await page.mouse.move(back.x + back.width / 2 - slotW / 2, back.y + back.height / 2, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(1200)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=基準工程', { timeout: 15000 })
await page.waitForTimeout(500)
const restored = await leftOfHalf()
ok(near(restored, beforeLeft, 1.0), '元の位置へ戻せる（検証用の変更を残さない）', `${restored} vs ${beforeLeft}`)

console.log('== 7. 左一覧と右ガントの縦スクロールが同期する ==')
await gotoCross('?scale=day')
const sync = await page.evaluate(async () => {
  // 縦スクロールを担う外側の枠（左一覧と右ガントを内包する1つのスクロール枠）
  const scrollable = [...document.querySelectorAll('.thin-scroll')].filter(
    (e) => getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight + 100,
  )
  if (scrollable.length !== 1) return { independentScrollers: scrollable.length }
  const scroller = scrollable[0]
  const rowOf = () => document.querySelectorAll('tbody tr')[12]?.getBoundingClientRect().top ?? null
  const barOf = () => document.querySelector('[title*="｜ 予定 "]')?.getBoundingClientRect().top ?? null
  const before = { row: rowOf(), bar: barOf() }
  scroller.scrollTop = 300
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const after = { row: rowOf(), bar: barOf() }
  return {
    independentScrollers: scrollable.length,
    scrollTop: scroller.scrollTop,
    rowDelta: before.row - after.row,
    barDelta: before.bar - after.bar,
  }
})
ok(sync?.independentScrollers === 1,
   '縦スクロール枠は1つだけ（左右が別々にスクロールしない）', JSON.stringify(sync))
ok(sync !== null && sync.scrollTop === 300, '共通のスクロール枠を縦スクロールできる', JSON.stringify(sync))
ok(sync !== null && near(sync.rowDelta, 300, 1) && near(sync.barDelta, 300, 1),
   '左一覧の行と右ガントのバーが同じ量だけ動く（常に同期）',
   sync ? `行 ${sync.rowDelta} / バー ${sync.barDelta}` : '')

console.log(`\n結果: ${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail ? 1 : 0)
