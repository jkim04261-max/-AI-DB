import { useEffect, useState } from 'react'
import { useGrowth, type Character, type CharacterMessage } from '../../context/GrowthContext'

const COMPANION_LABEL: Record<Character['companionType'], string> = { nuri: '누리', duri: '두리' }

// PR #46 "함께 대화하기" 메뉴: 새 대화 기능이 아니라, 기존
// character_messages(listMessages)에 이미 저장된 대화를 읽기 전용으로
// 보여준다 — 입력창이 없다. 실제로 새 지식을 가르치거나 스스로
// 공부하게 하려면 "가르치기"/"스스로 공부하기" 메뉴(InteractionPanel)를
// 쓴다. 없는 기능을 있는 것처럼 보이지 않기 위한 의도적인 구분.
export default function ChatLogPanel({ character }: { character: Character }) {
  const { listMessages } = useGrowth()
  const [messages, setMessages] = useState<CharacterMessage[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const name = COMPANION_LABEL[character.companionType]

  useEffect(() => {
    let cancelled = false
    listMessages(character.companionType, { limit: 100 })
      .then((result) => {
        if (!cancelled) setMessages(result.messages)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '대화 기록을 불러오는 중 오류가 발생했어요.')
      })
    return () => {
      cancelled = true
    }
  }, [character.companionType, listMessages])

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-400">그동안 {name}와 나눈 대화예요. 새로 가르치려면 "가르치기" 메뉴를 써주세요.</p>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {messages === null && !error && <p className="text-xs text-slate-400">불러오는 중...</p>}
      {messages?.length === 0 && <p className="text-xs text-slate-400">아직 나눈 대화가 없어요.</p>}
      <div className="flex flex-col gap-2">
        {messages?.map((line) => (
          <div key={line.id} className={`flex ${line.speaker === 'user' ? 'justify-end' : 'justify-start'}`}>
            <p
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-1.5 text-xs ${
                line.speaker === 'user' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {line.speaker === 'character' && <span className="mr-1 font-semibold">{name}:</span>}
              {line.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
