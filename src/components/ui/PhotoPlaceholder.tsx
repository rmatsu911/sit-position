import { equipColor } from '../../data/photos'

// 通信設備の雰囲気を伝えるSVGプレースホルダ（外部画像不使用）
function Glyph({ type, color }: { type: string; color: string }) {
  switch (type) {
    case '電柱':
      return (
        <g stroke={color} strokeWidth={2} fill="none">
          <line x1="100" y1="30" x2="100" y2="120" strokeWidth={5} />
          <line x1="72" y1="48" x2="128" y2="48" strokeWidth={4} />
          <line x1="78" y1="64" x2="122" y2="64" strokeWidth={4} />
          <path d="M40 60 Q100 78 160 60" />
          <path d="M40 74 Q100 92 160 74" />
        </g>
      )
    case '光ケーブル':
    case '配線':
      return (
        <g stroke={color} fill="none" strokeWidth={4}>
          <path d="M20 60 C60 20 90 100 130 60 S170 20 180 60" />
          <path d="M20 90 C60 50 90 130 130 90 S170 50 180 90" strokeOpacity={0.6} />
        </g>
      )
    case 'クロージャ':
      return (
        <g>
          <rect x="78" y="48" width="44" height="60" rx="8" fill={color} opacity={0.85} />
          <line x1="40" y1="78" x2="78" y2="78" stroke={color} strokeWidth={5} />
          <line x1="122" y1="78" x2="170" y2="78" stroke={color} strokeWidth={5} />
          <line x1="90" y1="56" x2="90" y2="100" stroke="#fff" strokeWidth={2} opacity={0.6} />
          <line x1="110" y1="56" x2="110" y2="100" stroke="#fff" strokeWidth={2} opacity={0.6} />
        </g>
      )
    case 'ONU':
    case '光成端箱':
      return (
        <g>
          <rect x="66" y="52" width="68" height="46" rx="6" fill={color} opacity={0.85} />
          <circle cx="80" cy="66" r="3" fill="#fff" />
          <circle cx="92" cy="66" r="3" fill="#9ae6b4" />
          <rect x="76" y="82" width="48" height="6" rx="3" fill="#fff" opacity={0.5} />
        </g>
      )
    case '高所作業車':
      return (
        <g fill={color}>
          <rect x="40" y="90" width="70" height="26" rx="4" opacity={0.85} />
          <circle cx="56" cy="120" r="9" />
          <circle cx="96" cy="120" r="9" />
          <rect x="110" y="40" width="8" height="76" opacity={0.7} />
          <rect x="112" y="34" width="34" height="20" rx="3" opacity={0.85} />
        </g>
      )
    case 'ハンドホール':
      return (
        <g>
          <ellipse cx="100" cy="86" rx="52" ry="24" fill={color} opacity={0.8} />
          <ellipse cx="100" cy="80" rx="52" ry="24" fill="#cbd5e1" />
          <ellipse cx="100" cy="80" rx="34" ry="15" fill={color} opacity={0.85} />
        </g>
      )
    case '融着':
    case 'スプライス':
    case '接続試験':
      return (
        <g stroke={color} strokeWidth={4} fill="none">
          <line x1="30" y1="78" x2="90" y2="78" />
          <line x1="110" y1="78" x2="170" y2="78" />
          <rect x="90" y="66" width="20" height="24" rx="3" fill={color} />
          <circle cx="100" cy="50" r="8" fill="none" strokeWidth={3} />
          <line x1="100" y1="58" x2="100" y2="66" />
        </g>
      )
    default:
      return (
        <g>
          <rect x="70" y="52" width="60" height="52" rx="6" fill={color} opacity={0.85} />
          <rect x="80" y="64" width="40" height="6" rx="3" fill="#fff" opacity={0.6} />
          <rect x="80" y="78" width="28" height="6" rx="3" fill="#fff" opacity={0.5} />
        </g>
      )
  }
}

export function PhotoPlaceholder({
  type,
  no,
  className = '',
  indoor = false,
}: {
  type: string
  no?: string
  className?: string
  indoor?: boolean
}) {
  const color = equipColor[type] ?? '#005bac'
  return (
    <svg
      viewBox="0 0 200 150"
      className={className}
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label={`${type}の施工写真（サンプル）`}
    >
      {indoor ? (
        <rect width="200" height="150" fill="#eef1f5" />
      ) : (
        <>
          <rect width="200" height="150" fill="#dce9f5" />
          <rect y="105" width="200" height="45" fill="#d9d2c4" />
        </>
      )}
      <Glyph type={type} color={color} />
      <rect x="6" y="128" width="90" height="16" rx="2" fill="#1f2933" opacity={0.55} />
      <text x="11" y="140" fontSize="10" fill="#fff" fontFamily="sans-serif">
        {type}
      </text>
      {no && (
        <text x="194" y="16" fontSize="9" fill="#1f2933" textAnchor="end" fontFamily="sans-serif">
          {no}
        </text>
      )}
    </svg>
  )
}
