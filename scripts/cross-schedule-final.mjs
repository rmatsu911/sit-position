/**
 * Phase 2 完了確認（横断工程表の最終回帰＋印刷表示＋既存案件工程の縦スクロール）。
 *
 * 実行:
 *   PW_CHROME=<chromeのパス> node scripts/cross-schedule-final.mjs
 */
import { chromium } from 'playwright'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:4173'
const API = process.env.E2E_API_URL ?? 'http://localhost:8000/api'
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
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText ?? ''}`))
page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`) })

await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
await page.fill('input[type="email"]', EMAIL)
await page.fill('input[type="password"]', PASSWORD)
await page.click('button[type="submit"]')
await page.waitForURL('**/dashboard', { timeout: 15000 })

async function gotoCross(query = '') {
  await page.goto(`${BASE}/schedule/cross${query}`, { waitUntil: 'networkidle' })
  await page.waitForSelector('text=基準工程', { timeout: 15000 })
  await page.waitForTimeout(400)
}

/** 縦スクロール枠が1つだけで、左一覧と右ガントが同じ量だけ動くか。 */
async function measureScrollSync(px) {
  return page.evaluate(async (amount) => {
    const scrollable = [...document.querySelectorAll('.thin-scroll')].filter(
      (e) => getComputedStyle(e).overflowY === 'auto' && e.scrollHeight > e.clientHeight + 100,
    )
    // 画面全体の main も縦スクロールを持つため、工程表の枠だけを対象にする
    const sheets = scrollable.filter((e) => e.querySelector('tbody tr') && e.querySelector('[title*="｜ 予定 "]'))
    if (sheets.length !== 1) return { sheets: sheets.length }
    const scroller = sheets[0]
    const rowTop = () => document.querySelectorAll('tbody tr')[10]?.getBoundingClientRect().top ?? null
    const barTop = () => document.querySelector('[title*="｜ 予定 "]')?.getBoundingClientRect().top ?? null
    scroller.scrollTop = 0
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const before = { row: rowTop(), bar: barTop() }
    scroller.scrollTop = amount
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const after = { row: rowTop(), bar: barTop() }
    return {
      sheets: sheets.length,
      scrollTop: scroller.scrollTop,
      rowDelta: before.row - after.row,
      barDelta: before.bar - after.bar,
    }
  }, px)
}

console.log('== 1. 既存「案件工程」の縦スクロール（左一覧と右ガント） ==')
// 320px 以上スクロールできる状態にするため、内容が枠を十分に超える高さで確認する
await page.setViewportSize({ width: 1920, height: 720 })
// Ver.0.4 以降、/schedule は案件を自動選択しない。
// この計測が見ていたのは自動選択されていた先頭案件なので、同じ案件を明示して開く。
await page.goto(`${BASE}/projects/1/schedule`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=基準工程', { timeout: 15000 })
await page.waitForTimeout(500)
const legacy = await measureScrollSync(320)
ok(legacy?.sheets === 1, '工程表の縦スクロール枠は1つだけ', JSON.stringify(legacy))
ok(legacy && legacy.scrollTop >= 320 - 1, '320px 以上スクロールできる', `${legacy?.scrollTop}`)
ok(legacy && near(legacy.rowDelta, legacy.barDelta) && near(legacy.rowDelta, 320),
   '左一覧の行と右ガントのバーが同じ量だけ動く',
   legacy ? `行 ${legacy.rowDelta} / バー ${legacy.barDelta}` : '')

// 横スクロール・固定列・折りたたみ・依存線・ドラッグが壊れていないこと
const legacyIntact = await page.evaluate(() => {
  // 横スクロールする枠（左一覧・右ガント）をそれぞれ実際に動かして確認する
  const panes = [...document.querySelectorAll('.thin-scroll')].filter((e) => e.scrollWidth > e.clientWidth + 10)
  const moved = panes.map((p) => {
    // ガントは今日の位置へ自動スクロール済みで右端にいることがあるため、0 に戻してから測る
    const original = p.scrollLeft
    p.scrollLeft = 0
    p.scrollLeft = 120
    const after = p.scrollLeft
    p.scrollLeft = original
    return after > 0
  })
  const stickyCell = document.querySelector('tbody td.sticky')
  return {
    hPanes: panes.length,
    hScrolled: moved.length > 0 && moved.every(Boolean),
    stickyLeft: stickyCell ? getComputedStyle(stickyCell).position : null,
    bars: document.querySelectorAll('[title*="｜ 予定 "]').length,
  }
})
ok(legacyIntact.hScrolled, '左一覧・ガントが横スクロールできる', `${legacyIntact.hPanes} 枠`)
ok(legacyIntact.stickyLeft === 'sticky', '固定列が sticky のまま', `${legacyIntact.stickyLeft}`)
ok(legacyIntact.bars > 0, '工程バーが描画されている', `${legacyIntact.bars} 本`)

// 依存線は先行工程が登録されている案件で確認する（p1 は先行工程を持たない）
await page.goto(`${BASE}/projects/2/schedule`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=基準工程', { timeout: 15000 })
await page.waitForTimeout(500)
const legacyDeps = await page.evaluate(() => {
  const svg = [...document.querySelectorAll('svg')].find(
    (s) => !s.classList.contains('lucide') && s.classList.contains('pointer-events-none'),
  )
  return svg ? svg.querySelectorAll('path').length : 0
})
ok(legacyDeps > 0, '依存線が描画されている（案件工程・先行工程あり）', `${legacyDeps} パス`)
// Ver.0.4 以降、/schedule は案件を自動選択しない。
// この計測が見ていたのは自動選択されていた先頭案件なので、同じ案件を明示して開く。
await page.goto(`${BASE}/projects/1/schedule`, { waitUntil: 'networkidle' })
await page.waitForSelector('text=基準工程', { timeout: 15000 })
await page.waitForTimeout(400)

const rowsBefore = await page.locator('tbody tr').count()
await page.locator('tbody tr button', { hasText: '▼' }).first().click()
await page.waitForTimeout(300)
const rowsAfter = await page.locator('tbody tr').count()
ok(rowsAfter < rowsBefore, '親工程の折りたたみが動く', `${rowsBefore} → ${rowsAfter}`)
await page.locator('tbody tr button', { hasText: '▶' }).first().click()
await page.waitForTimeout(300)
ok((await page.locator('tbody tr').count()) === rowsBefore, '展開して元に戻る')

console.log('== 2. 横断工程の最終回帰 ==')
await page.setViewportSize({ width: 1920, height: 1080 })
await gotoCross('?scale=day')
const overview = await page.evaluate(() => {
  const groups = [...document.querySelectorAll('tbody tr.bg-sysken-50')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim())
  return {
    groups,
    unassigned: document.body.innerText.includes('未割当'),
    total: document.body.innerText.match(/(\d+) 件/)?.[1] ?? null,
  }
})
ok(overview.groups.length >= 8, '複数案件がグループとして並ぶ', `${overview.groups.length} グループ`)

// 未割当工程
await gotoCross('?unassigned=1')
const un = await page.evaluate(() => ({
  rows: document.querySelectorAll('tbody tr').length,
  hasUnassigned: document.body.innerText.includes('未割当'),
}))
ok(un.hasUnassigned && un.rows > 0, '未割当工程が除外されず表示される', `${un.rows} 行`)

// 同名でIDが異なる担当会社
await gotoCross('?group=company')
const companies = await page.evaluate(() =>
  [...document.querySelectorAll('tbody tr.bg-sysken-50')].map((tr) => tr.innerText.replace(/\s+/g, ' ').trim()),
)
const kyushu = companies.filter((c) => c.includes('九州テクノ'))
ok(kyushu.length === 2, '同名の担当会社が別グループとして2つ並ぶ', kyushu.join(' / '))
ok(new Set(kyushu).size === 2, '同名でもIDの併記で区別できる', kyushu.join(' / '))

// グループ切替
for (const [g, expect] of [['project', '案件別'], ['manager', '担当者別'], ['company', '担当会社別']]) {
  await gotoCross(`?group=${g}`)
  const n = await page.locator('tbody tr.bg-sysken-50').count()
  ok(n > 0, `${expect}でグループ見出しが出る`, `${n} グループ`)
}

// truncated 表示
await gotoCross('?scale=day')
const truncated = await page.evaluate(async (api) => {
  const res = await fetch(`${api}/schedule/cross?limit=5`, {
    headers: { Authorization: `Bearer ${localStorage.getItem('sysken.token')}` },
  }).catch(() => null)
  return res && res.ok ? await res.json() : null
}, API)
ok(truncated?.truncated === true && truncated.tasks.length === 5,
   '上限を超えると truncated を返す', `total=${truncated?.total} 返却=${truncated?.tasks.length}`)

console.log('== 3. 印刷表示 ==')
await gotoCross('?scale=day&group=company')
await page.emulateMedia({ media: 'print' })
await page.waitForTimeout(300)
const printed = await page.evaluate(() => {
  const vis = (sel) => {
    const el = document.querySelector(sel)
    return el ? getComputedStyle(el).display !== 'none' : false
  }
  const header = document.querySelector('[data-print="only"]')
  return {
    sidebarVisible: vis('aside[data-print="hide"]'),
    appHeaderVisible: vis('header[data-print="hide"]'),
    statusBarVisible: vis('footer[data-print="hide"]'),
    ganttVisible: vis('[data-print="hide"].thin-scroll.flex-1'),
    printHeaderVisible: header ? getComputedStyle(header).display !== 'none' : false,
    printHeaderText: header ? header.innerText.replace(/\s+/g, ' ').trim() : '',
    sheetMaxHeight: getComputedStyle(document.querySelector('[data-print="sheet"]')).maxHeight,
    tableRows: document.querySelectorAll('tbody tr').length,
    stickyInPrint: [...document.querySelectorAll('tbody td')].some((td) => getComputedStyle(td).position === 'sticky'),
    docHeight: document.documentElement.scrollHeight,
  }
})
ok(!printed.sidebarVisible, '印刷でサイドバーを除外')
ok(!printed.appHeaderVisible, '印刷でアプリヘッダーを除外')
ok(!printed.statusBarVisible, '印刷でステータスバーを除外')
ok(!printed.ganttVisible, '印刷で紙幅に収まらないガントを除外')
ok(printed.printHeaderVisible, '印刷用の見出しが出る')
ok(printed.printHeaderText.includes('横断工程表'), '見出しに帳票名')
ok(/出力日時/.test(printed.printHeaderText), '出力日時を含む')
ok(/出力者/.test(printed.printHeaderText), '出力者を含む')
ok(/担当会社別/.test(printed.printHeaderText), '表示の切替（表示順）を含む')
ok(/対象工程数/.test(printed.printHeaderText), '対象工程数を含む')
ok(printed.sheetMaxHeight === 'none', 'スクロール枠の高さ制限を解除', printed.sheetMaxHeight)
ok(!printed.stickyInPrint, '印刷時に sticky を解除（列の重なりを防ぐ）')
ok(printed.docHeight > 1080, '全行が1画面に切り詰められず紙面に流れる', `${printed.docHeight}px`)

// 画面／Excel／PDF／印刷 の対象件数と条件が一致するか
const consistency = await page.evaluate(async (apiBase) => {
  const token = localStorage.getItem('sysken.token')
  const h = { Authorization: `Bearer ${token}` }
  const api = await fetch(`${apiBase}/schedule/cross`, { headers: h }).then((r) => r.json())
  const xlsx = await fetch(`${apiBase}/schedule/cross/export?format=xlsx`, { headers: h })
  const pdf = await fetch(`${apiBase}/schedule/cross/export?format=pdf`, { headers: h })
  // 印刷用見出しも table を使うため、工程一覧の tbody だけを対象にする。
  // 紙面に出ない行（data-print="hide" のマイルストーン帯など）は数えない。
  const sheetRows = [...document.querySelectorAll('[data-print="sheet"] tbody tr')]
    .filter((tr) => getComputedStyle(tr).display !== 'none')
  const printedRows = sheetRows.filter((tr) => !tr.classList.contains('bg-sysken-50')).length
  const printedGroups = sheetRows.length - printedRows
  return {
    apiTotal: api.total,
    apiRows: api.tasks.length,
    printedRows,
    printedGroups,
    // 本文まで読み切らないと、ページ遷移時に中断され失敗リクエスト扱いになる
    xlsxOk: xlsx.ok && (await xlsx.arrayBuffer()).byteLength > 0,
    pdfOk: pdf.ok && (await pdf.arrayBuffer()).byteLength > 0,
  }
}, API)
ok(consistency.printedRows === consistency.apiRows,
   '印刷される工程行数 = APIが返した工程数（画面と一致）',
   `印刷 ${consistency.printedRows} / API ${consistency.apiRows}（一致 ${consistency.apiTotal} 件）`)
ok(consistency.xlsxOk && consistency.pdfOk, 'Excel / PDF も同じ条件で生成できる')
ok(consistency.printedGroups > 0, '印刷にもグループ見出しが残る', `${consistency.printedGroups} グループ`)

await page.emulateMedia({ media: 'screen' })

console.log('== 4. 半日ドラッグ＋再読込（最終確認） ==')
await gotoCross('?scale=day&q=道路使用許可確認')
const HALF = '[title^="道路使用許可確認 ｜ 予定"][title*="（0.5日）"]'
await page.locator(HALF).first().scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
const slotW = await page.evaluate(() => {
  const h = document.querySelectorAll('.thin-scroll .flex.h-10 > div')
  return h.length ? h[0].getBoundingClientRect().width : null
})
const leftOfHalf = () => page.evaluate((sel) => {
  const el = document.querySelector(sel)
  return el ? parseFloat(el.style.left) : null
}, HALF)
const before = await page.locator(HALF).first().boundingBox()
const beforeLeft = await leftOfHalf()
await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
await page.mouse.down()
await page.mouse.move(before.x + before.width / 2 + slotW / 2, before.y + before.height / 2, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(1200)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('text=基準工程', { timeout: 15000 })
await page.waitForTimeout(500)
const afterLeft = await leftOfHalf()
ok(near(afterLeft - beforeLeft, slotW / 2), '0.5日ドラッグ→再読込で 0.5列分だけ移動', `${afterLeft - beforeLeft}`)

// 元へ戻す
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
ok(near(await leftOfHalf(), beforeLeft), '元の位置へ戻す（検証用の変更を残さない）')

console.log('== 5. 横断工程の縦スクロール（最終確認） ==')
await page.setViewportSize({ width: 1920, height: 720 })
await gotoCross('?scale=day')
const crossSync = await measureScrollSync(320)
ok(crossSync?.sheets === 1, '横断工程の縦スクロール枠も1つだけ', JSON.stringify(crossSync))
ok(crossSync && near(crossSync.rowDelta, crossSync.barDelta) && near(crossSync.rowDelta, 320),
   '左一覧と右ガントが同じ量だけ動く',
   crossSync ? `行 ${crossSync.rowDelta} / バー ${crossSync.barDelta}` : '')

console.log('\n== コンソール・通信 ==')
ok(consoleErrors.length === 0, 'コンソールエラー 0', consoleErrors.slice(0, 3).join(' | '))
ok(failedRequests.length === 0, '失敗リクエスト 0', failedRequests.slice(0, 3).join(' | '))

console.log(`\n結果: ${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail ? 1 : 0)
