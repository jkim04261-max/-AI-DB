import { useState } from 'react'
import { SEQUENCE_ORDER_GAME_SETS } from '../../data/sequenceOrderGames'

// 지시서(8세 학습 시스템: 8문제 커리큘럼 재구성) "신유형 미니게임" —
// 완전히 새로 설계한 미니게임이다. CardMatchGame과 같은 원칙으로 결정적
// 완료 확인형(검증할 사용자 입력 없음)이고, onCleared 콜백 하나만 받는
// 최소한의 인터페이스를 따른다. 뒤섞인 단계를 올바른 순서대로 눌러야
// 하는데, 정답 순서는 steps 배열의 원래 인덱스(data-order)로 각 칩에
// 그대로 노출한다 — CardMatchGame의 data-job-id와 같은 이유(e2e
// 테스트가 실제 렌더링된 순서를 읽어서 그대로 정답을 재구성할 수 있게).
function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export default function SequenceOrderGame({ onCleared }: { onCleared?: () => void } = {}) {
  const [gameSet] = useState(() => SEQUENCE_ORDER_GAME_SETS[Math.floor(Math.random() * SEQUENCE_ORDER_GAME_SETS.length)])
  const [chips] = useState(() => shuffle(gameSet.steps.map((label, order) => ({ label, order }))))
  const [nextOrder, setNextOrder] = useState(0)
  const [wrongLabel, setWrongLabel] = useState<string | null>(null)
  const [cleared, setCleared] = useState(false)

  const handleChipClick = (chip: { label: string; order: number }) => {
    if (cleared) return
    if (chip.order !== nextOrder) {
      setWrongLabel(chip.label)
      return
    }
    setWrongLabel(null)
    const advanced = nextOrder + 1
    setNextOrder(advanced)
    if (advanced === gameSet.steps.length) {
      setCleared(true)
      onCleared?.()
    }
  }

  return (
    <div data-testid="sequence-order-game" className="flex flex-col gap-3">
      <p className="text-sm font-bold text-slate-100">{gameSet.title} — 순서대로 눌러보세요</p>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => {
          const done = chip.order < nextOrder
          return (
            <button
              key={chip.label}
              type="button"
              data-testid="sequence-order-chip"
              data-order={chip.order}
              onClick={() => handleChipClick(chip)}
              disabled={done || cleared}
              className={`rounded-xl px-3 py-2 text-sm font-bold transition-colors ${
                done ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/10 text-slate-100 hover:bg-white/20'
              }`}
            >
              {done ? `${chip.order + 1}. ` : ''}
              {chip.label}
            </button>
          )
        })}
      </div>
      {wrongLabel && (
        <p data-testid="sequence-order-wrong" className="text-xs font-bold text-rose-300">
          아직 순서가 아니에요! 다시 골라보세요.
        </p>
      )}
      {cleared && <p className="text-sm font-bold text-emerald-300">🎉 순서를 모두 맞혔어요!</p>}
    </div>
  )
}
