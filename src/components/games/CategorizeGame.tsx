import { useState } from 'react'
import { CATEGORIZE_GAME_SETS } from '../../data/categorizeGames'

// 지시서(8세 학습 시스템: 8문제 커리큘럼 재구성) "신유형 미니게임" —
// SequenceOrderGame과 같은 원칙(결정적 완료 확인형, onCleared 하나만
// 받는 최소 인터페이스)의 완전히 새로운 미니게임. 각 아이템마다 두
// 그룹 버튼을 눌러 배정하고, 전부 배정되면 "확인"으로 한 번에 채점한다
// — 드래그 앤 드롭 대신 버튼 토글로 구현해 모바일·e2e 테스트 모두에서
// 안정적으로 동작한다.
export default function CategorizeGame({ onCleared }: { onCleared?: () => void } = {}) {
  const [gameSet] = useState(() => CATEGORIZE_GAME_SETS[Math.floor(Math.random() * CATEGORIZE_GAME_SETS.length)])
  const [assignments, setAssignments] = useState<Record<string, 'A' | 'B' | null>>(() =>
    Object.fromEntries(gameSet.items.map((item) => [item.label, null])),
  )
  const [wrongLabels, setWrongLabels] = useState<string[] | null>(null)
  const [cleared, setCleared] = useState(false)

  const allAssigned = gameSet.items.every((item) => assignments[item.label] !== null)

  const handleAssign = (label: string, group: 'A' | 'B') => {
    if (cleared) return
    setWrongLabels(null)
    setAssignments((prev) => ({ ...prev, [label]: group }))
  }

  const handleCheck = () => {
    const wrong = gameSet.items.filter((item) => assignments[item.label] !== item.group).map((item) => item.label)
    if (wrong.length > 0) {
      setWrongLabels(wrong)
      return
    }
    setWrongLabels(null)
    setCleared(true)
    onCleared?.()
  }

  return (
    <div data-testid="categorize-game" className="flex flex-col gap-3">
      <p className="text-sm font-bold text-slate-100">{gameSet.prompt}</p>
      <div className="flex flex-col gap-2">
        {gameSet.items.map((item) => {
          const assigned = assignments[item.label]
          const isWrong = wrongLabels?.includes(item.label)
          return (
            <div
              key={item.label}
              data-testid="categorize-item"
              data-correct-group={item.group}
              className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${
                isWrong ? 'bg-rose-400/10' : 'bg-white/5'
              }`}
            >
              <span className="text-sm font-bold text-slate-100">{item.label}</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  data-testid="categorize-assign-a"
                  onClick={() => handleAssign(item.label, 'A')}
                  disabled={cleared}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                    assigned === 'A' ? 'bg-emerald-400/30 text-emerald-200' : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  {gameSet.groupALabel}
                </button>
                <button
                  type="button"
                  data-testid="categorize-assign-b"
                  onClick={() => handleAssign(item.label, 'B')}
                  disabled={cleared}
                  className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                    assigned === 'B' ? 'bg-emerald-400/30 text-emerald-200' : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  {gameSet.groupBLabel}
                </button>
              </div>
            </div>
          )
        })}
      </div>
      {wrongLabels && wrongLabels.length > 0 && (
        <p data-testid="categorize-wrong" className="text-xs font-bold text-rose-300">
          틀린 게 있어요! 빨간 표시된 걸 다시 골라보세요.
        </p>
      )}
      {!cleared && (
        <button
          type="button"
          data-testid="categorize-check-button"
          onClick={handleCheck}
          disabled={!allAssigned}
          className="self-start rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 disabled:opacity-40"
        >
          확인하기
        </button>
      )}
      {cleared && <p className="text-sm font-bold text-emerald-300">🎉 전부 올바르게 분류했어요!</p>}
    </div>
  )
}
