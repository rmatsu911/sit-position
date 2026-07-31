/**
 * 時間軸エンジン（src/lib/timeline.ts）の検証。
 *
 * 実行:  npm run test:timeline
 *   （esbuild で TS をバンドルしてから node で実行する。テスト基盤未導入のため
 *     依存を増やさずに検証できる形にしている）
 *
 * 検証内容: ヘッダー列とバー位置の一致 / 0.5日工程の最小幅 / 可変長の月・年 /
 *           3時間粒度 / JST統一 / 今日線 / 範囲外の非表示 / 動的表示範囲
 */
import { createTimeline, groupSlots, toJst, rangeFromPeriods, MIN_BAR_WIDTH } from '../node_modules/.cache/timeline.test.mjs'
let pass = 0, fail = 0
const ok = (cond, name, extra='') => { if (cond) { pass++; console.log(`  PASS ${name}`) } else { fail++; console.log(`  FAIL ${name} ${extra}`) } }
const near = (a,b,tol=0.01) => Math.abs(a-b) <= tol

console.log('== 1. 日スケール: ヘッダー列とバー位置の一致 ==')
const tl = createTimeline({ scale:'day', from:'2026-06-01', to:'2026-06-30', slotWidth:34, now:'2026-06-10T03:00:00Z' })
ok(tl.slots.length === 30, '6月は30列', tl.slots.length)
ok(tl.totalWidth === 30*34, 'totalWidth = 列数×幅')
// 6/1 の列先頭 x=0、6/2は34
ok(tl.xOf('2026-06-01') === 0, '6/1 の x = 0')
ok(near(tl.xOf('2026-06-02'), 34), '6/2 の x = 34', tl.xOf('2026-06-02'))
// バー: 6/1〜6/3 (終了日を含む) = 3日分
const b = tl.spanOf('2026-06-01','2026-06-03',{inclusiveEndDay:true})
ok(b.left===0 && near(b.width, 3*34), '6/1〜6/3 のバーは3日幅', JSON.stringify(b))
// ヘッダー月グループの合計 = 列数（ヘッダーとバーが同じ slots 由来）
const months = groupSlots(tl,'month')
ok(months.reduce((a,m)=>a+m.span,0) === tl.slots.length, '月グループ合計 = 列数')

console.log('== 2. 0.5日(AM/PM)工程の最小幅保証 ==')
const half = tl.spanOf('2026-06-05T00:00:00+09:00','2026-06-05T12:00:00+09:00')
ok(half.visible && half.width >= MIN_BAR_WIDTH, '0.5日でも最小幅以上', JSON.stringify(half))
ok(near(half.width, 17, 0.5), '半日は列幅の半分(17px)', half.width)

console.log('== 3. 月スケール: 可変長月でも位置が正しい ==')
const tlM = createTimeline({ scale:'month', from:'2026-01-01', to:'2026-12-31', slotWidth:90 })
ok(tlM.slots.length === 12, '12列', tlM.slots.length)
ok(tlM.xOf('2026-02-01') === 90, '2月頭 = 90px')
// 2月中旬(2/15)は 2月列の 14/28 = 0.5 → 90 + 45
ok(near(tlM.xOf('2026-02-15'), 90+45, 1), '2/15は2月列のほぼ中央', tlM.xOf('2026-02-15'))
// 3月頭は 180（1月31日+2月28日を跨いでも列単位で正しい）
ok(tlM.xOf('2026-03-01') === 180, '3月頭 = 180px')

console.log('== 4. 3時間スケール ==')
const tlH = createTimeline({ scale:'hour3', from:'2026-06-01', to:'2026-06-01T23:59:59+09:00', slotWidth:18 })
ok(tlH.slots.length === 8, '1日=8列', tlH.slots.length)
ok(near(tlH.xOf('2026-06-01T12:00:00+09:00'), 4*18), '正午 = 4列目', tlH.xOf('2026-06-01T12:00:00+09:00'))

console.log('== 5. タイムゾーン(JST)統一 ==')
// UTC 2026-06-01T15:00Z = JST 2026-06-02 00:00 → 6/2 の位置
ok(near(tl.xOf('2026-06-01T15:00:00Z'), 34), 'UTC15時=JST翌日0時として扱う', tl.xOf('2026-06-01T15:00:00Z'))
ok(toJst('2026-06-01').getDate() === 1, '日付のみ文字列はJSTのその日0時')

console.log('== 6. 今日線 ==')
ok(tl.todayX !== null && near(tl.todayX, 9*34 + 34*(12/24), 1), '今日線は実時刻位置', tl.todayX)
const tlOut = createTimeline({ scale:'day', from:'2020-01-01', to:'2020-01-10', now:'2026-06-10' })
ok(tlOut.todayX === null, '範囲外なら今日線なし')

console.log('== 7. 範囲外バーは描画しない ==')
ok(tl.spanOf('2026-08-01','2026-08-05',{inclusiveEndDay:true}).visible === false, '範囲外は visible=false')

console.log('== 8. rangeFromPeriods（動的範囲） ==')
const r = rangeFromPeriods([{start:'2026-06-01',end:'2026-06-30'}], {now:'2026-06-15', padDays:7})
ok(r.from <= toJst('2026-06-01') && r.to >= toJst('2026-06-30'), '工程期間を内包する')
const rEmpty = rangeFromPeriods([], {now:'2026-06-15'})
ok(rEmpty.from < rEmpty.to, 'データ0件でも有効な範囲を返す')

console.log(`\n結果: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
