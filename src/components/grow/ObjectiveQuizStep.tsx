import { useEffect, useState } from 'react'
import { useGrowth, type CompanionType, type ObjectiveQuizQuestion } from '../../context/GrowthContext'
import type { MissionProgress } from '../../data/characterMissions'

// 지시서(학습 플로우 전면 개편) 2단계 "객관식 2문제" — 완전히 새 전용
// 컴포넌트(사용자 승인: "완전히 새 컴포넌트로 제작"). 기존 ExamPanel의
// 퀴즈(문항 1개씩 따로 채점)와 달리, 이 2문제는 반드시 "세트"로 묶여
// 제출되고 둘 다 맞아야만 통과한다 — 하나라도 틀리면 answers를 초기화
// 하고 getObjectiveQuiz를 다시 호출해 완전히 새 2문제를 받아 처음부터
// 반복한다(요청 3번: 세트 단위 무한 반복).
export default function ObjectiveQuizStep({
  companionType,
  onAllCorrect,
}: {
  companionType: CompanionType
  // 세트를 통과했을 때(2문제 모두 정답) 호출된다 — 이 저장 2건이 각각
  // 실제 character_knowledge_entries로 들어갔으므로, 호출부(InteractionPanel)
  // 가 onKnowledgeSaved()를 정확히 2번 불러줘야 기존 3회 단위 식사/서점
  // 외출/알바 로테이션과 숫자가 계속 맞는다.
  onAllCorrect: (missionProgress: MissionProgress | null) => void
}) {
  const { getObjectiveQuiz, submitObjectiveQuiz } = useGrowth()

  const [questions, setQuestions] = useState<[ObjectiveQuizQuestion, ObjectiveQuizQuestion] | null>(null)
  const [quizToken, setQuizToken] = useState<string | null>(null)
  const [answers, setAnswers] = useState<[number | null, number | null]>([null, null])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [wrongResult, setWrongResult] = useState<{ questionId: string; correct: boolean }[] | null>(null)

  const loadQuestions = async () => {
    setLoading(true)
    setLoadError(null)
    setAnswers([null, null])
    setWrongResult(null)
    try {
      const result = await getObjectiveQuiz(companionType)
      setQuestions(result.questions)
      setQuizToken(result.quizToken)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '문제를 불러오는 중 오류가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadQuestions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionType])

  const handleSubmit = async () => {
    if (!quizToken || answers[0] === null || answers[1] === null) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await submitObjectiveQuiz(companionType, quizToken, [answers[0], answers[1]])
      if (result.allCorrect) {
        onAllCorrect(result.missionProgress)
        return
      }
      setWrongResult(result.results)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '채점 중 오류가 발생했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <p className="text-base font-semibold text-cyan-200/60">문제를 불러오는 중...</p>
  }
  if (loadError || !questions) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-base font-bold text-rose-300">{loadError ?? '문제를 불러오지 못했어요.'}</p>
        <button
          type="button"
          onClick={() => void loadQuestions()}
          className="self-start rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-4" data-testid="objective-quiz-step">
      <p className="text-lg font-extrabold text-cyan-200 sm:text-xl">🎯 2단계 · 객관식 2문제</p>
      <p className="text-sm font-semibold text-cyan-200/70 sm:text-base">두 문제 모두 맞혀야 다음 단계로 넘어가요.</p>

      {wrongResult && (
        <div data-testid="objective-quiz-wrong-notice" className="flex flex-col gap-2 rounded-xl border border-rose-400/40 bg-rose-400/10 p-3">
          <p className="text-base font-bold text-rose-300">앗, 틀렸어요! 다시 도전해 볼까요?</p>
          <button
            type="button"
            data-testid="objective-quiz-retry-button"
            onClick={() => void loadQuestions()}
            className="self-start rounded-xl border-2 border-rose-300/60 bg-rose-400/20 px-4 py-2 text-sm font-bold text-rose-100 hover:bg-rose-400/30"
          >
            새 문제로 다시 도전하기
          </button>
        </div>
      )}

      {!wrongResult &&
        questions.map((q, qIdx) => (
          <div key={q.id} data-testid={`objective-quiz-question-${qIdx}`} className="flex flex-col gap-2">
            <p className="text-base font-bold text-slate-100">
              {qIdx + 1}. {q.text}
            </p>
            <div className="flex flex-col gap-1.5">
              {q.choices.map((choice, cIdx) => (
                <button
                  key={cIdx}
                  type="button"
                  data-testid={`objective-quiz-choice-${qIdx}-${cIdx}`}
                  onClick={() =>
                    setAnswers((prev) => {
                      const next = [...prev] as [number | null, number | null]
                      next[qIdx] = cIdx
                      return next
                    })
                  }
                  className={`rounded-xl border px-3 py-2 text-left text-sm font-semibold ${
                    answers[qIdx] === cIdx ? 'border-cyan-400 bg-cyan-400/20 text-cyan-100' : 'border-slate-600 bg-slate-900/50 text-slate-200'
                  }`}
                >
                  {choice}
                </button>
              ))}
            </div>
          </div>
        ))}

      {!wrongResult && (
        <button
          type="button"
          data-testid="objective-quiz-submit-button"
          onClick={() => void handleSubmit()}
          disabled={submitting || answers[0] === null || answers[1] === null}
          className="self-start rounded-xl border-2 border-emerald-300/60 bg-gradient-to-b from-emerald-400/40 to-emerald-600/30 px-5 py-3 text-base font-extrabold text-emerald-100 shadow-[0_3px_0_rgba(16,185,129,0.4)] disabled:opacity-50"
        >
          {submitting ? '채점 중...' : '제출'}
        </button>
      )}
      {submitError && <p className="text-base font-bold text-rose-300">{submitError}</p>}
    </div>
  )
}
