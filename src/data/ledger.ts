import type { LedgerRow } from '../types'
import { projects } from './projects'

const billing = ['未請求', '請求済', '入金済', '一部入金', '未請求', '請求済', '未請求', '未請求']
const docs = ['作成中', '完了', '完了', '未着手', '確認中', '作成中', '未着手', '未着手']
const finish: (string | null)[] = [null, null, null, null, null, null, null, null]

export const ledgerRows: LedgerRow[] = projects.map((p, i) => ({
  id: p.id,
  workNo: p.code,
  contractNo: `C-${p.code.slice(3)}`,
  name: p.name,
  client: p.client,
  category: p.category,
  area: p.area,
  contractAmount: p.contractAmount,
  costPlan: p.costPlan,
  costActual: p.costActual,
  profitRate: Math.round(((p.contractAmount - p.costPlan) / p.contractAmount) * 1000) / 10,
  startDate: p.startDate,
  dueDate: p.dueDate,
  finishDate: finish[i],
  manager: p.manager,
  progress: p.progressActual,
  billing: billing[i],
  documents: docs[i],
  status: p.status,
}))
