import { useEffect, useRef, useState } from 'react'
import { useGrowth, type CompanionType, type FinalExamQuestion } from '../../context/GrowthContext'
import type { MissionProgress } from '../../data/characterMissions'
import BottomSheet from './BottomSheet'

// 지시서(8세 학습 총 8문제 제한 및 10대 강제 레벨업 로직 수정): 8~9세
// 8문제(직접입력3+객관식3+카드맞추기1+노하우1)를 모두 마치면 뜨는
// "종합 최종 시험" 전용 모달. 합격 기준은 "전부 정답"(부분 점수 없음)
// 이고, 1차 불합격은 틀린 문제만 다시 묻는 재시험으로 이어진다 — 이
// 재시험은 서버가 submitFinalExam 실패 응답에 실어 보낸
// retakeExamToken/wrongQuestions를 그대로 다시 questions/examToken
// 자리에 채워서 같은 "문제 받기 → 답 고르기 → 제출" 화면을 재사용한다
// (별도 GET 호출 없음). 2차 불합격이면 처음부터 다시 키우기/패스권
// 구매 선택지를 보여준다.
const EXAM_DURATION_SECONDS = 5 * 60

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function FinalExamModal({
  companionType,
  onClose,
  onPassed,
  onOpenPassMarket,
}: {
  companionType: CompanionType
  onClose: () => void
  // 합격해서 teen으로 진화했을 때 — 호출부(InteractionPanel)가 missionProgress를
  // 다시 반영하고 축하 대사를 띄울 수 있게 한다.
  onPassed: (missionProgress: MissionProgress | null) => void
  // "마켓에서 패스권 구매" 선택 — 이 모달을 닫고 기존 "한도 소진" 구매
  // 유도 버튼과 같은 만능마켓 진입점을 그대로 연다(GrowPage의
  // onBuyMoreUses, 학습·교육관 카테고리에 패스권이 있다).
  onOpenPassMarket: () => void
}) {
  const { getFinalExam, submitFinalExam, resetCharacterProgress } = useGrowth()

  const [questions, setQuestions] = useState<FinalExamQuestion[] | null>(null)
  const [examToken, setExamToken] = useState<string | null>(null)
  const [answers, setAnswers] = useState<(number | null)[]>([])
  const [passScore, setPassScore] = useState(100)
  const [secondsLeft, setSecondsLeft] = useState(EXAM_DURATION_SECONDS)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    passed: boolean
    score: number
    attemptNumber: number
    blocked: boolean
    message: string
    retakeExamToken: string | null
    wrongQuestions: { id: string; text: string; choices: string[]; correctAnswer: string; explanation: string }[]
  } | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  // 제출(자동 제출 포함)이 두 번 일어나지 않도록, 그리고 타이머 effect가
  // 매번 최신 답안을 읽을 수 있도록 ref로도 들고 있는다.
  const submittingRef = useRef(false)
  const answersRef = useRef<(number | null)[]>([])
  answersRef.current = answers

  const loadExam = async () => {
    setLoading(true)
    setLoadError(null)
    setResult(null)
    setSecondsLeft(EXAM_DURATION_SECONDS)
    try {
      const data = await getFinalExam(companionType)
      setQuestions(data.questions)
      setAnswers(data.questions.map(() => null))
      setExamToken(data.examToken)
      setPassScore(data.passScore)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '종합 최종 시험 문제를 불러오는 중 오류가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadExam()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companionType])

  const handleSubmit = async (tokenOverride?: string) => {
    const token = tokenOverride ?? examToken
    if (!token || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      // 시간이 다 돼서 자동 제출될 때는 아직 안 고른 문제가 있을 수
      // 있다 — -1(어떤 choices index와도 안 겹치는 값)로 채워 "오답"
      // 처리되게 한다.
      const finalAnswers = answersRef.current.map((a) => (a === null ? -1 : a))
      const data = await submitFinalExam(companionType, token, finalAnswers)
      setResult({
        passed: data.passed,
        score: data.score,
        attemptNumber: data.attemptNumber,
        blocked: data.blocked,
        message: data.message,
        retakeExamToken: data.retakeExamToken,
        wrongQuestions: data.wrongQuestions,
      })
      if (data.passed) onPassed(data.missionProgress)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '채점 중 오류가 발생했어요.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  // 5분 타이머 — 문제를 불러온 뒤(questions가 있고)부터, 아직 결과가
  // 없을 때만 돈다. 0이 되면 지금까지 고른 답안 그대로 자동 제출한다.
  useEffect(() => {
    if (!questions || result) return
    if (secondsLeft <= 0) {
      void handleSubmit()
      return
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, result, secondsLeft])

  // 지시서: "불합격하면 틀린문제만 다시 시험" — 새 GET 없이, 방금 받은
  // retakeExamToken/wrongQuestions로 questions/examToken/answers를 그대로
  // 바꿔 끼워 같은 문제-풀이 화면을 재시험용으로 재사용한다.
  const startRetake = () => {
    if (!result?.retakeExamToken) return
    const retakeQuestions = result.wrongQuestions.map((w) => ({ id: w.id, text: w.text, choices: w.choices }))
    setQuestions(retakeQuestions)
    setAnswers(retakeQuestions.map(() => null))
    setExamToken(result.retakeExamToken)
    setSecondsLeft(EXAM_DURATION_SECONDS)
    setResult(null)
  }

  const handleResetProgress = async () => {
    if (resetting) return
    setResetting(true)
    setResetError(null)
    try {
      await resetCharacterProgress(companionType)
      onClose()
    } catch (err) {
      setResetError(err instanceof Error ? err.message : '초기화하는 중 오류가 발생했어요.')
    } finally {
      setResetting(false)
    }
  }

  const allAnswered = answers.length > 0 && answers.every((a) => a !== null)

  return (
    <BottomSheet title="📝 종합 최종 시험" onClose={onClose} variant="mission">
      {loading && <p className="text-base font-semibold text-cyan-200/60">시험 문제를 불러오는 중...</p>}

      {!loading && (loadError || !questions) && (
        <div className="flex flex-col gap-2">
          <p className="text-base font-bold text-rose-300">{loadError ?? '문제를 불러오지 못했어요.'}</p>
          <button
            type="button"
            onClick={() => void loadExam()}
            className="self-start rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700"
          >
            다시 시도
          </button>
        </div>
      )}

      {!loading && questions && !result && (
        <div className="flex flex-col gap-4" data-testid="final-exam-step">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-400/25 bg-cyan-400/5 p-3">
            <p className="text-sm font-semibold text-cyan-200/80">
              {questions.length}문제를 모두 맞혀야 합격이에요({passScore}점 만점).
            </p>
            <p data-testid="final-exam-timer" className={`text-lg font-extrabold ${secondsLeft <= 30 ? 'text-rose-300' : 'text-cyan-200'}`}>
              ⏱️ {formatTime(secondsLeft)}
            </p>
          </div>

          {questions.map((q, qIdx) => (
            <div key={q.id} data-testid={`final-exam-question-${qIdx}`} className="flex flex-col gap-2">
              <p className="text-base font-bold text-slate-100">
                {qIdx + 1}. {q.text}
              </p>
              <div className={`grid gap-1.5 ${q.choices.length >= 10 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
                {q.choices.map((choice, cIdx) => (
                  <button
                    key={cIdx}
                    type="button"
                    data-testid={`final-exam-choice-${qIdx}-${cIdx}`}
                    onClick={() => setAnswers((prev) => prev.map((a, i) => (i === qIdx ? cIdx : a)))}
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

          <button
            type="button"
            data-testid="final-exam-submit-button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !allAnswered}
            className="self-start rounded-xl border-2 border-emerald-300/60 bg-gradient-to-b from-emerald-400/40 to-emerald-600/30 px-5 py-3 text-base font-extrabold text-emerald-100 shadow-[0_3px_0_rgba(16,185,129,0.4)] disabled:opacity-50"
          >
            {submitting ? '채점 중...' : '제출'}
          </button>
          {submitError && <p className="text-base font-bold text-rose-300">{submitError}</p>}
        </div>
      )}

      {result && result.passed && (
        <div data-testid="final-exam-passed" className="flex flex-col gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 p-4">
          <p className="text-xl font-extrabold text-emerald-200">🎉 합격이에요!</p>
          <p className="text-base font-semibold text-emerald-100">{result.message}</p>
          <button
            type="button"
            onClick={onClose}
            className="self-start rounded-xl border-2 border-emerald-300/60 bg-emerald-400/20 px-5 py-3 text-base font-extrabold text-emerald-100 hover:bg-emerald-400/30"
          >
            확인
          </button>
        </div>
      )}

      {result && !result.passed && !result.blocked && (
        <div data-testid="final-exam-failed-retry" className="flex flex-col gap-3 rounded-2xl border border-rose-400/40 bg-rose-400/10 p-4">
          <p className="text-lg font-bold text-rose-300">{result.message}</p>
          <div className="flex flex-col gap-2">
            {result.wrongQuestions.map((w, idx) => (
              <div key={idx} data-testid={`final-exam-wrong-${idx}`} className="rounded-xl border border-rose-300/30 bg-rose-400/5 p-3">
                <p className="text-sm font-bold text-rose-100">{w.text}</p>
                <p className="text-sm font-semibold text-rose-200/80">정답: {w.correctAnswer}</p>
                <p className="text-xs font-semibold text-rose-200/60">{w.explanation}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            data-testid="final-exam-retry-button"
            onClick={startRetake}
            className="self-start rounded-xl border-2 border-rose-300/60 bg-rose-400/20 px-4 py-2 text-sm font-bold text-rose-100 hover:bg-rose-400/30"
          >
            틀린 문제만 다시 시험 보기
          </button>
        </div>
      )}

      {result && !result.passed && result.blocked && (
        <div data-testid="final-exam-blocked-choice" className="flex flex-col gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
          <p className="text-lg font-bold text-amber-200">{result.message}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              data-testid="final-exam-reset-button"
              onClick={() => void handleResetProgress()}
              disabled={resetting}
              className="flex-1 rounded-xl border-2 border-slate-500/60 bg-slate-800/60 px-4 py-3 text-sm font-bold text-slate-100 hover:bg-slate-700/60 disabled:opacity-50"
            >
              {resetting ? '초기화하는 중...' : '🔄 처음부터 다시 키우기'}
            </button>
            <button
              type="button"
              data-testid="final-exam-buy-pass-button"
              onClick={onOpenPassMarket}
              className="flex-1 rounded-xl border-2 border-amber-300/60 bg-amber-400/20 px-4 py-3 text-sm font-bold text-amber-100 hover:bg-amber-400/30"
            >
              🎟️ 마켓에서 패스권 구매
            </button>
          </div>
          {resetError && <p className="text-sm font-bold text-rose-300">{resetError}</p>}
        </div>
      )}
    </BottomSheet>
  )
}
