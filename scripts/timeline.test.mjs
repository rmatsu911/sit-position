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
import {
  createTimeline, groupSlots, toJst, rangeFromPeriods, MIN_BAR_WIDTH,
  startAtOf, endAtOf, splitStartAt, splitEndAt, durationInDays, isHalfDayPeriod, formatPeriod,
} from '../node_modules/.cache/timeline.test.mjs'
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
ok(toJst(r.from) <= toJst('2026-06-01') && toJst(r.to) >= toJst('2026-06-30'), '工程期間を内包する')
const rEmpty = rangeFromPeriods([], {now:'2026-06-15'})
ok(toJst(rEmpty.from) < toJst(rEmpty.to), 'データ0件でも有効な範囲を返す')

console.log('== 9. 0.5日(AM/PM)の期間計算 ==')
// 午前 = 00:00-12:00 / 午後 = 12:00-翌0:00、終了は exclusive
// 値を返す関数はISO文字列（再変換事故を防ぐ設計）
ok(startAtOf('2026-06-01','AM') === '2026-06-01T00:00:00+09:00', '午前開始 = 当日00:00 JST', startAtOf('2026-06-01','AM'))
ok(startAtOf('2026-06-01','PM') === '2026-06-01T12:00:00+09:00', '午後開始 = 当日12:00 JST')
ok(endAtOf('2026-06-01','AM') === '2026-06-01T12:00:00+09:00', '午前まで = 当日12:00(exclusive)')
ok(endAtOf('2026-06-01','PM') === '2026-06-02T00:00:00+09:00', '午後まで = 翌日00:00(exclusive)')
ok(toJst(startAtOf('2026-06-01','PM')).getHours() === 12, 'ISO→JST壁時計が12時になる')
// 長さ
ok(durationInDays(startAtOf('2026-06-01','AM'), endAtOf('2026-06-01','AM')) === 0.5, '同日 午前のみ = 0.5日')
ok(durationInDays(startAtOf('2026-06-01','PM'), endAtOf('2026-06-01','PM')) === 0.5, '同日 午後のみ = 0.5日')
ok(durationInDays(startAtOf('2026-06-01','AM'), endAtOf('2026-06-01','PM')) === 1, '同日 午前開始・午後終了 = 1日')
ok(durationInDays(startAtOf('2026-06-01','PM'), endAtOf('2026-06-03','AM')) === 2, '日跨ぎ 午後開始〜午前終了 = 2日')
ok(durationInDays(startAtOf('2026-06-01','AM'), endAtOf('2026-06-03','PM')) === 3, '日跨ぎ 3日')
// 日時 → 日付+区分 の往復
const rs = splitStartAt(startAtOf('2026-06-05','PM'))
ok(rs.dateKey === '2026-06-05' && rs.half === 'PM', '開始の往復変換')
const re1 = splitEndAt(endAtOf('2026-06-05','AM'))
ok(re1.dateKey === '2026-06-05' && re1.half === 'AM', '終了(午前)の往復変換')
const re2 = splitEndAt(endAtOf('2026-06-05','PM'))
ok(re2.dateKey === '2026-06-05' && re2.half === 'PM', '終了(午後)の往復変換')
// 判定・表示
ok(isHalfDayPeriod(startAtOf('2026-06-01','AM'), endAtOf('2026-06-01','AM')) === true, '半日期間を判定できる')
ok(isHalfDayPeriod(startAtOf('2026-06-01','AM'), endAtOf('2026-06-02','PM')) === false, '日単位は半日と判定しない')
ok(formatPeriod(startAtOf('2026-06-01','PM'), endAtOf('2026-06-01','PM'), 'half_day') === '06-01 午後', '半日の表記')

console.log('== 10. 0.5日バーは実寸で半分（最小幅でのごまかし禁止） ==')
const tlH2 = createTimeline({ scale:'day', from:'2026-06-01', to:'2026-06-30', slotWidth:34 })
const amBar = tlH2.spanOf(startAtOf('2026-06-02','AM'), endAtOf('2026-06-02','AM'))
const pmBar = tlH2.spanOf(startAtOf('2026-06-02','PM'), endAtOf('2026-06-02','PM'))
const dayBar = tlH2.spanOf(startAtOf('2026-06-02','AM'), endAtOf('2026-06-02','PM'))
ok(near(amBar.width, 17), '午前バーの幅 = 17px(半日)', amBar.width)
ok(near(pmBar.width, 17), '午後バーの幅 = 17px(半日)', pmBar.width)
ok(near(dayBar.width, 34), '1日バーの幅 = 34px', dayBar.width)
ok(near(amBar.left, 34) && near(pmBar.left, 34+17), '午前は日の先頭・午後は中央から始まる')
ok(amBar.width * 2 === dayBar.width, '0.5日は1日のちょうど半分')
// 月表示のように列幅が狭くても、最小幅で長さをごまかさない
const tlMonthZoom = createTimeline({ scale:'day', from:'2026-06-01', to:'2026-08-31', slotWidth:7 })
const amNarrow = tlMonthZoom.spanOf(startAtOf('2026-06-02','AM'), endAtOf('2026-06-02','AM'))
const dayNarrow = tlMonthZoom.spanOf(startAtOf('2026-06-02','AM'), endAtOf('2026-06-02','PM'))
ok(near(amNarrow.width / dayNarrow.width, 0.5, 0.02), '狭い列幅でも0.5日は1日の半分', `${amNarrow.width}/${dayNarrow.width}`)
ok(amNarrow.width >= MIN_BAR_WIDTH, '潰れない最小幅は確保する', amNarrow.width)

console.log('== 11. 保存→再取得で同じ位置（ISO往復） ==')
const savedStart = startAtOf('2026-06-10','PM')
const savedEnd = endAtOf('2026-06-11','AM')
const barA = tlH2.spanOf(startAtOf('2026-06-10','PM'), endAtOf('2026-06-11','AM'))
const barB = tlH2.spanOf(savedStart, savedEnd)
ok(near(barA.left, barB.left) && near(barA.width, barB.width), 'ISO文字列を往復しても同じ位置・長さ', `${barA.left}/${barB.left}`)
ok(near(barB.width, 34), '午後開始〜翌午前終了 = 1日幅', barB.width)

console.log(`\n結果: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
