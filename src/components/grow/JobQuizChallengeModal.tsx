import { useRef, useState } from 'react'
import type { CompanionType } from '../../context/GrowthContext'
import type { AgeTier } from '../../data/characterAge'
import { fullBodyPortraitSrc } from '../../data/characterFullBody'
import { walkingPortraitSrc } from '../../data/characterWalking'
import { useImageFallback } from '../../hooks/useImageFallback'
import { TOWN_SQUARE_BG_SRC } from '../../data/lifeEventAssets'
import {
  computeJobQuizSettlement,
  JOB_QUIZ_PENALTY_WON,
  JOB_QUIZ_REWARD_WON,
  pickJobQuizQuestions,
  type JobQuizSettlement,
} from '../../services/jobQuizChallenge'

export interface MoneyHistoryEntry {
  id: number
  label: string
  deltaWon: number
}

const formatWon = (n: number) => `${n.toLocaleString('ko-KR')}원`

// 지시서(선택형 직업 퀴즈): 2문제 → 최종 결과 1회 정산 → 정답·잔액·내역.
// 정산은 settledRef로 한 번만 일어나도록 막아, 더블클릭·재렌더로 중복
// 지급/차감되지 않는다.
export default function JobQuizChallengeModal({
  companionType,
  ageTier,
  ageNumber,
  balanceWon,
  history,
  onSettle,
  onClose,
}: {
  companionType: CompanionType
  ageTier: AgeTier
  ageNumber?: number
  balanceWon: number | null
  history: MoneyHistoryEntry[]
  onSettle: (settlement: JobQuizSettlement) => void
  onClose: () => void
}) {
  const { src: walkingSrc, onError: handlePortraitError } = useImageFallback(
    walkingPortraitSrc(companionType, ageTier, ageNumber),
    fullBodyPortraitSrc(companionType, ageTier, ageNumber),
  )
  const [questions] = useState(() => pickJobQuizQuestions())
  const startBalanceRef = useRef(balanceWon)
  const settledRef = useRef(false)
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [picks, setPicks] = useState<number[]>([])
  const [settlement, setSettlement] = useState<JobQuizSettlement | null>(null)

  const current = questions[index]
  const isLast = index + 1 >= questions.length
  const answered = selected !== null

  const handleChoose = (choiceIndex: number) => {
    if (answered || settlement) return
    setSelected(choiceIndex)
  }

  const handleNext = () => {
    if (selected === null || settledRef.current) return
    const nextPicks = [...picks, selected]
    if (!isLast) {
      setPicks(nextPicks)
      setIndex((i) => i + 1)
      setSelected(null)
      return
    }
    settledRef.current = true
    setPicks(nextPicks)
    const correctCount = nextPicks.filter((p, i) => p === questions[i].correctIndex).length
    const result = computeJobQuizSettlement(correctCount, questions.length, startBalanceRef.current)
    setSettlement(result)
    onSettle(result)
  }

  const success = settlement?.outcome === 'success'

  return (
    <div
      data-testid="job-quiz-challenge-modal"
      role="dialog"
      aria-label="직업 퀴즈 도전"
      className="fixed inset-0 z-50 overflow-y-auto"
    >
      <div aria-hidden className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${TOWN_SQUARE_BG_SRC})` }} />
      <div aria-hidden className="absolute inset-0 bg-black/65" />
      <div className="relative z-10 flex min-h-full flex-col items-center justify-center gap-3 p-4">
        <img src={walkingSrc} onError={handlePortraitError} alt="" className="h-24 w-24 object-contain sm:h-32 sm:w-32" />

        {!settlement && current && (
          <div className="flex w-full max-w-md flex-col gap-2 rounded-2xl bg-black/60 p-3">
            <p className="text-center text-xs font-bold text-amber-200">
              직업 퀴즈 {index + 1}/{questions.length} · 모두 맞히면 +{formatWon(JOB_QUIZ_REWARD_WON)}, 틀리면 -{formatWon(JOB_QUIZ_PENALTY_WON)}
            </p>
            <p data-testid="job-quiz-question" className="text-center text-sm font-bold text-white sm:text-base">
              {current.question}
            </p>
            {current.choices.map((choice, i) => (
              <button
                key={choice}
                type="button"
                data-testid="job-quiz-choice"
                data-index={i}
                disabled={answered}
                onClick={() => handleChoose(i)}
                className={`rounded-xl border-2 px-3 py-2 text-left text-sm font-bold ${
                  selected === i ? 'border-amber-400 bg-amber-100 text-amber-900' : 'border-white/30 bg-white/90 text-slate-800 hover:border-amber-400'
                }`}
              >
                {choice}
              </button>
            ))}
            {answered && (
              <button
                type="button"
                data-testid="job-quiz-next-button"
                onClick={handleNext}
                className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2.5 text-sm font-bold text-white"
              >
                {isLast ? '결과 보기' : '다음 문제'}
              </button>
            )}
          </div>
        )}

        {settlement && (
          <div data-testid="job-quiz-result" data-outcome={settlement.outcome} className="flex w-full max-w-md flex-col gap-2 rounded-2xl bg-black/70 p-4 text-white">
            <p data-testid="job-quiz-result-message" className={`text-center text-base font-black ${success ? 'text-amber-200' : 'text-red-200'}`}>
              {success
                ? `축하합니다! 직업 퀴즈 2문제를 모두 맞혔어요. 가상 용돈 ${formatWon(JOB_QUIZ_REWARD_WON)}이 적립되었습니다.`
                : `아쉽게도 도전에 실패했어요. 가상 용돈 ${formatWon(JOB_QUIZ_PENALTY_WON)}이 차감되었습니다. 정답과 해설을 확인해 보세요.`}
            </p>
            <ul className="flex flex-col gap-1 text-xs">
              {questions.map((q, i) => {
                const ok = picks[i] === q.correctIndex
                return (
                  <li key={q.id} data-testid="job-quiz-review" className="rounded-lg bg-white/10 px-2 py-1.5">
                    <span className="font-bold">{ok ? '⭕' : '❌'} {q.question}</span>
                    <br />
                    정답: {q.choices[q.correctIndex]}
                    {!ok && picks[i] !== undefined && <> (내 답: {q.choices[picks[i]]})</>}
                  </li>
                )
              })}
            </ul>
            {settlement.balanceAfterWon !== null && (
              <p data-testid="job-quiz-balance" className="text-center text-sm font-bold">
                💰 현재 가상 용돈 {formatWon(settlement.balanceAfterWon)}
              </p>
            )}
            {history.length > 0 && (
              <ul data-testid="job-quiz-history" className="flex flex-col gap-0.5 text-xs text-white/80">
                {history.slice(0, 5).map((h) => (
                  <li key={h.id} className="flex justify-between">
                    <span>{h.label}</span>
                    <span className={h.deltaWon >= 0 ? 'text-emerald-300' : 'text-red-300'}>
                      {h.deltaWon >= 0 ? '+' : '-'}
                      {formatWon(Math.abs(h.deltaWon))}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              data-testid="job-quiz-return-button"
              onClick={onClose}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2.5 text-sm font-bold text-white"
            >
              AI 키우기로 돌아가기
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
