/**
 * 表示単位（3時間/日/週/月/年）の検証。
 *
 * 案件工程・横断工程・案件絞り込み横断工程の3画面すべてで、
 * 3時間を直接選べること、3時間表示でもヘッダー・バー・今日線・依存線が
 * 同じ座標基準になること、ドラッグ結果が保存・再現されることを実測する。
 *
 * 実行: PW_CHROME=<chromeのパス> node scripts/scale-selector-verify.mjs
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
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })

const consoleErrors = []
const failedRequests = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('requestfailed', (r) => {
  // ページ遷移で中断された取得はアプリの失敗ではないため除外する
  const err = r.failure()?.errorText ?? ''
  if (err.includes('ERR_ABORTED')) return
  failedRequests.push(`${r.url()} ${err}`)
})
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`) })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASSWORD)
await page.click('button[type="submit"]')
await page.waitForURL('**/dashboard', { timeout: 15000 })

async function open(path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=基準工程', { timeout: 15000 })
  await page.waitForTimeout(500)
}

const slotWidth = () => page.evaluate(() => {
  const h = document.querySelectorAll('.thin-scroll .flex.h-10 > div')
  return h.length ? h[0].getBoundingClientRect().width : null
})

const SCREENS = [
  ['案件工程', '/projects/1/schedule'],
  ['横断工程', '/schedule/cross'],
  ['案件絞り込み横断工程', '/projects/1/schedule/cross'],
]

console.log('== 1. 3画面すべてで5単位を直接選べる ==')
for (const [label, path] of SCREENS) {
  await open(path)
  const buttons = await page.evaluate(() => {
    const group = document.querySelector('[role="group"][aria-label="表示単位"]')
    if (!group) return null
    return [...group.querySelectorAll('button')]
      .map((b) => ({ text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') }))
      .filter((b) => b.text)
  })
  ok(buttons !== null, `${label}: 表示単位の切替UIがある`)
  const labels = (buttons ?? []).map((b) => b.text)
  ok(JSON.stringify(labels) === JSON.stringify(['3時間', '日', '週', '月', '年']),
     `${label}: 3時間/日/週/月/年 が並ぶ`, labels.join('/'))
  const current = (buttons ?? []).find((b) => b.pressed === 'true')
  ok(current?.text === '日', `${label}: 現在の単位が選択状態で分かる`, current?.text)

  // 3時間ボタンを直接押す（ズームを何度も押す必要がない）
  await page.locator('[role="group"][aria-label="表示単位"] button', { hasText: /^3時間$/ }).click()
  await page.waitForTimeout(700)
  const after = await page.evaluate(() => {
    const group = document.querySelector('[role="group"][aria-label="表示単位"]')
    const pressed = [...group.querySelectorAll('button')].find((b) => b.getAttribute('aria-pressed') === 'true')
    return { pressed: pressed?.textContent.trim(), url: location.search }
  })
  ok(after.pressed === '3時間', `${label}: 3時間へ直接切り替わる`)
  ok(after.url.includes('scale=hour3'), `${label}: URLクエリに反映`, after.url)
  ok(near(await slotWidth(), 18, 0.5), `${label}: 3時間の列幅 = 18px`, await slotWidth())

  // 再読込しても復元される
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('text=基準工程', { timeout: 15000 })
  await page.waitForTimeout(500)
  const restored = await page.evaluate(() => {
    const group = document.querySelector('[role="group"][aria-label="表示単位"]')
    const pressed = [...group.querySelectorAll('button')].find((b) => b.getAttribute('aria-pressed') === 'true')
    return pressed?.textContent.trim()
  })
  ok(restored === '3時間', `${label}: 再読込後も3時間を復元`)
}

console.log('== 2. 3時間表示のヘッダーとバーの座標が一致する（案件工程）==')
await open('/projects/1/schedule?scale=hour3')
const dw3 = await slotWidth()
ok(near(dw3, 18, 0.5), '列幅 = 18px', dw3)
const hdr = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.thin-scroll .flex.h-10 > div')]
  return { count: cells.length, first: cells.slice(0, 8).map((c) => c.textContent.trim()) }
})
ok(JSON.stringify(hdr.first) === JSON.stringify(['0', '3', '6', '9', '12', '15', '18', '21']),
   'ヘッダーが3時間刻み（0,3,6…21）', hdr.first.join(','))
const repeats = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.thin-scroll .flex.h-10 > div')].map((c) => c.textContent.trim())
  return cells.every((v, i) => v === String((i % 8) * 3))
})
ok(repeats, 'すべての列が 0,3,6…21 の繰り返し（1日=8列）', `${hdr.count} 列`)

console.log('== 3. 1日工程と0.5日工程の幅が2:1（横断工程・3時間表示）==')
await open('/schedule/cross?scale=hour3&from=2026-06-17&to=2026-06-21')
const dwCross = await slotWidth()
const half = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[title*="（0.5日）"]')].find((e) => parseFloat(e.style.width) > 0)
  return el ? { left: parseFloat(el.style.left), width: parseFloat(el.style.width) } : { left: 0, width: 0 }
})
ok(near(half.width, 4 * dwCross, 0.5), '0.5日工程は4列分（＝半日）', `${half.width} vs ${4 * dwCross}`)
// 1日工程は表示期間によっては含まれないため、別の期間でも探す
let oneDay = await page.evaluate(() => {
  const el = [...document.querySelectorAll('[title*="｜ 予定 "]')]
    .find((e) => /（1日）/.test(e.getAttribute('title')) && parseFloat(e.style.width) > 0)
  return el ? { left: parseFloat(el.style.left), width: parseFloat(el.style.width) } : null
})
if (!oneDay) {
  await open('/schedule/cross?scale=hour3&from=2026-07-21&to=2026-07-23')
  oneDay = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[title*="｜ 予定 "]')]
      .find((e) => /（1日）/.test(e.getAttribute('title')) && parseFloat(e.style.width) > 0)
    return el ? { left: parseFloat(el.style.left), width: parseFloat(el.style.width) } : null
  })
}
ok(oneDay !== null, '1日工程が描画されている')
if (oneDay) {
  ok(near(oneDay.width, 8 * dwCross, 0.5), '1日工程は8列分', `${oneDay.width}`)
  ok(near(oneDay.width / half.width, 2, 0.02), '1日 : 0.5日 = 2 : 1', (oneDay.width / half.width).toFixed(3))
}
// 午前は日の先頭、午後は日の中央から始まる
const halfStartsAtDayBoundary = Math.abs(half.left % (8 * dwCross)) < 0.6
const halfStartsAtNoon = Math.abs((half.left % (8 * dwCross)) - 4 * dwCross) < 0.6
ok(halfStartsAtDayBoundary || halfStartsAtNoon,
   '0.5日工程は日の先頭（午前）か中央（午後）から始まる',
   `offset=${(half.left % (8 * dwCross)).toFixed(1)} / 半日=${(4 * dwCross).toFixed(1)}`)

console.log('== 4. 3時間表示でも今日線・依存線がバーと同じ基準 ==')
// 表示期間を指定すると今日が範囲外になり今日線は出ない（正しい挙動）ため、
// ここは期間指定なし＝現在日を含む範囲で確認する
await open('/schedule/cross?scale=hour3')
const coords = await page.evaluate(() => {
  const today = document.querySelector('.today-line')
  const svg = [...document.querySelectorAll('svg')].find(
    (s) => !s.classList.contains('lucide') && s.classList.contains('pointer-events-none'),
  )
  const paths = svg ? [...svg.querySelectorAll('path')] : []
  // 矢印(小文字 l のみ)は後続工程の開始点から描くため、接続線(大文字 L)だけを見る
  const starts = paths
    .map((p) => p.getAttribute('d'))
    .filter((d) => d.includes(' L'))
    .map((d) => parseFloat(d.match(/^M([\d.-]+),/)[1]))
  const barRights = [...document.querySelectorAll('[title*="｜ 予定 "]')]
    .map((el) => parseFloat(el.style.left) + parseFloat(el.style.width))
  return { todayX: today ? parseFloat(today.style.left) : null, depCount: paths.length, starts, barRights }
})
ok(coords.todayX !== null, '今日線が描画されている', `x=${coords.todayX}`)
ok(coords.depCount > 0, '依存線が描画されている', `${coords.depCount} パス`)
ok(coords.starts.every((x) => coords.barRights.some((r) => Math.abs(r - x) < 1.5)),
   '依存線の始点がすべて先行工程バーの右端と一致')

console.log('== 5. 3時間表示でドラッグ→保存→再読込しても位置が維持される ==')
for (const [label, path] of [['横断工程', '/schedule/cross?scale=hour3&projects=1'],
                             ['案件工程', '/projects/1/schedule?scale=hour3']]) {
  await open(path)
  // 3時間表示の範囲内に「まるごと」描かれているバーを対象にする。
  // 表示範囲の手前から続く工程は左端で切り詰められ、left が 0 に張り付いたまま
  // 動かないため、移動量を測る対象にはできない（left > 0 の工程を選ぶ）。
  // ドラッグすると title の日付が変わるため、工程名の前方一致で選ぶ。
  const targetName = await page.evaluate(() => {
    const el = [...document.querySelectorAll('[title*="｜ 予定 "]')]
      .find((e) => parseFloat(e.style.width) > 20 && parseFloat(e.style.left) > 0)
    return el ? el.getAttribute('title').split(' ｜ ')[0] : null
  })
  if (!targetName) { ok(false, `${label}: 表示範囲内のバーが見つからない`); continue }
  const sel = `[title^="${targetName} ｜ 予定"]`
  await page.locator(sel).first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const pxPerDay = (await slotWidth()) * 8
  const leftOf = () => page.evaluate((s) => {
    const el = document.querySelector(s)
    return el ? parseFloat(el.style.left) : null
  }, sel)
  const before = await page.locator(sel).first().boundingBox()
  const beforeLeft = await leftOf()
  // 1日分だけ右へドラッグ
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + pxPerDay, before.y + before.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(1300)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('text=基準工程', { timeout: 15000 })
  await page.waitForTimeout(600)
  const afterLeft = await leftOf()
  ok(near(afterLeft - beforeLeft, pxPerDay, 1.5),
     `${label}: 3時間表示で1日ドラッグ→再読込しても1日分だけ移動`,
     `${(afterLeft - beforeLeft).toFixed(1)} vs ${pxPerDay.toFixed(1)}`)

  // 元へ戻す（検証用の変更を残さない）
  await page.locator(sel).first().scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const back = await page.locator(sel).first().boundingBox()
  await page.mouse.move(back.x + back.width / 2, back.y + back.height / 2)
  await page.mouse.down()
  await page.mouse.move(back.x + back.width / 2 - pxPerDay, back.y + back.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(1300)
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('text=基準工程', { timeout: 15000 })
  await page.waitForTimeout(600)
  ok(near(await leftOf(), beforeLeft, 1.5), `${label}: 元の位置へ戻す（変更を残さない）`)
}

console.log('== 6. 3時間表示でも横スクロール・縦同期・固定列・折りたたみが壊れない ==')
await page.setViewportSize({ width: 1920, height: 720 })
for (const [label, path] of [['案件工程', '/projects/1/schedule?scale=hour3'],
                             ['横断工程', '/schedule/cross?scale=hour3']]) {
  await open(path)
  const r = await page.evaluate(async () => {
    const scrollable = [...document.querySelectorAll('.thin-scroll')].filter(
      (e) => getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight + 100,
    )
    const matched = scrollable.filter((e) => e.querySelector('tbody tr') && e.querySelector('[title*="｜ 予定 "]'))
    // 画面全体の main も条件に合うため、他の一致要素を含まない最も内側の枠を選ぶ
    const sheets = matched.filter((e) => !matched.some((o) => o !== e && e.contains(o)))
    if (sheets.length !== 1) return { sheets: sheets.length }
    const scroller = sheets[0]
    const rowTop = () => document.querySelectorAll('tbody tr')[8]?.getBoundingClientRect().top ?? null
    const barTop = () => document.querySelector('[title*="｜ 予定 "]')?.getBoundingClientRect().top ?? null
    scroller.scrollTop = 0
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
    const b = { row: rowTop(), bar: barTop() }
    scroller.scrollTop = 300
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)))
    const a = { row: rowTop(), bar: barTop() }
    const gantt = [...document.querySelectorAll('.thin-scroll')].find((e) => e.scrollWidth > e.clientWidth + 10)
    gantt.scrollLeft = 0
    gantt.scrollLeft = 200
    return {
      sheets: sheets.length,
      rowDelta: b.row - a.row,
      barDelta: b.bar - a.bar,
      hScroll: gantt.scrollLeft,
      sticky: getComputedStyle(document.querySelector('tbody td.sticky') ?? document.body).position,
    }
  })
  ok(r.sheets === 1, `${label}: 縦スクロール枠は1つ`, JSON.stringify(r))
  ok(near(r.rowDelta, r.barDelta) && near(r.rowDelta, 300), `${label}: 左右の縦位置が同期`, `行 ${r.rowDelta} / バー ${r.barDelta}`)
  ok(r.hScroll > 0, `${label}: 横スクロールできる`, `${r.hScroll}px`)
  ok(r.sticky === 'sticky', `${label}: 固定列が sticky`, r.sticky)

  const rowsBefore = await page.locator('tbody tr').count()
  const toggler = page.locator('tbody tr button', { hasText: '▼' }).first()
  if (await toggler.count()) {
    await toggler.click()
    await page.waitForTimeout(300)
    ok((await page.locator('tbody tr').count()) < rowsBefore, `${label}: 折りたたみが動く`)
    await page.locator('tbody tr button', { hasText: '▶' }).first().click()
    await page.waitForTimeout(300)
    ok((await page.locator('tbody tr').count()) === rowsBefore, `${label}: 展開して戻る`)
  }
}

console.log('\n== コンソール・通信 ==')
ok(consoleErrors.length === 0, 'コンソールエラー 0', consoleErrors.slice(0, 3).join(' | '))
ok(failedRequests.length === 0, '失敗リクエスト 0', failedRequests.slice(0, 3).join(' | '))

console.log(`\n結果: ${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail ? 1 : 0)
