/**
 * クリティカルパス（CPM）の計算。
 *
 * 工程名でクリティカルかどうかを決めない。工程名を変えても結果は変わらず、
 * 期間と先行工程（`parent_task_id` ではなく依存関係）だけで決まる。
 *
 * 定義（すべて JST の日時。期間は [開始, 終了) の半開区間）:
 * - ES (earliest start)  : 先行工程がすべて終わったあとで、最も早く始められる時刻
 * - EF (earliest finish) : ES + 所要時間
 * - LF (latest finish)   : 全体の完了を遅らせずに終えられる最も遅い時刻
 * - LS (latest start)    : LF − 所要時間
 * - total float          : LS − ES（余裕。0 ならクリティカル）
 *
 * 扱いを決めておくもの:
 * - **日程未設定の工程**（開始または終了が null）は所要時間が決まらないため計算しない。
 *   `null` を返し、クリティカルにもしない（架空の日付で埋めない）。
 * - **孤立工程**（先行も後続も無い）は計算対象に含める。単独で最長になれば
 *   クリティカルになるが、他より短ければ余裕が出る。
 * - **循環**している依存は前後関係を決められないため、その閉路に含まれる工程を
 *   計算対象から外し、`cycle` として報告する（黙って一部だけ計算しない）。
 * - **親工程**は子の集計であり、それ自体が作業ではないため計算対象から外す。
 *   末端工程（子を持たない工程）だけで経路を作る。
 */

const MS_PER_DAY = 86_400_000

export interface CpmInput {
  id: string
  /** 予定開始（ISO日時）。未設定なら null */
  planStartAt: string | null
  /** 予定終了（ISO日時・exclusive）。未設定なら null */
  planEndAt: string | null
  /** 先行工程のID。存在しないIDは無視する */
  predecessorIds: string[]
  /** 子を持つ工程（集計行）は計算対象から外す */
  isParent: boolean
}

export interface CpmNode {
  id: string
  /** 所要時間（日） */
  duration: number
  earliestStart: number
  earliestFinish: number
  latestStart: number
  latestFinish: number
  /** 余裕（日）。0 ならクリティカル */
  totalFloat: number
  critical: boolean
}

export interface CpmResult {
  /** 計算できた工程。ID → 結果 */
  nodes: Map<string, CpmNode>
  /** クリティカル工程のID */
  criticalIds: Set<string>
  /** 日程未設定などで計算できなかった工程のID */
  unscheduledIds: Set<string>
  /** 循環しているため計算対象から外した工程のID */
  cycleIds: Set<string>
  /** 全体の所要時間（日）。計算対象が無ければ 0 */
  projectDuration: number
}

/** 浮動小数の誤差でクリティカル判定が揺れないよう、1分未満は同じとみなす */
const EPS = 1 / (24 * 60)

const EMPTY: CpmResult = {
  nodes: new Map(),
  criticalIds: new Set(),
  unscheduledIds: new Set(),
  cycleIds: new Set(),
  projectDuration: 0,
}

/**
 * クリティカルパスを計算する。
 *
 * 時刻は「最も早い予定開始」を 0 とした日数で扱う。日付そのものではなく
 * 相対値で計算するので、タイムゾーンの解釈がここに入り込まない。
 */
export function computeCpm(tasks: CpmInput[]): CpmResult {
  if (tasks.length === 0) return EMPTY

  const unscheduledIds = new Set<string>()
  const scheduled: { id: string; start: number; end: number }[] = []
  for (const t of tasks) {
    // 親工程は子の集計。作業そのものではないので経路に載せない。
    if (t.isParent) continue
    if (!t.planStartAt || !t.planEndAt) {
      unscheduledIds.add(t.id)
      continue
    }
    const start = Date.parse(t.planStartAt)
    const end = Date.parse(t.planEndAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      unscheduledIds.add(t.id)
      continue
    }
    scheduled.push({ id: t.id, start, end })
  }
  if (scheduled.length === 0) {
    return { ...EMPTY, unscheduledIds, nodes: new Map(), criticalIds: new Set() }
  }

  const origin = Math.min(...scheduled.map((s) => s.start))
  const duration = new Map<string, number>()
  const plannedStart = new Map<string, number>()
  for (const s of scheduled) {
    duration.set(s.id, (s.end - s.start) / MS_PER_DAY)
    plannedStart.set(s.id, (s.start - origin) / MS_PER_DAY)
  }

  // 先行工程は「計算対象に残っている工程」だけを見る
  // （親工程・日程未設定・存在しないIDへの依存は経路を作らない）
  const preds = new Map<string, string[]>()
  const succs = new Map<string, string[]>()
  for (const id of duration.keys()) {
    preds.set(id, [])
    succs.set(id, [])
  }
  const byId = new Map(tasks.map((t) => [t.id, t]))
  for (const id of duration.keys()) {
    for (const p of byId.get(id)?.predecessorIds ?? []) {
      if (p === id) continue // 自己依存は前後関係を作らない
      if (!duration.has(p)) continue
      preds.get(id)!.push(p)
      succs.get(p)!.push(id)
    }
  }

  // トポロジカル順。並べきれなかった工程は循環に含まれる。
  const indeg = new Map<string, number>()
  for (const [id, ps] of preds) indeg.set(id, ps.length)
  const queue = [...indeg].filter(([, d]) => d === 0).map(([id]) => id)
  const order: string[] = []
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const s of succs.get(id)!) {
      const d = indeg.get(s)! - 1
      indeg.set(s, d)
      if (d === 0) queue.push(s)
    }
  }
  const cycleIds = new Set([...duration.keys()].filter((id) => !order.includes(id)))
  const active = new Set(order)

  // 前進計算（ES / EF）。
  // 工程は「予定開始より前」にも「先行工程が終わる前」にも始められないため、
  // その両方の遅いほうを最早開始とする。予定日が入っている工程表を扱うので、
  // 先行が無い工程を一律に時刻0へ引き寄せない。
  const es = new Map<string, number>()
  const ef = new Map<string, number>()
  for (const id of order) {
    const ps = preds.get(id)!.filter((p) => active.has(p))
    const start = Math.max(plannedStart.get(id)!, ...ps.map((p) => ef.get(p)!))
    es.set(id, start)
    ef.set(id, start + duration.get(id)!)
  }

  const projectDuration = Math.max(0, ...order.map((id) => ef.get(id)!))

  // 後退計算（LF / LS）。後続が無い工程は、全体の完了時刻を最遅終了とする。
  const lf = new Map<string, number>()
  const ls = new Map<string, number>()
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const id = order[i]
    const ss = succs.get(id)!.filter((s) => active.has(s))
    const finish = ss.length === 0
      ? projectDuration
      : Math.min(...ss.map((s) => ls.get(s)!))
    lf.set(id, finish)
    ls.set(id, finish - duration.get(id)!)
  }

  const nodes = new Map<string, CpmNode>()
  const criticalIds = new Set<string>()
  for (const id of order) {
    const totalFloat = ls.get(id)! - es.get(id)!
    const critical = totalFloat <= EPS
    nodes.set(id, {
      id,
      duration: duration.get(id)!,
      earliestStart: es.get(id)!,
      earliestFinish: ef.get(id)!,
      latestStart: ls.get(id)!,
      latestFinish: lf.get(id)!,
      totalFloat: Math.max(0, totalFloat),
      critical,
    })
    if (critical) criticalIds.add(id)
  }

  return { nodes, criticalIds, unscheduledIds, cycleIds, projectDuration }
}
