import { useEffect, useState } from 'react'
import { useMockWallet } from '../hooks/useMockWallet'
import { JOB_CARDS, type JobCardEntry } from '../data/jobCards'

// 지시서(직업 그림 퀴즈): "2단계에서 생성한 jobCards.js(.ts)를 그대로
// import"하라는 전제에 따라 새 데이터 파일을 만들지 않고 카드 맞추기
// 미니게임과 같은 src/data/jobCards.ts를 재사용한다. 잔액은 사용자
// 확인("독립적인 별도 잔액")에 따라 카드 맞추기와도, /grow와도 공유하지
// 않는 전용 useMockWallet 인스턴스를 쓴다.
const CORRECT_REWARD_WON = 10_000
const PERFECT_BONUS_WON = 20_000
const QUESTIONS_PER_SESSION = 5
const OPTIONS_PER_QUESTION = 4

type QuizQuestion = {
  key: string
  type: 'job' | 'tool'
  image: string
  prompt: string
  correctJobId: string
  options: { jobId: string; label: string }[]
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function pickRandom<T>(items: T[], count: number): T[] {
  return shuffle(items).slice(0, count)
}

// 지시서: "문제 생성 규칙 ... 런타임에 jobCards.js에서 자동 생성,
// 하드코딩 금지" — 매 세션(또는 "다시 하기")마다 이 함수를 새로 호출해
// 직업 선택·유형(A/B)·도구·보기 순서를 전부 다시 무작위로 뽑는다.
function buildQuestions(jobs: JobCardEntry[]): QuizQuestion[] {
  const chosenJobs = pickRandom(jobs, QUESTIONS_PER_SESSION)

  return chosenJobs.map((job, index) => {
    const type: 'job' | 'tool' = Math.random() < 0.5 ? 'job' : 'tool'
    const distractorJobs = pickRandom(
      jobs.filter((j) => j.id !== job.id),
      OPTIONS_PER_QUESTION - 1,
    )
    const options = shuffle([
      { jobId: job.id, label: job.jobName },
      ...distractorJobs.map((j) => ({ jobId: j.id, label: j.jobName })),
    ])

    if (type === 'job') {
      return {
        key: `${job.id}-job-${index}`,
        type,
        image: job.jobImage,
        prompt: '이 사람은 무슨 일을 할까요?',
        correctJobId: job.id,
        options,
      }
    }

    const tool = pickRandom(job.tools, 1)[0]
    return {
      key: `${job.id}-tool-${tool.id}-${index}`,
      type,
      image: tool.image,
      prompt: '이 도구를 쓰는 직업은?',
      correctJobId: job.id,
      options,
    }
  })
}

// 지시서(카드 맞추기와 동일한 "이미지 로드 실패 시 텍스트" 원칙) —
// jobCards.ts의 이미지 경로는 placeholder라 항상 실패하고, 질문
// 프롬프트 자체(아래 prompt 텍스트)가 라벨을 대신하므로 실패 시엔
// 빈 플레이스홀더 박스만 보여준다.
function QuizImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-indigo-100 text-4xl" aria-hidden>
        🖼️
      </div>
    )
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      width={128}
      height={128}
      className="h-32 w-32 rounded-2xl object-contain"
      onError={() => setFailed(true)}
    />
  )
}

export default function JobQuiz() {
  const wallet = useMockWallet()
  const [questions, setQuestions] = useState<QuizQuestion[]>(() => buildQuestions(JOB_CARDS))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [correctCount, setCorrectCount] = useState(0)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [answeredCorrectly, setAnsweredCorrectly] = useState(false)
  const [showTryAgain, setShowTryAgain] = useState(false)
  const [finished, setFinished] = useState(false)
  // 재도전 시 벌점은 없지만(지시서), "만점 보너스"는 한 번도 틀리지
  // 않고 5문제를 전부 맞혔을 때만 주는 것으로 해석했다 — 재도전이
  // 허용되는 한 결국 5문제 모두 "정답"으로 끝나게 되어 있어서,
  // correctCount만으로는 만점 여부를 구분할 수 없기 때문이다.
  const [perfectRun, setPerfectRun] = useState(true)

  useEffect(() => {
    wallet.grantInitialAllowance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = questions[currentIndex]

  const handleSelect = (jobId: string) => {
    if (answeredCorrectly) return
    setSelectedJobId(jobId)

    if (jobId === current.correctJobId) {
      setAnsweredCorrectly(true)
      setShowTryAgain(false)
      wallet.earn(CORRECT_REWARD_WON)
      setCorrectCount((c) => c + 1)
    } else {
      setShowTryAgain(true)
      setPerfectRun(false)
    }
  }

  const handleNext = () => {
    if (currentIndex + 1 >= questions.length) {
      if (perfectRun) {
        wallet.earn(PERFECT_BONUS_WON)
      }
      setFinished(true)
      return
    }
    setCurrentIndex((i) => i + 1)
    setSelectedJobId(null)
    setAnsweredCorrectly(false)
    setShowTryAgain(false)
  }

  const handleRestart = () => {
    setQuestions(buildQuestions(JOB_CARDS))
    setCurrentIndex(0)
    setCorrectCount(0)
    setSelectedJobId(null)
    setAnsweredCorrectly(false)
    setShowTryAgain(false)
    setFinished(false)
    setPerfectRun(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-100 to-blue-50 px-4 py-3">
        <div>
          <p className="text-xs font-bold text-indigo-500">체험판 — 새로고침하면 초기화돼요</p>
          <p className="text-lg font-black text-indigo-900" data-testid="job-quiz-balance">
            {wallet.balanceWon !== null ? `${wallet.balanceWon.toLocaleString('ko-KR')}원` : '지급 전'}
          </p>
        </div>
        <p className="text-sm font-bold text-indigo-700" data-testid="job-quiz-progress">
          {finished ? `${questions.length} / ${questions.length} 완료` : `${currentIndex + 1} / ${questions.length} 문제`}
        </p>
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-indigo-100" data-testid="job-quiz-progress-bar">
        <div
          className="h-full rounded-full bg-indigo-500 transition-all"
          style={{ width: `${((finished ? questions.length : currentIndex) / questions.length) * 100}%` }}
        />
      </div>

      {!finished && current && (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-indigo-200 bg-white p-5 text-center">
          <QuizImage src={current.image} />
          <p className="text-base font-bold text-indigo-900" data-testid="job-quiz-prompt">
            {current.prompt}
          </p>

          <div className="grid w-full grid-cols-2 gap-2">
            {current.options.map((option) => {
              const isSelected = selectedJobId === option.jobId
              const isCorrectOption = option.jobId === current.correctJobId
              return (
                <button
                  key={option.jobId}
                  type="button"
                  data-testid="job-quiz-option"
                  data-job-id={option.jobId}
                  data-correct={isCorrectOption}
                  onClick={() => handleSelect(option.jobId)}
                  disabled={answeredCorrectly}
                  className={`rounded-xl border-2 px-3 py-2.5 text-sm font-bold transition-colors ${
                    isSelected && isCorrectOption
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-700'
                      : isSelected
                        ? 'border-red-300 bg-red-50 text-red-600'
                        : 'border-indigo-200 bg-indigo-50 text-indigo-800 hover:border-indigo-400'
                  }`}
                >
                  {option.label}
                </button>
              )
            })}
          </div>

          {answeredCorrectly && (
            <p className="text-sm font-bold text-emerald-600" data-testid="job-quiz-feedback-correct">
              정답이에요! +{CORRECT_REWARD_WON.toLocaleString('ko-KR')}원
            </p>
          )}
          {showTryAgain && !answeredCorrectly && (
            <p className="text-sm font-bold text-red-500" data-testid="job-quiz-feedback-wrong">
              다시 생각해볼까요?
            </p>
          )}

          {answeredCorrectly && (
            <button
              type="button"
              data-testid="job-quiz-next-button"
              onClick={handleNext}
              className="rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-6 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_rgba(55,48,163,0.4)] hover:from-indigo-600 hover:to-blue-600"
            >
              {currentIndex + 1 >= questions.length ? '결과 보기' : '다음 문제'}
            </button>
          )}
        </div>
      )}

      {finished && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-indigo-200 bg-white p-6 text-center" data-testid="job-quiz-summary">
          <p className="text-lg font-black text-indigo-900">
            {questions.length}문제 중 {correctCount}개 정답!
          </p>
          {perfectRun && (
            <p className="text-sm font-bold text-amber-600">
              🎉 전체 정답! 보너스 +{PERFECT_BONUS_WON.toLocaleString('ko-KR')}원
            </p>
          )}
          <button
            type="button"
            data-testid="job-quiz-restart-button"
            onClick={handleRestart}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 px-6 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_rgba(55,48,163,0.4)] hover:from-indigo-600 hover:to-blue-600"
          >
            다시 하기
          </button>
        </div>
      )}
    </div>
  )
}
