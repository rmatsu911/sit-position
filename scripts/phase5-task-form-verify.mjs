/**
 * Ver.0.5 Phase 5 項目2-(2)「時間精度・依存関係・工程フォーム」の実ブラウザ回帰。
 *
 * 一意な工事番号で検証用の案件を1件だけ作り、その案件の工程管理画面で
 * 日／半日／時間の3粒度・複数先行工程・全入力項目・ドラッグ・再読込を通しで確認する。
 *
 * 検証で作った案件・工程は消さない（本番相当データを物理削除しない方針）。
 *
 * 前提: backend(:8000) と vite preview(:4173) が起動していること。
 * 実行: node scripts/phase5-task-form-verify.mjs
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
const NUMBER = `P5TF-${STAMP}`
const NAME = `Phase5工程フォーム回帰 ${STAMP}`

// ===== API（画面が保存した内容を、画面とは別の経路で確かめる） =====
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

/** APIが返す日時を JST の壁時計へ揃える（保存した瞬間と同じかを比べるため） */
function jst(iso) {
  if (!iso) return null
  const d = new Date(iso)
  const p = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  return p.replace(' ', 'T')
}

const auth = await (await fetch(`${API}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})).json()
token = auth.access_token

const project = await api('/projects', {
  method: 'POST',
  body: JSON.stringify({ construction_number: NUMBER, name: NAME }),
})
console.log(`検証案件: ${NUMBER} / id=${project.id}`)

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const consoleErrors = []
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

async function login() {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('**/dashboard', { timeout: 20000 })
}

async function openSchedule() {
  await page.goto(`${BASE}/projects/${project.id}/schedule`, { waitUntil: 'networkidle' })
  await page.waitForSelector('[data-fixed-project]', { timeout: 20000 })
}

/** 工程追加モーダルを開く */
async function openCreate() {
  await page.click('button:has-text("工程追加")')
  await page.waitForSelector('[data-task-editor]', { timeout: 10000 })
}

async function save() {
  // モーダル内の保存（ツールバーの「基準工程保存」と区別する）
  await page.click('.fixed.inset-0 button:has-text("保存")')
  await page.waitForSelector('[data-task-editor]', { state: 'detached', timeout: 15000 })
  await page.waitForTimeout(600)
}

async function setUnit(label) {
  await page.click(`[data-schedule-unit] button:has-text("${label}")`)
}

const tasksOf = () => api(`/projects/${project.id}/tasks`)
const byName = async (name) => (await tasksOf()).find((t) => t.name === name)

await login()
await openSchedule()

// ---------------------------------------------------------------- 1. 日単位
section('1. 1日単位で登録できる')
await openCreate()
await page.locator('[aria-label="工程名"]').fill('日単位の工程')
await page.locator('[aria-label="開始予定日"]').fill('2026-09-01')
await page.locator('[aria-label="終了予定日"]').fill('2026-09-03')
await page.locator('[aria-label="予定人数"]').fill('4')
await page.locator('[aria-label="実績人数"]').fill('3')
await page.locator('[aria-label="予定進捗"]').fill('60')
await page.locator('[aria-label="実績進捗"]').fill('40')
await page.locator('[aria-label="備考"]').fill('日単位の備考')
await save()
{
  const t = await byName('日単位の工程')
  ok(!!t, '1日単位の工程が登録される')
  ok(t?.schedule_precision === 'day', '粒度が day で保存される', t?.schedule_precision)
  ok(jst(t?.planned_start_at) === '2026-09-01T00:00', '開始は当日0時', jst(t?.planned_start_at))
  // 終了は exclusive（9/3 の終わり = 9/4 の0時）
  ok(jst(t?.planned_finish_at) === '2026-09-04T00:00', '終了は翌日0時（半開区間）', jst(t?.planned_finish_at))
  ok(t?.planned_workers === 4 && t?.actual_workers === 3, '予定人数・実績人数が保存される', `${t?.planned_workers}/${t?.actual_workers}`)
  ok(t?.planned_progress === 60 && t?.actual_progress === 40, '予定進捗と実績進捗が別々に保存される', `${t?.planned_progress}/${t?.actual_progress}`)
  ok(t?.notes === '日単位の備考', '備考が保存される', t?.notes)
}

// ---------------------------------------------------------------- 2. 0.5日単位
section('2. 0.5日単位で登録できる')
await openCreate()
await page.locator('[aria-label="工程名"]').fill('半日の工程')
await setUnit('0.5日単位')
await page.locator('[aria-label="開始予定日"]').fill('2026-09-07')
await page.locator('[aria-label="午前/午後"]').first().selectOption('PM')
await page.locator('[aria-label="終了予定日"]').fill('2026-09-08')
await page.locator('[aria-label="午前/午後"]').nth(1).selectOption('AM')
await save()
{
  const t = await byName('半日の工程')
  ok(t?.schedule_precision === 'half_day', '粒度が half_day で保存される', t?.schedule_precision)
  ok(jst(t?.planned_start_at) === '2026-09-07T12:00', '午後開始は12:00', jst(t?.planned_start_at))
  ok(jst(t?.planned_finish_at) === '2026-09-08T12:00', '午前終了は当日12:00', jst(t?.planned_finish_at))
}

// ---------------------------------------------------------------- 3. 時間単位
section('3. 時間単位で登録できる')
await openCreate()
await page.locator('[aria-label="工程名"]').fill('時間指定の工程')
await setUnit('時間単位')
await page.locator('[aria-label="開始予定日"]').fill('2026-09-10')
await page.locator('[data-task-editor] input[type="time"]').first().fill('09:30')
await page.locator('[aria-label="終了予定日"]').fill('2026-09-10')
await page.locator('[data-task-editor] input[type="time"]').nth(1).fill('17:15')
await save()
{
  const t = await byName('時間指定の工程')
  ok(t?.schedule_precision === 'time', '粒度が time で保存される', t?.schedule_precision)
  ok(jst(t?.planned_start_at) === '2026-09-10T09:30', '開始時刻がそのまま保存される', jst(t?.planned_start_at))
  ok(jst(t?.planned_finish_at) === '2026-09-10T17:15', '終了時刻がそのまま保存される', jst(t?.planned_finish_at))
}

section('4. 一覧の表示にも時刻が出る')
await openSchedule()
{
  const row = page.locator('tbody tr', { hasText: '時間指定の工程' }).first()
  const text = await row.innerText()
  ok(text.includes('09:30'), '開始予定に時刻が出る', text.replace(/\s+/g, ' ').slice(0, 90))
  ok(text.includes('17:15'), '終了予定に時刻が出る')
  const dayRow = page.locator('tbody tr', { hasText: '日単位の工程' }).first()
  ok(!(await dayRow.innerText()).includes(':'), '日単位の行には時刻を出さない')
}

// ---------------------------------------------------------------- 5. 粒度の往復
section('5. 単位を切り替えても日付を壊さない')
await openSchedule()
await page.locator('tbody tr', { hasText: '時間指定の工程' }).first().click({ button: 'right' })
await page.click('text=工程を編集')
await page.waitForSelector('[data-task-editor]')
{
  const start = await page.locator('[aria-label="開始予定日"]').inputValue()
  const t0 = await page.locator('[data-task-editor] input[type="time"]').first().inputValue()
  ok(start === '2026-09-10', '編集時に開始日が復元される', start)
  ok(t0 === '09:30', '編集時に開始時刻が復元される', t0)
  // 1日単位へ切り替えても日付は残る
  await setUnit('1日単位')
  ok(await page.locator('[aria-label="開始予定日"]').inputValue() === '2026-09-10', '単位を変えても開始日は残る')
  ok(await page.locator('[data-task-editor] input[type="time"]').count() === 0, '1日単位では時刻欄を出さない')
  // 時間単位へ戻すと時刻も残っている
  await setUnit('時間単位')
  ok(await page.locator('[data-task-editor] input[type="time"]').first().inputValue() === '09:30', '時間単位へ戻すと時刻も残る')
}
await page.click('.fixed.inset-0 button:has-text("キャンセル")')

// ---------------------------------------------------------------- 6. 複数先行工程
section('6. 先行工程を複数選べる')
await openSchedule()
await page.locator('tbody tr', { hasText: '時間指定の工程' }).first().click({ button: 'right' })
await page.click('text=工程を編集')
await page.waitForSelector('[data-predecessors]')
{
  const boxes = page.locator('[data-predecessors] input[type="checkbox"]')
  const count = await boxes.count()
  ok(count === 2, '自分以外の工程が候補に出る', String(count))
  await boxes.nth(0).check()
  await boxes.nth(1).check()
  await page.locator('[aria-label="変更理由"]').fill('回帰テスト：先行工程を2件設定')
  await save()

  const t = await byName('時間指定の工程')
  ok(t?.dependencies.length === 2, '先行工程が2件保存される', String(t?.dependencies.length))

  const history = await api(`/tasks/${t.id}/history`).catch(() => null)
  if (history) {
    const dep = history.find((h) => h.field === 'dependencies')
    ok(!!dep, '先行工程の変更が履歴に残る')
    ok(dep?.change_reason === '回帰テスト：先行工程を2件設定', '変更理由が履歴に残る', dep?.change_reason)
  } else {
    console.log('  （工程変更履歴のAPIが無いため、履歴の確認はAPIテスト側で担保）')
  }
}

section('7. 先行工程を外せる／再読込しても保たれる')
await openSchedule()
{
  const row = page.locator('tbody tr', { hasText: '時間指定の工程' }).first()
  ok((await row.innerText()).includes(','), '一覧の「先行」に2件表示される', (await row.innerText()).slice(-30))
  await row.click({ button: 'right' })
  await page.click('text=工程を編集')
  await page.waitForSelector('[data-predecessors]')
  const boxes = page.locator('[data-predecessors] input[type="checkbox"]')
  ok(await boxes.nth(0).isChecked() && await boxes.nth(1).isChecked(), '再度開くと選択状態が復元される')
  await boxes.nth(0).uncheck()
  await save()
  const t = await byName('時間指定の工程')
  ok(t?.dependencies.length === 1, '外した先行工程が保存される', String(t?.dependencies.length))
}

// ---------------------------------------------------------------- 8. 循環拒否
section('8. 循環する先行工程は保存できない')
{
  const all = await tasksOf()
  const timeTask = all.find((t) => t.name === '時間指定の工程')
  const pred = all.find((t) => t.id === timeTask.dependencies[0])
  // 先行工程側に「時間指定の工程」を先行として付けると循環になる
  const r = await fetch(`${API}/tasks/${pred.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ dependency_ids: [timeTask.id] }),
  })
  ok(r.status === 422, '循環する指定はAPIが422で拒否する', String(r.status))
  const after = await byName(pred.name)
  ok(after.dependencies.length === 0, '拒否されても既存の依存は壊れない')
}

// ---------------------------------------------------------------- 9. 担当情報
section('9. 担当情報（工種・担当班・責任者・担当会社）を保存できる')
await openSchedule()
await page.locator('tbody tr', { hasText: '日単位の工程' }).first().click({ button: 'right' })
await page.click('text=工程を編集')
await page.waitForSelector('[data-task-editor]')
{
  const picked = {}
  for (const label of ['工種', '担当班', '責任者', '担当会社']) {
    const sel = page.locator(`[aria-label="${label}"]`)
    const options = await sel.locator('option').allTextContents()
    if (options.length <= 1) {
      console.log(`  （${label}: マスタが空のため選択できないことを確認）`)
      ok(await sel.isDisabled(), `${label}: 候補が無いときは選べない状態で示す`)
      continue
    }
    await sel.selectOption({ index: 1 })
    picked[label] = options[1]
  }
  await save()
  const t = await byName('日単位の工程')
  if (picked['工種']) ok(t?.work_type === picked['工種'], '工種が保存される', `${t?.work_type}`)
  if (picked['担当班']) ok(t?.crew === picked['担当班'], '担当班が保存される（固定文字列ではない）', `${t?.crew}`)
  if (picked['責任者']) ok(t?.manager === picked['責任者'], '責任者が保存される', `${t?.manager}`)
  if (picked['担当会社']) ok(t?.company === picked['担当会社'], '担当会社が保存される', `${t?.company}`)

  await openSchedule()
  const row = await page.locator('tbody tr', { hasText: '日単位の工程' }).first().innerText()
  if (picked['担当班']) ok(row.includes(picked['担当班']), '一覧の担当班列に実データが出る', row.replace(/\s+/g, ' ').slice(0, 90))
}

// ---------------------------------------------------------------- 10. 親工程
section('10. 親工程をフォームから付け替えられる')
await openSchedule()
await page.locator('tbody tr', { hasText: '半日の工程' }).first().click({ button: 'right' })
await page.click('text=工程を編集')
await page.waitForSelector('[data-task-editor]')
{
  const sel = page.locator('[aria-label="親工程"]')
  const labels = await sel.locator('option').allTextContents()
  ok(!labels.some((l) => l.includes('半日の工程')), '自分自身は親の候補に出ない', labels.join(' / '))
  await sel.selectOption({ label: labels.find((l) => l.includes('日単位の工程')) })
  await save()
  const all = await tasksOf()
  const child = all.find((t) => t.name === '半日の工程')
  const parent = all.find((t) => t.name === '日単位の工程')
  ok(child?.parent_task_id === parent?.id, '親工程が保存される')
}

// ---------------------------------------------------------------- 11. ドラッグ
section('11. ドラッグしても粒度と時刻が保たれる')
await openSchedule()
{
  const before = await byName('時間指定の工程')
  const bar = page.locator(`[data-task-bar="${before.id}"]`).first()
  ok(await bar.count() > 0, 'ガントに工程バーが描かれる')
  // ガントは横スクロールするため、バーを画面内へ入れてから座標を取る
  await bar.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const box = await bar.boundingBox()
  const cy = box.y + box.height / 2
  // バー本体（左端寄り）を掴むと移動。右端はリサイズハンドルなので避ける。
  await page.mouse.move(box.x + 1, cy)
  await page.mouse.down()
  await page.waitForTimeout(150)
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(box.x + 1 - i * 12, cy)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(300)
  await page.mouse.up()
  await page.waitForTimeout(1500)

  const after = await byName('時間指定の工程')
  ok(after.schedule_precision === 'time', 'ドラッグ後も粒度は time のまま', after.schedule_precision)
  ok(jst(after.planned_start_at) !== jst(before.planned_start_at), 'ドラッグで日程が実際に動く',
     `${jst(before.planned_start_at)} → ${jst(after.planned_start_at)}`)
  // 時間単位は1時間刻みで動く（日単位に丸めない・分は保たれる）
  const beforeMin = jst(before.planned_start_at).slice(-2)
  ok(jst(after.planned_start_at).endsWith(beforeMin), 'ドラッグ後も「分」は保たれる（1時間刻み）',
     jst(after.planned_start_at))
  ok(jst(after.planned_finish_at).endsWith(jst(before.planned_finish_at).slice(-2)),
     '終了側の「分」も保たれる', jst(after.planned_finish_at))
  const beforeLen = new Date(before.planned_finish_at) - new Date(before.planned_start_at)
  const afterLen = new Date(after.planned_finish_at) - new Date(after.planned_start_at)
  ok(beforeLen === afterLen, '移動しても期間の長さは変わらない', `${beforeLen}/${afterLen}`)
}

section('11b. リサイズで終了を開始より前へは縮められない')
await openSchedule()
{
  const before = await byName('時間指定の工程')
  const bar = page.locator(`[data-task-bar="${before.id}"]`).first()
  await bar.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  const box = await bar.boundingBox()
  const cy = box.y + box.height / 2
  // 右端のリサイズハンドルを掴んで、開始より手前まで大きく左へ縮める
  await page.mouse.move(box.x + box.width - 1, cy)
  await page.mouse.down()
  await page.waitForTimeout(150)
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(box.x + box.width - 1 - i * 15, cy)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(300)
  await page.mouse.up()
  await page.waitForTimeout(1500)

  const after = await byName('時間指定の工程')
  ok(jst(after.planned_start_at) === jst(before.planned_start_at), 'リサイズでは開始が動かない',
     jst(after.planned_start_at))
  ok(new Date(after.planned_finish_at) > new Date(after.planned_start_at),
     '終了が開始より前になる保存はされない',
     `${jst(after.planned_start_at)} 〜 ${jst(after.planned_finish_at)}`)

  // APIも同じ判定で拒否する（画面だけの防御にしない）
  const r = await fetch(`${API}/tasks/${before.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ planned_finish_at: '2026-09-01T00:00:00+09:00' }),
  })
  ok(r.status === 422, '終了だけを開始より前にする更新をAPIが422で拒否する', String(r.status))
}

section('12. 再読込しても保存内容が変わらない')
await openSchedule()
{
  const snapshot = await tasksOf()
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-fixed-project]')
  const again = await tasksOf()
  ok(JSON.stringify(snapshot) === JSON.stringify(again), '再読込の前後で工程データが一致する')
  const rows = await page.locator('tbody tr').count()
  ok(rows >= 3, '再読込後も工程行が描画される', String(rows))
}

section('コンソール')
ok(consoleErrors.length === 0, 'コンソールエラー 0', consoleErrors.slice(0, 3).join(' | '))

console.log(`\n検証で作成した案件: ${NUMBER} / id=${project.id}（削除しない）`)
console.log(`結果: ${pass} passed, ${fail} failed`)
await browser.close()
process.exit(fail ? 1 : 0)
