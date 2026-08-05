/**
 * クリティカルパス（src/lib/cpm.ts）の検証。
 *
 * 実行:  npm run test:cpm
 *
 * 確認したいこと:
 * - 工程名を変えても結果が変わらない（名前でクリティカルを決めていない）
 * - 期間・先行工程を変えると結果が変わる（計算している）
 * - 日程未設定・孤立工程・循環・親工程の扱いが決まっている
 */
import { computeCpm } from '../node_modules/.cache/cpm.test.mjs'

let pass = 0, fail = 0
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  PASS ${name}`) }
  else { fail++; console.log(`  FAIL ${name} ${extra}`) }
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol

/** 日数から ISO 日時（JST 0時起点）を作る */
const day = (n) => new Date(Date.UTC(2026, 5, 1 + n, -9)).toISOString()
/** 工程1件 */
const t = (id, startDay, days, preds = [], extra = {}) => ({
  id,
  planStartAt: day(startDay),
  planEndAt: day(startDay + days),
  predecessorIds: preds,
  isParent: false,
  ...extra,
})

console.log('== 1. 直列の経路はすべてクリティカル ==')
{
  // A(3日) → B(2日) → C(1日) を隙間なくつなぐ
  const r = computeCpm([t('A', 0, 3), t('B', 3, 2, ['A']), t('C', 5, 1, ['B'])])
  ok(r.nodes.size === 3, '3件とも計算される', String(r.nodes.size))
  ok(near(r.projectDuration, 6), '全体は6日', String(r.projectDuration))
  ok(r.criticalIds.size === 3, '隙間が無ければ全部クリティカル', [...r.criticalIds].join(','))
  ok(near(r.nodes.get('A').earliestStart, 0) && near(r.nodes.get('A').earliestFinish, 3), 'A: ES=0 EF=3')
  ok(near(r.nodes.get('B').earliestStart, 3) && near(r.nodes.get('B').earliestFinish, 5), 'B: ES=3 EF=5')
  ok(near(r.nodes.get('C').latestFinish, 6) && near(r.nodes.get('C').latestStart, 5), 'C: LF=6 LS=5')
  ok(r.nodes.get('A').totalFloat === 0, 'A の余裕は0')
}

console.log('== 2. 短いほうの分岐に余裕が出る ==')
{
  //      ┌ B(1日) ┐
  // A(2) ┤        ├ D(1日)
  //      └ C(4日) ┘
  const r = computeCpm([
    t('A', 0, 2),
    t('B', 2, 1, ['A']),
    t('C', 2, 4, ['A']),
    t('D', 6, 1, ['B', 'C']),
  ])
  ok(near(r.projectDuration, 7), '全体は7日', String(r.projectDuration))
  ok(r.criticalIds.has('A') && r.criticalIds.has('C') && r.criticalIds.has('D'), '長いほうの経路がクリティカル', [...r.criticalIds].join(','))
  ok(!r.criticalIds.has('B'), '短い分岐 B はクリティカルではない')
  ok(near(r.nodes.get('B').totalFloat, 3), 'B の余裕は3日', String(r.nodes.get('B').totalFloat))
  ok(near(r.nodes.get('C').totalFloat, 0), 'C の余裕は0')
}

console.log('== 3. 工程名を変えても結果は変わらない ==')
{
  const base = [t('A', 0, 2), t('B', 2, 1, ['A']), t('C', 2, 4, ['A']), t('D', 6, 1, ['B', 'C'])]
  const r1 = computeCpm(base)
  // 名前に相当する情報は入力に無い。名前で判定していたら、ここで差が出る。
  const named = base.map((x, i) => ({ ...x, name: ['引き渡し', '完成検査', '準備工', '切替作業'][i] }))
  const r2 = computeCpm(named)
  ok([...r1.criticalIds].sort().join(',') === [...r2.criticalIds].sort().join(','),
     '工程名の有無・内容でクリティカルが変わらない',
     `${[...r1.criticalIds]} / ${[...r2.criticalIds]}`)
  ok(!r2.criticalIds.has('B'), '「完成検査」という名前でもクリティカルにはならない')
  ok(r2.criticalIds.has('C'), '「準備工」という名前でも経路が長ければクリティカル')
}

console.log('== 4. 期間を変えるとクリティカルが移る ==')
{
  // 2.の C を1日へ縮めると、長いのは B 側になる
  const r = computeCpm([
    t('A', 0, 2),
    t('B', 2, 3, ['A']),
    t('C', 2, 1, ['A']),
    t('D', 5, 1, ['B', 'C']),
  ])
  ok(r.criticalIds.has('B') && !r.criticalIds.has('C'), '長さが入れ替わるとクリティカルも入れ替わる', [...r.criticalIds].join(','))
  ok(near(r.nodes.get('C').totalFloat, 2), 'C の余裕は2日', String(r.nodes.get('C').totalFloat))
}

console.log('== 5. 依存関係を変えるとクリティカルが変わる ==')
{
  const before = computeCpm([t('A', 0, 2), t('B', 2, 1, ['A']), t('C', 3, 3, ['B'])])
  ok(before.criticalIds.size === 3, '直列3件はすべてクリティカル', [...before.criticalIds].join(','))
  // B の先行を外すと、A と B は別経路になる
  const after = computeCpm([t('A', 0, 2), t('B', 2, 1, []), t('C', 3, 3, ['B'])])
  ok(!after.criticalIds.has('A'), '依存を外すと A はクリティカルから外れる', [...after.criticalIds].join(','))
  ok(after.criticalIds.has('C'), '最後まで続く経路はクリティカルのまま')
}

console.log('== 6. 日程未設定の工程は計算しない ==')
{
  const r = computeCpm([
    t('A', 0, 2),
    { id: 'X', planStartAt: null, planEndAt: null, predecessorIds: ['A'], isParent: false },
    { id: 'Y', planStartAt: day(0), planEndAt: null, predecessorIds: [], isParent: false },
  ])
  ok(r.unscheduledIds.has('X') && r.unscheduledIds.has('Y'), '日程が揃わない工程は未計算として分ける')
  ok(!r.nodes.has('X') && !r.criticalIds.has('X'), '未計算の工程はクリティカルにしない')
  ok(r.nodes.has('A'), '他の工程の計算は止まらない')
  // 未設定工程を経由する依存は経路を作らない（架空の日付で埋めない）
  ok(near(r.projectDuration, 2), '全体は計算できた工程だけで決まる', String(r.projectDuration))
}

console.log('== 7. 孤立工程も対象に含める ==')
{
  // 依存の無い長い工程が1本あると、それが全体の長さを決める
  const r = computeCpm([t('A', 0, 2), t('B', 2, 1, ['A']), t('LONE', 0, 9)])
  ok(r.nodes.has('LONE'), '先行も後続も無い工程を除外しない')
  ok(r.criticalIds.has('LONE'), '単独で最長なら孤立工程もクリティカル', [...r.criticalIds].join(','))
  ok(!r.criticalIds.has('A') && !r.criticalIds.has('B'), '短い経路には余裕が出る')
  ok(near(r.projectDuration, 9), '全体は9日', String(r.projectDuration))
  // 逆に短い孤立工程は余裕を持つ
  const r2 = computeCpm([t('A', 0, 5), t('SHORT', 0, 1)])
  ok(near(r2.nodes.get('SHORT').totalFloat, 4), '短い孤立工程には余裕が出る', String(r2.nodes.get('SHORT').totalFloat))
}

console.log('== 8. 循環している依存は計算対象から外す ==')
{
  // A → B → C → A（閉路）と、無関係な D
  const r = computeCpm([
    t('A', 0, 2, ['C']),
    t('B', 2, 2, ['A']),
    t('C', 4, 2, ['B']),
    t('D', 0, 1),
  ])
  ok(r.cycleIds.has('A') && r.cycleIds.has('B') && r.cycleIds.has('C'), '閉路の工程を cycle として報告する', [...r.cycleIds].join(','))
  ok(!r.nodes.has('A'), '閉路の工程は計算結果に入れない')
  ok(r.nodes.has('D'), '閉路と無関係な工程は計算する')
  ok(!r.criticalIds.has('A'), '閉路の工程をクリティカルにしない')
  // 自己依存は前後関係を作らないだけで、工程自体は計算できる
  const self = computeCpm([t('S', 0, 3, ['S'])])
  ok(self.nodes.has('S') && self.cycleIds.size === 0, '自己依存は閉路にせず、その工程だけで計算する')
}

console.log('== 9. 親工程は経路に載せない ==')
{
  const r = computeCpm([
    { ...t('P', 0, 5), isParent: true },
    t('c1', 0, 2, []),
    t('c2', 2, 3, ['c1']),
  ])
  ok(!r.nodes.has('P'), '親工程（集計行）は計算対象にしない')
  ok(r.criticalIds.has('c1') && r.criticalIds.has('c2'), '子の経路で判定する', [...r.criticalIds].join(','))
  ok(near(r.projectDuration, 5), '全体は子の経路から決まる', String(r.projectDuration))
}

console.log('== 10. 予定開始より前へは繰り上げない ==')
{
  // A は 0〜3日、B の予定開始は 10日目。B は A の直後（3日目）には始められない。
  const r = computeCpm([t('A', 0, 3), t('B', 10, 2, ['A'])])
  ok(near(r.nodes.get('B').earliestStart, 10), 'B の最早開始は予定開始（10日目）', String(r.nodes.get('B').earliestStart))
  ok(near(r.nodes.get('A').totalFloat, 7), '間が空いた分だけ A に余裕が出る', String(r.nodes.get('A').totalFloat))
  ok(r.criticalIds.has('B') && !r.criticalIds.has('A'), '最後の工程だけがクリティカル', [...r.criticalIds].join(','))
}

console.log('== 11. 0.5日・時間単位でも計算できる ==')
{
  const half = (id, startHours, hours, preds = []) => ({
    id,
    planStartAt: new Date(Date.UTC(2026, 5, 1, startHours - 9)).toISOString(),
    planEndAt: new Date(Date.UTC(2026, 5, 1, startHours + hours - 9)).toISOString(),
    predecessorIds: preds,
    isParent: false,
  })
  // 午前(0-12時) → 午後(12-24時)
  const r = computeCpm([half('AM', 0, 12), half('PM', 12, 12, ['AM'])])
  ok(near(r.nodes.get('AM').duration, 0.5), '0.5日工程の所要は0.5日', String(r.nodes.get('AM').duration))
  ok(near(r.projectDuration, 1), '午前＋午後で1日', String(r.projectDuration))
  ok(r.criticalIds.size === 2, '両方クリティカル')
  // 時間単位（9:30〜17:15 = 7.75時間）
  const timed = computeCpm([{
    id: 'T', planStartAt: '2026-06-01T09:30:00+09:00', planEndAt: '2026-06-01T17:15:00+09:00',
    predecessorIds: [], isParent: false,
  }])
  ok(near(timed.nodes.get('T').duration, 7.75 / 24), '時間単位の所要も日換算で持つ', String(timed.nodes.get('T').duration))
}

console.log('== 12. 空・不正な入力で落ちない ==')
{
  const empty = computeCpm([])
  ok(empty.nodes.size === 0 && empty.projectDuration === 0, '工程0件でも計算できる')
  const bad = computeCpm([
    { id: 'REV', planStartAt: day(5), planEndAt: day(2), predecessorIds: [], isParent: false },
    { id: 'ZERO', planStartAt: day(1), planEndAt: day(1), predecessorIds: [], isParent: false },
  ])
  ok(bad.unscheduledIds.has('REV'), '終了が開始より前の工程は未計算として扱う')
  ok(bad.unscheduledIds.has('ZERO'), '長さ0の工程も未計算として扱う')
  ok(bad.nodes.size === 0, '計算できる工程が無ければ結果は空')
  // 存在しない工程への依存は無視する
  const ghost = computeCpm([t('A', 0, 2, ['NOPE'])])
  ok(ghost.nodes.has('A') && near(ghost.nodes.get('A').earliestStart, 0), '存在しない先行工程は無視する')
}

console.log(`\n結果: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
