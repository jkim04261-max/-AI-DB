import { memo, useEffect, useMemo, useState } from 'react'
import { useMockWallet } from '../../hooks/useMockWallet'
import { reward } from '../../services/paymentService'
import { JOB_CARDS, type JobCardEntry } from '../../data/jobCards'

// 지시서(직업 카드 맞추기 미니게임): "독립적인 별도 잔액" 결정에
// 따라 이 게임 전용 useMockWallet 인스턴스를 따로 쓴다 — /grow의
// 실제 가상 용돈(useMockWallet, GrowPage.tsx)과는 전혀 연결되지
// 않고, 새로고침하면 초기화된다(기존 useMockWallet/useMockInventory
// 와 같은 체험판 원칙). 온보딩 절차 없이 마운트 시 바로 지급한다 —
// 이 페이지는 /grow의 캐릭터 생성 흐름과 무관하게 독립적으로
// 들어올 수 있어야 하기 때문이다.
const MATCH_REWARD_WON = 5_000
const CLEAR_BONUS_WON = 20_000
const CARDS_PER_GAME = 6
const MISMATCH_DELAY_MS = 3000

type GameCard =
  | { key: string; kind: 'job'; jobId: string; label: string; image: string }
  | { key: string; kind: 'tool'; jobId: string; label: string; image: string }

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

function buildDeck(jobs: JobCardEntry[]): GameCard[] {
  const chosenJobs = pickRandom(jobs, CARDS_PER_GAME)
  const cards: GameCard[] = []
  for (const job of chosenJobs) {
    const tool = pickRandom(job.tools, 1)[0]
    cards.push({ key: `${job.id}-job`, kind: 'job', jobId: job.id, label: job.jobName, image: job.jobImage })
    cards.push({ key: `${job.id}-tool-${tool.id}`, kind: 'tool', jobId: job.id, label: tool.name, image: tool.image })
  }
  return shuffle(cards)
}

// 지시서: TTS는 기존 유틸이 있으면 재사용하라고 했지만, 이 저장소에는
// 아직 TTS 유틸이 없다(검색 확인) — Web Speech API로 바로 구현한다.
function speak(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'ko-KR'
  window.speechSynthesis.speak(utterance)
}

// 지시서: "이미지 로드 실패 시 직업명 텍스트가 표시되는 fallback" +
// "카드에 직업명·도구명 한글 라벨 필수 표기" — 라벨은 이미지 로드
// 성공 여부와 무관하게 항상 카드 아래에 따로 보여주고, 이미지
// 영역만 실패 시 텍스트 블록으로 바뀐다. 실제 이미지 파일은 만들지
// 않았으므로(지시서) 지금은 항상 이 fallback 경로를 탄다.
// 리팩터링(성능): props(src/label)가 원시값(string)뿐이고 부모
// CardMatchGame의 잦은 상태 변화(flipped/busy 등)마다 전체 그리드가
// 리렌더될 때 이미 뒤집힌/맞춘 카드까지 불필요하게 다시 그려지는 것을
// 막기 위해 memo 적용 — 렌더 결과·동작은 동일하다.
const CardArt = memo(function CardArt({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    return (
      <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-700 p-1 text-center text-[11px] font-bold leading-tight text-slate-200">
        {label}
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={label}
      width={64}
      height={64}
      loading="lazy"
      className="h-16 w-16 object-contain"
      onError={() => setFailed(true)}
    />
  )
})

export default function CardMatchGame() {
  const wallet = useMockWallet()
  const [cards, setCards] = useState<GameCard[]>(() => buildDeck(JOB_CARDS))
  const [flipped, setFlipped] = useState<number[]>([])
  const [matchedJobIds, setMatchedJobIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  useEffect(() => {
    wallet.grantInitialAllowance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPairs = CARDS_PER_GAME
  const matchedCount = matchedJobIds.size

  useEffect(() => {
    if (matchedCount === totalPairs && totalPairs > 0 && !cleared) {
      setCleared(true)
      reward(wallet, CLEAR_BONUS_WON, 'card_match_reward')
      setLastMessage(`🎉 전체 클리어! 보너스 +${CLEAR_BONUS_WON.toLocaleString('ko-KR')}원`)
      speak('모두 맞혔어요! 축하해요!')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedCount, totalPairs, cleared])

  const handleNewGame = () => {
    setCards(buildDeck(JOB_CARDS))
    setFlipped([])
    setMatchedJobIds(new Set())
    setBusy(false)
    setCleared(false)
    setLastMessage(null)
  }

  const handleCardClick = (index: number) => {
    if (busy) return
    const card = cards[index]
    if (flipped.includes(index)) return
    if (matchedJobIds.has(card.jobId)) return

    if (flipped.length === 0) {
      setFlipped([index])
      return
    }

    if (flipped.length === 1) {
      const firstIndex = flipped[0]
      const first = cards[firstIndex]
      setFlipped([firstIndex, index])

      const isMatch = first.jobId === card.jobId && first.kind !== card.kind
      if (isMatch) {
        setMatchedJobIds((prev) => {
          const next = new Set(prev)
          next.add(card.jobId)
          return next
        })
        setFlipped([])
        reward(wallet, MATCH_REWARD_WON, 'card_match_reward')
        setLastMessage(`정답이에요! +${MATCH_REWARD_WON.toLocaleString('ko-KR')}원`)
        speak('정답이에요!')
      } else {
        setBusy(true)
        setTimeout(() => {
          setFlipped([])
          setBusy(false)
        }, MISMATCH_DELAY_MS)
      }
    }
  }

  const progressLabel = useMemo(() => `${matchedCount} / ${totalPairs} 쌍`, [matchedCount, totalPairs])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl border border-amber-300 bg-gradient-to-r from-amber-100 to-yellow-50 px-4 py-3">
        <div>
          <p className="text-xs font-bold text-amber-500">체험판 — 새로고침하면 초기화돼요</p>
          <p className="text-lg font-black text-amber-900" data-testid="card-match-balance">
            {wallet.balanceWon !== null ? `${wallet.balanceWon.toLocaleString('ko-KR')}원` : '지급 전'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-semibold text-amber-600">맞춘 쌍</p>
          <p className="text-base font-bold text-amber-800" data-testid="card-match-progress">
            {progressLabel}
          </p>
        </div>
      </div>

      {lastMessage && (
        <p data-testid="card-match-message" className="text-center text-sm font-bold text-emerald-600">
          {lastMessage}
        </p>
      )}

      <div className="grid grid-cols-4 gap-3" data-testid="card-match-grid">
        {cards.map((card, index) => {
          const isFlipped = flipped.includes(index) || matchedJobIds.has(card.jobId)
          return (
            <button
              key={card.key}
              type="button"
              data-testid={isFlipped ? `card-match-face-${card.key}` : 'card-match-back'}
              // 테스트 전용 속성 — 화면에는 보이지 않고, 매 게임마다
              // 바뀌는 셔플 순서와 무관하게 특정 직업/도구 카드를
              // e2e에서 안정적으로 찾기 위한 것이다(정답 유출 아님:
              // 시각적으로 뒷면 카드는 여전히 "❓"만 보인다).
              data-job-id={card.jobId}
              data-kind={card.kind}
              onClick={() => handleCardClick(index)}
              disabled={isFlipped}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border-2 p-2 transition-all ${
                matchedJobIds.has(card.jobId)
                  ? 'border-emerald-400 bg-emerald-50'
                  : isFlipped
                    ? 'border-amber-400 bg-white'
                    : 'border-slate-300 bg-slate-600 hover:bg-slate-500'
              }`}
            >
              {isFlipped ? (
                <>
                  <CardArt src={card.image} label={card.label} />
                  <span className="text-xs font-bold text-slate-800">{card.label}</span>
                </>
              ) : (
                <span className="text-2xl" aria-hidden>
                  ❓
                </span>
              )}
            </button>
          )
        })}
      </div>

      {cleared && (
        <button
          type="button"
          onClick={handleNewGame}
          className="self-center rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-6 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_rgba(146,64,14,0.4)] hover:from-amber-600 hover:to-yellow-600"
        >
          다시 하기
        </button>
      )}
    </div>
  )
}
