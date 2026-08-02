/**
 * 業務判定に表示名依存が残っていないかを検査する。
 *
 * マイルストーンの判定は milestones.id / milestone_type_id / milestone_types.id /
 * milestone_types.code / API の record_kind を正データとする。工程名や
 * マイルストーン名から種別を推測してはいけない。
 *
 * マスタ定義・Seed・画面ラベル・テストデータ・ドキュメントに「引き渡し」という
 * 文字が出ること自体は正当なので、対象範囲と許可リストで区別する。
 *
 * 実行: node scripts/milestone-source-audit.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

/** 検査対象＝業務ロジックを書く場所。 */
const TARGET_DIRS = ['src', 'backend/app']
const TARGET_EXT = new Set(['.ts', '.tsx', '.py'])

/**
 * 表示文字として正当に残るファイル。
 * - マスタ／Seed：区分名そのものを定義する場所
 * - migration：新設時の経緯を説明する文書
 */
const ALLOWED_FILES = new Set([
  'backend/app/seed/seed.py',          // 工程名・区分名マスタの初期データ
  'backend/app/models.py',             // MilestoneType の説明（docstring）
])

/** 判定に使ってはいけない書き方。 */
const FORBIDDEN = [
  { re: /name\s*===?\s*['"`]引き渡し['"`]/, why: '工程名の一致でマイルストーンを判定している' },
  { re: /name\s*!==?\s*['"`]引き渡し['"`]/, why: '工程名の一致でマイルストーンを判定している' },
  { re: /name\s*==\s*['"]引き渡し['"]/, why: '工程名の一致でマイルストーンを判定している' },
  { re: /\.name\s*\.?\s*includes\(\s*['"`]引き渡し['"`]/, why: '工程名の部分一致で判定している' },
  { re: /['"`]引き渡し['"`]\s*===?\s*\w+\.name/, why: '工程名の一致で判定している' },
  { re: /isMilestone/, why: '工程名から導出したマイルストーン判定フラグが残っている' },
  { re: /is_milestone/, why: 'tasks 側に二重管理のマイルストーン列を持ち込んでいる' },
  { re: /milestone_type_id\s*=\s*.*\bname\b.*\bmap\b/, why: '名称から種別IDを推測している' },
]

/** 種別名の一覧をコードに埋めて判定に使うのも表示名依存。 */
const TYPE_NAME_LIST = /\[[^\]]*['"`]契約['"`][^\]]*['"`]着工['"`][^\]]*\]/

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__pycache__' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (TARGET_EXT.has(extname(full))) out.push(full)
  }
  return out
}

let checked = 0
const findings = []
for (const dir of TARGET_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file)
    if (ALLOWED_FILES.has(rel)) continue
    checked++
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      for (const rule of FORBIDDEN) {
        if (rule.re.test(line)) findings.push(`${rel}:${i + 1} ${rule.why}\n    ${line.trim()}`)
      }
      if (TYPE_NAME_LIST.test(line) && !rel.includes('seed')) {
        findings.push(`${rel}:${i + 1} 区分名の一覧をコードに埋めている\n    ${line.trim()}`)
      }
    })
  }
}

console.log(`検査したファイル: ${checked}（対象: ${TARGET_DIRS.join(', ')}）`)
console.log(`表示文字として除外したファイル: ${[...ALLOWED_FILES].join(', ')}`)
if (findings.length) {
  console.log('\n表示名依存の業務判定が残っています:')
  for (const f of findings) console.log(`  FAIL ${f}`)
  process.exit(1)
}
console.log('PASS 業務判定に表示名依存はありません')
