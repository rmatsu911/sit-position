import { useState } from 'react'
import { PhotoPlaceholder } from './PhotoPlaceholder'

type Board = { process?: string; date?: string }

// アップロード実写真があれば実画像を表示。無い/読み込み失敗（開発用Seed画像等）は
// プレースホルダにフォールバックする。本番の実データと開発用Seedを混同させない。
export function PhotoImage({
  url, type, no, className, indoor, board, alt,
}: {
  url?: string | null
  type: string
  no?: string
  className?: string
  indoor?: boolean
  board?: Board
  alt?: string
}) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={alt ?? no ?? '施工写真'}
        className={`${className ?? ''} object-cover`}
        onError={() => setFailed(true)}
      />
    )
  }
  return <PhotoPlaceholder type={type} no={no} className={className} indoor={indoor} board={board} />
}
