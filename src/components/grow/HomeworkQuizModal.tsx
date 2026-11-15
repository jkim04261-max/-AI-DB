import { useState } from 'react'
import { pickRandomHouseworkQuestion, type HouseworkQuizQuestion } from '../../data/householdQuizzes'

// 지시서(8세 전용 경제 활동 기획: 엄마/아빠 심부름 이벤트): 심부름을
// 거절했을 때 뜨는 "집에서 숙제하기" 페널티 모달 — 정답을 맞혀야만
// 닫히고 학습 화면으로 돌아간다(지시서: "퀴즈 정답을 맞히면 모달이
// 닫히고... 오답 시 재도전"). 나가기/건너뛰기 버튼을 일부러 두지
// 않는다 — 페널티라는 취지와 어긋나기 때문이다. 정답/오답 판정은
// JobQuiz.tsx와 같은 "클릭 즉시 채점" 방식을 쓴다(제출 버튼 없음).
export default function HomeworkQuizModal({ onComplete }: { onComplete: () => void }) {
  const [question, setQuestion] = useState<HouseworkQuizQuestion>(() => pickRandomHouseworkQuestion())
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [answeredCorrectly, setAnsweredCorrectly] = useState(false)

  const handleSelect = (index: number) => {
    if (answeredCorrectly) return
    setSelectedIndex(index)
    if (index === question.correctIndex) {
      setAnsweredCorrectly(true)
    }
  }

  // 틀렸을 때 새 문제로 다시 도전한다 — ObjectiveQuizStep의 "세트
  // 단위 재도전"과 같은 원칙(이전 오답 문제를 그대로 반복시키지
  // 않는다).
  const handleRetryWithNewQuestion = () => {
    setQuestion(pickRandomHouseworkQuestion(question.id))
    setSelectedIndex(null)
    setAnsweredCorrectly(false)
  }

  return (
    <div
      data-testid="homework-quiz-modal"
      role="dialog"
      aria-label="숙제하기"
      className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-b from-amber-100 to-orange-50 p-5"
    >
      <p className="text-center text-sm font-bold text-amber-900 sm:text-base">
        심부름을 거절했군요! 집에서 숙제를 해야 해요. 아래 퀴즈를 맞혀주세요.
      </p>

      <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border-2 border-amber-300 bg-white p-5 text-center shadow-[0_3px_0_rgba(146,64,14,0.15)]">
        <span className="text-3xl" aria-hidden>
          📚
        </span>
        <p className="text-base font-bold text-amber-900" data-testid="homework-quiz-question">
          {question.question}
        </p>

        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
          {question.choices.map((choice, index) => {
            const isSelected = selectedIndex === index
            const isCorrectChoice = index === question.correctIndex
            return (
              <button
                key={index}
                type="button"
                data-testid="homework-quiz-choice"
                onClick={() => handleSelect(index)}
                disabled={answeredCorrectly}
                className={`rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                  isSelected && isCorrectChoice
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                    : isSelected
                      ? 'border-red-300 bg-red-50 text-red-600'
                      : 'border-amber-200 bg-amber-50 text-amber-900 hover:border-amber-400'
                }`}
              >
                {choice}
              </button>
            )
          })}
        </div>

        {answeredCorrectly && (
          <p className="text-sm font-bold text-emerald-600" data-testid="homework-quiz-feedback-correct">
            정답이에요! 숙제를 다 했어요.
          </p>
        )}
        {selectedIndex !== null && !answeredCorrectly && (
          <p className="text-sm font-bold text-red-500" data-testid="homework-quiz-feedback-wrong">
            앗, 틀렸어요! 다시 생각해볼까요?
          </p>
        )}

        {answeredCorrectly ? (
          <button
            type="button"
            data-testid="homework-quiz-complete-button"
            onClick={onComplete}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_rgba(146,64,14,0.4)] hover:from-amber-600 hover:to-orange-600"
          >
            돌아가기
          </button>
        ) : (
          selectedIndex !== null && (
            <button
              type="button"
              data-testid="homework-quiz-retry-button"
              onClick={handleRetryWithNewQuestion}
              className="rounded-xl border-2 border-amber-300 bg-white px-6 py-2.5 text-sm font-bold text-amber-700 hover:bg-amber-50"
            >
              새 문제로 다시 도전하기
            </button>
          )
        )}
      </div>
    </div>
  )
}
