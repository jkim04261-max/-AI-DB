import { useState } from 'react'
import { useGrowth, type Character, type QuizQuestion, type ExamQuestion } from '../../context/GrowthContext'
import { PROFESSION_LABEL, type ProfessionId } from '../../data/characterProfessions'
import type { CharacterPose } from './CharacterSprite'

const COMPANION_LABEL: Record<Character['companionType'], string> = { nuri: '누리', duri: '두리' }

type Mode = 'menu' | 'quiz' | 'exam'

// PR #45 checkpoint 4 (조건 4): 퀴즈(문항 1개, 정답 시 +5XP, 문항당 최초
// 1회만)와 직업별 시험(전 문항 제출, 합격 시 +50XP, 직업당 최초 합격만)을
// 하나의 패널에서 제공한다. 정답은 서버에서만 채점하고(client는 never
// correctIndex를 받지 않음), 이 패널은 getQuiz/submitQuiz/getExam/submitExam을
// 통해서만 서버와 통신한다.
export default function ExamPanel({
  character,
  profession,
  onPoseChange,
}: {
  character: Character
  profession: ProfessionId
  onPoseChange?: (pose: CharacterPose) => void
}) {
  const { getQuiz, submitQuiz, getExam, submitExam } = useGrowth()
  const name = COMPANION_LABEL[character.companionType]

  const [mode, setMode] = useState<Mode>('menu')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [quizQuestion, setQuizQuestion] = useState<QuizQuestion | null>(null)
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null)
  const [quizResult, setQuizResult] = useState<{ correct: boolean; explanation: string; message: string } | null>(
    null,
  )
  const [quizSubmitting, setQuizSubmitting] = useState(false)

  const [examQuestions, setExamQuestions] = useState<ExamQuestion[] | null>(null)
  const [examAlreadyPassed, setExamAlreadyPassed] = useState(false)
  const [examAnswers, setExamAnswers] = useState<Record<string, number>>({})
  const [examResult, setExamResult] = useState<{
    passed: boolean
    score: number
    total: number
    results: { questionId: string; correct: boolean }[]
    message: string
  } | null>(null)
  const [examSubmitting, setExamSubmitting] = useState(false)

  const flash = (pose: CharacterPose) => {
    onPoseChange?.(pose)
    setTimeout(() => onPoseChange?.('idle'), 2500)
  }

  const openQuiz = async () => {
    setMode('quiz')
    setLoading(true)
    setError(null)
    setQuizResult(null)
    setQuizAnswer(null)
    try {
      const result = await getQuiz(character.companionType)
      setQuizQuestion(result.question)
    } catch (err) {
      setError(err instanceof Error ? err.message : '퀴즈를 불러오는 중 오류가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  const openExam = async () => {
    setMode('exam')
    setLoading(true)
    setError(null)
    setExamResult(null)
    setExamAnswers({})
    try {
      const result = await getExam(character.companionType)
      setExamQuestions(result.questions)
      setExamAlreadyPassed(result.alreadyPassed)
    } catch (err) {
      setError(err instanceof Error ? err.message : '시험 문제를 불러오는 중 오류가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitQuiz = async () => {
    if (!quizQuestion || quizAnswer === null) return
    setQuizSubmitting(true)
    setError(null)
    try {
      const result = await submitQuiz(character.companionType, quizQuestion.id, quizAnswer)
      setQuizResult({ correct: result.correct, explanation: result.explanation, message: result.message })
      flash(result.correct ? 'happy' : 'sad')
    } catch (err) {
      setError(err instanceof Error ? err.message : '퀴즈 채점 중 오류가 발생했어요.')
    } finally {
      setQuizSubmitting(false)
    }
  }

  const handleSubmitExam = async () => {
    if (!examQuestions || examQuestions.some((q) => examAnswers[q.id] === undefined)) return
    setExamSubmitting(true)
    setError(null)
    try {
      const answers = examQuestions.map((q) => ({ questionId: q.id, answerIndex: examAnswers[q.id] }))
      const result = await submitExam(character.companionType, answers)
      setExamResult(result)
      setExamAlreadyPassed((prev) => prev || result.passed)
      flash(result.passed ? 'happy' : 'sad')
    } catch (err) {
      setError(err instanceof Error ? err.message : '시험 채점 중 오류가 발생했어요.')
    } finally {
      setExamSubmitting(false)
    }
  }

  const closePanel = () => {
    setMode('menu')
    setError(null)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 p-4">
      <p className="text-xs font-semibold text-slate-500">
        {name} · {PROFESSION_LABEL[profession]} 시험
      </p>

      {mode === 'menu' && (
        <div className="flex gap-2">
          <button
            onClick={() => void openQuiz()}
            className="flex-1 rounded-xl border border-indigo-200 py-2 text-sm font-semibold text-indigo-500 hover:bg-indigo-50"
          >
            퀴즈 풀기 (정답 +5XP)
          </button>
          <button
            onClick={() => void openExam()}
            className="flex-1 rounded-xl bg-indigo-500 py-2 text-sm font-semibold text-white hover:bg-indigo-600"
          >
            자격 시험 보기 (최초 합격 +50XP)
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {loading && <p className="text-xs text-slate-400">불러오는 중...</p>}

      {mode === 'quiz' && !loading && quizQuestion && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-slate-800">{quizQuestion.text}</p>
          <div className="flex flex-col gap-1.5">
            {quizQuestion.choices.map((choice, idx) => (
              <button
                key={idx}
                onClick={() => setQuizAnswer(idx)}
                disabled={quizResult !== null}
                className={`rounded-xl border px-3 py-2 text-left text-sm disabled:opacity-60 ${
                  quizAnswer === idx ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'
                }`}
              >
                {choice}
              </button>
            ))}
          </div>

          {!quizResult && (
            <button
              onClick={() => void handleSubmitQuiz()}
              disabled={quizAnswer === null || quizSubmitting}
              className="self-start rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              {quizSubmitting ? '채점 중...' : '제출'}
            </button>
          )}

          {quizResult && (
            <div
              className={`rounded-xl p-3 text-sm ${quizResult.correct ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}
            >
              {quizResult.message}
            </div>
          )}

          <div className="flex gap-2">
            {quizResult && (
              <button onClick={() => void openQuiz()} className="self-start text-xs font-semibold text-indigo-500 hover:text-indigo-600">
                다른 문제 풀기
              </button>
            )}
            <button onClick={closePanel} className="self-start text-xs text-slate-400 hover:text-slate-600">
              닫기
            </button>
          </div>
        </div>
      )}

      {mode === 'exam' && !loading && examQuestions && (
        <div className="flex flex-col gap-4">
          {examAlreadyPassed && !examResult && (
            <p className="text-xs text-indigo-500">이미 이 직업 시험에 합격했어요. 다시 봐도 추가 XP는 없어요.</p>
          )}
          {examQuestions.map((q, qIdx) => (
            <div key={q.id} className="flex flex-col gap-1.5">
              <p className="text-sm font-medium text-slate-800">
                {qIdx + 1}. {q.text}
              </p>
              <div className="flex flex-col gap-1.5">
                {q.choices.map((choice, idx) => {
                  const resultForQ = examResult?.results.find((r) => r.questionId === q.id)
                  return (
                    <button
                      key={idx}
                      onClick={() => setExamAnswers((prev) => ({ ...prev, [q.id]: idx }))}
                      disabled={examResult !== null}
                      className={`rounded-xl border px-3 py-2 text-left text-sm disabled:opacity-60 ${
                        examAnswers[q.id] === idx
                          ? resultForQ
                            ? resultForQ.correct
                              ? 'border-green-400 bg-green-50 text-green-700'
                              : 'border-red-400 bg-red-50 text-red-700'
                            : 'border-indigo-400 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {choice}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {!examResult && (
            <button
              onClick={() => void handleSubmitExam()}
              disabled={examSubmitting || examQuestions.some((q) => examAnswers[q.id] === undefined)}
              className="self-start rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              {examSubmitting ? '채점 중...' : '제출'}
            </button>
          )}

          {examResult && (
            <div
              className={`rounded-xl p-3 text-sm ${examResult.passed ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}
            >
              {examResult.message}
            </div>
          )}

          <div className="flex gap-2">
            {examResult && (
              <button onClick={() => void openExam()} className="self-start text-xs font-semibold text-indigo-500 hover:text-indigo-600">
                다시 보기
              </button>
            )}
            <button onClick={closePanel} className="self-start text-xs text-slate-400 hover:text-slate-600">
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
