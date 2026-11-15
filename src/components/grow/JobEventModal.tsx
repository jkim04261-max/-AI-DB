import { useEffect, useRef, useState } from 'react'
import type { CompanionType } from '../../context/GrowthContext'
import type { AgeTier } from '../../data/characterAge'
import { fullBodyPortraitSrc } from '../../data/characterFullBody'
import { walkingPortraitSrc } from '../../data/characterWalking'
import { useImageFallback } from '../../hooks/useImageFallback'
import { PART_TIME_JOB_ARRIVAL_SRC, PART_TIME_JOB_TOWN_WALK_BG_SRC } from '../../data/partTimeJobAssets'
import {
  pickRandomPartTimeJobType,
  pickThreePartTimeJobQuestions,
  PART_TIME_JOB_LABEL,
  type PartTimeJobType,
  type PartTimeJobQuizQuestion,
} from '../../data/partTimeJobQuizzes'

// 지시서(10대 전용 알바 시스템): 10대 커리큘럼 중간에 2번 뜨는 알바
// 이벤트 — ①동네 전경 위에서 알바 상점으로 걸어가는 연출(기존
// HungryEventModal/ErrandEventModal의 걷기 애니메이션 재활용)
// →②상점 도착(설거지/서빙/편의점 중 무작위 1곳) 화면에서 관련 3문제
// 출제 →③3문제 모두 정답이면 30,000원, 하나라도 틀리면 0원. 오답이어도
// 재도전은 없다(스스로 전부 맞혀야 보상을 받는다는 것이 지시서 "1문제라도
// 틀리면 0원" 규칙의 취지).
const WALK_DURATION_MS = 1200
const JOB_EVENT_QUESTION_COUNT = 3

export default function JobEventModal({
  companionType,
  ageTier,
  ageNumber,
  onComplete,
}: {
  companionType: CompanionType
  ageTier: AgeTier
  ageNumber?: number
  onComplete: (success: boolean) => void
}) {
  const { src: walkingSrc, onError: handleWalkingPortraitError } = useImageFallback(
    walkingPortraitSrc(companionType, ageTier, ageNumber),
    fullBodyPortraitSrc(companionType, ageTier, ageNumber),
  )

  const [phase, setPhase] = useState<'walking' | 'arrived' | 'result'>('walking')
  const [jobType] = useState<PartTimeJobType>(() => pickRandomPartTimeJobType())
  const [questions] = useState<PartTimeJobQuizQuestion[]>(() => pickThreePartTimeJobQuestions(jobType))
  const [questionIndex, setQuestionIndex] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)

  const walkTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    walkTimeoutRef.current = setTimeout(() => setPhase('arrived'), WALK_DURATION_MS)
    return () => {
      if (walkTimeoutRef.current) clearTimeout(walkTimeoutRef.current)
    }
  }, [])

  const currentQuestion = questions[questionIndex]

  const handleChoose = (index: number) => {
    if (answered) return
    setSelectedIndex(index)
    setAnswered(true)
    if (index === currentQuestion.correctIndex) setCorrectCount((c) => c + 1)
  }

  const handleNext = () => {
    if (questionIndex + 1 >= questions.length) {
      setPhase('result')
      return
    }
    setQuestionIndex((i) => i + 1)
    setSelectedIndex(null)
    setAnswered(false)
  }

  const success = correctCount >= JOB_EVENT_QUESTION_COUNT

  return (
    <div
      data-testid="job-event-modal"
      data-job-type={jobType}
      role="dialog"
      aria-label="알바 이벤트"
      className="absolute inset-0 z-30 overflow-hidden rounded-2xl"
    >
      {phase === 'walking' && (
        <>
          <div aria-hidden className="absolute inset-0 overflow-hidden motion-safe:animate-[grow-hungry-bg-parallax_5s_ease-in-out_infinite]">
            <img src={PART_TIME_JOB_TOWN_WALK_BG_SRC} alt="" className="h-full w-full object-cover" />
          </div>
          <div aria-hidden className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-between gap-3 p-4">
            <p className="text-center text-sm font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] sm:text-base">
              알바하러 갈 시간이에요! 상점으로 걸어가 볼까요?
            </p>
            <div className="relative flex flex-1 items-end justify-center pb-2">
              <div className="motion-safe:animate-[grow-hungry-walk-bounce_0.6s_ease-in-out_infinite]">
                <img
                  src={walkingSrc}
                  onError={handleWalkingPortraitError}
                  alt=""
                  className="h-28 w-28 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)]"
                />
              </div>
            </div>
            <div className="h-8" aria-hidden />
          </div>
        </>
      )}

      {phase === 'arrived' && currentQuestion && (
        <>
          <div aria-hidden className="absolute inset-0">
            <img src={PART_TIME_JOB_ARRIVAL_SRC[jobType]} alt="" className="h-full w-full object-cover" />
          </div>
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

          <div className="absolute inset-x-0 top-2 z-10 flex justify-center">
            <p
              data-testid="job-event-shop-label"
              className="rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] sm:text-sm"
            >
              🏪 {PART_TIME_JOB_LABEL[jobType]} 도착! ({questionIndex + 1}/{questions.length}번째 문제)
            </p>
          </div>

          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-3">
            <div className="flex flex-col gap-2 rounded-2xl bg-black/65 p-3 backdrop-blur-sm">
              <p data-testid="job-event-question" className="text-center text-sm font-bold text-white sm:text-base">
                {currentQuestion.question}
              </p>
              <div className="flex flex-col gap-1.5">
                {currentQuestion.choices.map((choice, index) => {
                  const isSelected = selectedIndex === index
                  const isCorrectChoice = index === currentQuestion.correctIndex
                  return (
                    <button
                      key={choice}
                      type="button"
                      data-testid="job-event-choice"
                      data-index={index}
                      onClick={() => handleChoose(index)}
                      disabled={answered}
                      className={`rounded-xl border-2 px-3 py-2 text-left text-sm font-bold transition-colors ${
                        isSelected && isCorrectChoice
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                          : isSelected
                            ? 'border-red-300 bg-red-50 text-red-600'
                            : 'border-white/30 bg-white/90 text-slate-800 hover:border-amber-400'
                      }`}
                    >
                      {choice}
                    </button>
                  )
                })}
              </div>

              {answered && selectedIndex === currentQuestion.correctIndex && (
                <p data-testid="job-event-feedback-correct" className="text-center text-sm font-bold text-emerald-300">
                  정답이에요! 🎉
                </p>
              )}
              {answered && selectedIndex !== currentQuestion.correctIndex && (
                <p data-testid="job-event-feedback-wrong" className="text-center text-sm font-bold text-red-300">
                  아쉬워요, 틀렸어요.
                </p>
              )}

              {answered && (
                <button
                  type="button"
                  data-testid="job-event-next-button"
                  onClick={handleNext}
                  className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_rgba(146,64,14,0.4)] hover:from-amber-600 hover:to-yellow-600"
                >
                  {questionIndex + 1 >= questions.length ? '결과 보기' : '다음 문제'}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {phase === 'result' && (
        <>
          <div aria-hidden className="absolute inset-0">
            <img src={PART_TIME_JOB_ARRIVAL_SRC[jobType]} alt="" className="h-full w-full object-cover" />
          </div>
          <div aria-hidden className="absolute inset-0 bg-black/60" />
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 p-5 text-center">
            {success ? (
              <p data-testid="job-event-success-message" className="text-lg font-black text-amber-200 drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">
                🎉 알바 성공! 용돈 30,000원을 받았어요!
              </p>
            ) : (
              <p data-testid="job-event-fail-message" className="text-lg font-black text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)]">
                😅 알바 실패... 다음엔 더 잘할 수 있어요!
              </p>
            )}
            <p className="text-sm font-semibold text-white/80">
              {questions.length}문제 중 {correctCount}개 정답
            </p>
            <button
              type="button"
              data-testid="job-event-return-button"
              onClick={() => onComplete(success)}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-5 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_rgba(146,64,14,0.4)] hover:from-amber-600 hover:to-yellow-600"
            >
              학습으로 돌아가기
            </button>
          </div>
        </>
      )}
    </div>
  )
}
