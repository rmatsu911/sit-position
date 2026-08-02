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
  shiftDays, snapDelta, snapStepOf, rangeForScale, DEFAULT_SLOT_WIDTH,
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

console.log('== 12. ドラッグのスナップ（Phase 2: 横断工程表） ==')
ok(snapStepOf('day') === 1, '日単位の刻みは1日')
ok(snapStepOf('half_day') === 0.5, '0.5日単位の刻みは0.5日')
ok(snapStepOf('time') === 1, '時刻指定は Phase 2 では日単位扱い')
// 列幅34pxで 20px 動かした場合
ok(snapDelta(20, 34, 'day') === 1, '日単位: 20px → 1日', snapDelta(20,34,'day'))
ok(snapDelta(20, 34, 'half_day') === 0.5, '0.5日単位: 20px → 0.5日', snapDelta(20,34,'half_day'))
ok(snapDelta(12, 34, 'half_day') === 0.5, '0.5日単位: 12px → 0.5日', snapDelta(12,34,'half_day'))
ok(snapDelta(6, 34, 'half_day') === 0, '0.5日単位: 6px は刻みの半分未満なので動かない', snapDelta(6,34,'half_day'))
ok(snapDelta(8, 34, 'day') === 0, '日単位: 8px → 移動しない', snapDelta(8,34,'day'))
ok(snapDelta(-20, 34, 'half_day') === -0.5, '負方向も0.5日刻み', snapDelta(-20,34,'half_day'))

console.log('== 13. 0.5日ずらしても区分と長さが保たれる ==')
const pmStart = startAtOf('2026-06-10','PM')   // 06-10 12:00
const pmEnd = endAtOf('2026-06-10','PM')       // 06-11 00:00
const movedS = shiftDays(pmStart, 0.5)
const movedE = shiftDays(pmEnd, 0.5)
ok(splitStartAt(movedS).dateKey === '2026-06-11' && splitStartAt(movedS).half === 'AM',
   '午後の0.5日工程を +0.5日 → 翌日の午前', `${movedS}`)
ok(durationInDays(movedS, movedE) === 0.5, '0.5日移動しても長さは0.5日', durationInDays(movedS, movedE))
const movedBack = shiftDays(movedS, -0.5)
ok(movedBack === pmStart, '戻すと元の日時に一致', `${movedBack} vs ${pmStart}`)
// 整数の移動は従来どおり（既存の案件工程の挙動を変えない）
ok(shiftDays(pmStart, 2) === startAtOf('2026-06-12','PM'), '2日移動しても午後のまま')
// 月をまたいでも正しい
ok(shiftDays(startAtOf('2026-06-30','PM'), 0.5) === startAtOf('2026-07-01','AM'), '月跨ぎの0.5日移動')
// うるう年の 2/28 → 2/29
ok(shiftDays(startAtOf('2028-02-28','PM'), 0.5) === startAtOf('2028-02-29','AM'), 'うるう年の0.5日移動')

console.log('== 14. 横断工程表の表示単位（3時間〜年） ==')
for (const [scale, from, to, expected] of [
  ['hour3', '2026-06-01', '2026-06-01T23:59:59+09:00', 8],
  ['day',   '2026-06-01', '2026-06-30', 30],
  ['week',  '2026-06-01', '2026-06-28', 4],
  ['month', '2026-01-01', '2026-12-31', 12],
  ['year',  '2024-01-01', '2026-12-31', 3],
]) {
  const t = createTimeline({ scale, from, to, now: '2026-06-10T03:00:00Z' })
  ok(t.slots.length === expected, `${scale} の列数 = ${expected}`, t.slots.length)
  ok(t.totalWidth === t.slots.length * t.slotWidth, `${scale} の totalWidth が列数×幅`)
}
// 年跨ぎ・うるう年の月表示
const tlLeap = createTimeline({ scale:'month', from:'2027-11-01', to:'2028-03-31', slotWidth:90 })
ok(tlLeap.slots.length === 5, '年をまたぐ月表示は5列', tlLeap.slots.length)
const feb = tlLeap.slots[3]
ok(feb.start.getMonth() === 1 && feb.start.getFullYear() === 2028, '4列目が2028年2月')
ok((feb.end - feb.start) / 86400000 === 29, 'うるう年の2月は29日', (feb.end - feb.start) / 86400000)
// 月表示でも 0.5日は1日の半分の実寸
const halfLeap = tlLeap.spanOf(startAtOf('2028-02-10','AM'), endAtOf('2028-02-10','AM'))
const dayLeap = tlLeap.spanOf(startAtOf('2028-02-10','AM'), endAtOf('2028-02-10','PM'))
ok(near(halfLeap.width / dayLeap.width, 0.5, 0.02), '月表示でも0.5日は1日の半分', `${halfLeap.width}/${dayLeap.width}`)

console.log('== 15. pxPerDay（ドラッグの換算基準）==')
// 列幅と「1日あたりのピクセル数」は単位ごとに一致しない。
// ここを取り違えると、日表示以外でドラッグの移動日数がずれる。
for (const [scale, from, to, expectPxPerDay] of [
  ['hour3', '2026-06-01', '2026-06-04T23:59:59+09:00', 18 * 8],
  ['day',   '2026-06-01', '2026-06-30', 34],
  ['week',  '2026-06-01', '2026-06-28', 60 / 7],
  ['year',  '2026-01-01', '2026-12-31', 120 / 365],
]) {
  const t = createTimeline({ scale, from, to, now: '2026-06-10T03:00:00Z' })
  ok(near(t.pxPerDay, expectPxPerDay, Math.max(0.01, expectPxPerDay * 0.02)),
     `${scale} の pxPerDay = ${expectPxPerDay.toFixed(2)}`, t.pxPerDay.toFixed(2))
  ok(t.slotWidth === DEFAULT_SLOT_WIDTH[scale], `${scale} の列幅は既定値`, t.slotWidth)
}
// 3時間表示で 1日分ドラッグしたら 1日動く（列幅で割ると 8日になってしまう）
const tlH3 = createTimeline({ scale:'hour3', from:'2026-06-01', to:'2026-06-04T23:59:59+09:00' })
ok(snapDelta(tlH3.pxPerDay, tlH3.pxPerDay, 'day') === 1, '3時間表示: 1日分の移動 = 1日', snapDelta(tlH3.pxPerDay, tlH3.pxPerDay, 'day'))
ok(snapDelta(tlH3.pxPerDay / 2, tlH3.pxPerDay, 'half_day') === 0.5, '3時間表示: 半日分の移動 = 0.5日')
// 週表示でも同じ
const tlW = createTimeline({ scale:'week', from:'2026-06-01', to:'2026-07-31' })
ok(snapDelta(tlW.pxPerDay, tlW.pxPerDay, 'day') === 1, '週表示: 1日分の移動 = 1日')
ok(snapDelta(tlW.slotWidth, tlW.pxPerDay, 'day') === 7, '週表示: 1列分の移動 = 7日', snapDelta(tlW.slotWidth, tlW.pxPerDay, 'day'))

console.log('== 16. 3時間表示でも予定/実績/0.5日の座標基準が一致する ==')
const h3 = createTimeline({ scale:'hour3', from:'2026-06-01', to:'2026-06-03T23:59:59+09:00', now:'2026-06-02T03:00:00Z' })
ok(h3.slots.length === 24, '3日 × 8列 = 24列', h3.slots.length)
const h3Day = h3.spanOf(startAtOf('2026-06-02','AM'), endAtOf('2026-06-02','PM'))
const h3Am = h3.spanOf(startAtOf('2026-06-02','AM'), endAtOf('2026-06-02','AM'))
const h3Pm = h3.spanOf(startAtOf('2026-06-02','PM'), endAtOf('2026-06-02','PM'))
ok(near(h3Day.width, 8 * 18), '1日工程は8列分の幅', h3Day.width)
ok(near(h3Am.width, 4 * 18), '0.5日(午前)は4列分の幅', h3Am.width)
ok(h3Day.width / h3Am.width === 2, '1日と0.5日の幅の比は 2:1')
ok(near(h3Am.left, h3Day.left), '午前は1日工程と同じ位置から始まる')
ok(near(h3Pm.left - h3Day.left, 4 * 18), '午後は日の中央（4列目）から始まる', h3Pm.left - h3Day.left)
ok(near(h3Pm.left + h3Pm.width, h3Day.left + h3Day.width), '午後の終わりは1日工程の終わりと一致')
// 今日線・実績も同じ xOf 基準
ok(h3.todayX !== null && near(h3.todayX, h3.xOf('2026-06-02T03:00:00Z')), '今日線はバーと同じ座標関数を使う')

console.log('== 17. rangeForScale（表示範囲の共通算出）==')
const periods = [{ start: startAtOf('2026-06-01'), end: endAtOf('2026-08-10') }]
const rDay = rangeForScale('day', periods, { now: '2026-07-01T00:00:00+09:00' })
ok(rDay.narrowed === false, '日表示は工程の全期間を使う')
const rH3 = rangeForScale('hour3', periods, { now: '2026-07-01T00:00:00+09:00' })
ok(rH3.narrowed === true, '3時間表示は期間を狭める')
const h3Span = (toJst(rH3.to) - toJst(rH3.from)) / 86400000
ok(near(h3Span, 13, 0.01), '3時間表示の表示範囲は13日（前3日＋後10日）', h3Span)
// 現在日が期間内なら現在日が基準
ok(rH3.from.startsWith('2026-06-28'), '現在日の3日前から始まる', rH3.from)
// 現在日が期間外なら工程の開始日を基準にする（余白ではなく実期間で判断する）
const rOut = rangeForScale('hour3', periods, { now: '2027-01-01T00:00:00+09:00' })
ok(rOut.narrowed === true && rOut.from.startsWith('2026-05-29'),
   '現在日が範囲外なら工程の開始日(06-01)の3日前から', rOut.from)
ok(toJst(rOut.from) <= toJst(periods[0].start), '工程の開始が表示範囲に入る', rOut.from)
// 狭めた場合でも、対象工程が表示範囲に収まること（工程が画面から消えない）
const shortPeriods = [{ start: startAtOf('2026-06-01'), end: endAtOf('2026-06-02') }]
const shortR = rangeForScale('hour3', shortPeriods, { now: '2026-06-01T00:00:00+09:00' })
ok(toJst(shortR.from) <= toJst(shortPeriods[0].start) && toJst(shortR.to) >= toJst(shortPeriods[0].end),
   '狭めても対象工程は表示範囲に収まる', `${shortR.from} 〜 ${shortR.to}`)

console.log('== 18. 表示期間の指定は時間軸をそのまま決める ==')
for (const scale of ['hour3','day','week','month','year']) {
  const r = rangeForScale(scale, periods, { now:'2026-07-01T00:00:00+09:00', explicit:{ from:'2026-06-15', to:'2026-06-25' } })
  ok(r.from.startsWith('2026-06-15') && r.to.startsWith('2026-06-26'),
     `${scale}: 指定した表示期間をそのまま使う（終了日を含む）`, `${r.from} 〜 ${r.to}`)
  ok(r.narrowed === false, `${scale}: 指定があるときは勝手に狭めない`)
}
// 片側だけの指定でも、3時間表示はその日を基準にする
const oneSide = rangeForScale('hour3', periods, { now:'2026-12-01T00:00:00+09:00', explicit:{ from:'2026-06-15' } })
ok(oneSide.from.startsWith('2026-06-15'), '開始だけの指定はその日から', oneSide.from)

console.log(`\n結果: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
