/**
 * 固定案件参照の監査。
 *
 * 画面が「選択中の案件」ではなく特定の案件を決め打ちしていないかを機械的に確かめる。
 * 検出したいのは次の3種類。
 *   1. `DEMO_PROJECT_ID` のような既定の案件ID
 *   2. 案件IDでの分岐による固定の案件名（例: projectId === 'p1' ? '熊本中央局' : …）
 *   3. 画面へ直接書かれた実在案件名（Seedの工事名）
 *
 * 実行: node scripts/fixed-project-audit.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src']
// Seed に実在する工事名・局名。画面へ直接書いてはいけない。
const SEED_NAMES = ['熊本中央局', '玉名局', '菊陽町 光配線', '光設備更改工事']

const RULES = [
  { name: '既定の案件ID（DEMO_PROJECT_ID 等）', re: /DEMO_PROJECT_ID|FALLBACK_PROJECT_ID|DEFAULT_PROJECT_ID/ },
  { name: "案件IDでの分岐（projectId === 'pN' ?）", re: /project_?[Ii]d\s*===\s*['"]p\d+['"]\s*\?/ },
  { name: '案件IDを既定値で補う（projectId ?? 0 / as number）', re: /projectId\s*\?\?\s*0|projectId\s+as\s+number/ },
  { name: '画面へ直接書かれた実在案件名', re: new RegExp(SEED_NAMES.join('|')) },
]

function files(dir) {
  const out = []
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out.push(...files(p))
    else if (/\.(ts|tsx)$/.test(p)) out.push(p)
  }
  return out
}

const targets = ROOTS.flatMap((r) => files(r))
const violations = []
for (const f of targets) {
  const lines = readFileSync(f, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return // 説明コメントは対象外
    for (const rule of RULES) {
      if (rule.re.test(line)) violations.push({ file: f, line: i + 1, rule: rule.name, text: line.trim().slice(0, 120) })
    }
  })
}

console.log(`検査したファイル: ${targets.length}（対象: ${ROOTS.join(', ')}）`)
for (const r of RULES) console.log(`  規則: ${r.name}`)
if (violations.length) {
  console.log(`\nFAIL 固定案件参照が ${violations.length} 件残っています`)
  for (const v of violations) console.log(`  ${v.file}:${v.line}  [${v.rule}] ${v.text}`)
  process.exit(1)
}
console.log('\nPASS 固定案件参照はありません（残存 0 件）')
