import { memo, useEffect, useMemo, useState } from 'react'
import { useMockWallet } from '../../hooks/useMockWallet'
import { reward } from '../../services/paymentService'
import { JOB_CARDS, type JobCardEntry } from '../../data/jobCards'
import type { ProfessionCardTerm } from '../../data/professionCardTerms'

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
  | { key: string; kind: 'term'; jobId: string; label: string; image: string }
  | { key: string; kind: 'meaning'; jobId: string; label: string; image: string }

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

// 지시서(직업별 카드 맞추기 게임 개선): 캐릭터 자신의 등록 직업에 맞춘
// 용어 카드를 쓴다 — 용어(term) 카드와 그 뜻(meaning) 카드를 짝짓는다.
// professionCardTerms.ts가 쉬운 용어부터 정렬해 두므로, pairCount가
// 적을수록(낮은 연령대) 자동으로 쉬운 앞쪽 용어만 쓰인다. 뜻 카드는
// 이미지가 없어(항상 CardArt의 실패 fallback으로 텍스트만 보임) 맞춘
// 즉시 뜻이 화면에 그대로 드러난다.
function buildProfessionDeck(terms: ProfessionCardTerm[], pairCount: number): GameCard[] {
  // terms는 쉬운 용어부터 정렬돼 있다 — 무작위로 아무 n개나 뽑으면 낮은
  // 난이도(적은 쌍 수)에서도 어려운 용어가 섞여 들어갈 수 있으므로,
  // 먼저 "앞쪽 pairCount개"로 난이도를 자른 뒤에만 그 안에서 순서를
  // 섞는다(어떤 쌍이 나올지는 매번 바뀌지만 난이도 상한은 지켜진다).
  const chosen = shuffle(terms.slice(0, Math.min(pairCount, terms.length)))
  const cards: GameCard[] = []
  for (const t of chosen) {
    cards.push({ key: `${t.id}-term`, kind: 'term', jobId: t.id, label: t.term, image: '' })
    cards.push({ key: `${t.id}-meaning`, kind: 'meaning', jobId: t.id, label: t.meaning, image: '' })
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
  // 직업 용어-뜻 카드(src='')는 애초에 이미지가 없으므로, 빈 src로
  // <img>를 실제로 그려 onError에 기대지 않고 바로 텍스트만 보여준다
  // (빈 src는 브라우저마다 error 이벤트가 안정적으로 발생하지 않는다).
  if (failed || src === '') {
    // 용어-뜻 카드는 문장 길이가 다양해(짧은 단어~긴 뜻풀이) 고정
    // 64px 정사각형으로는 좁다 — 부모(카드 버튼)가 반응형으로 이미
    // 크기를 정하므로, 그 크기를 그대로 채우게(w-full h-full) 해서
    // 좁은 화면에서도 줄바꿈으로 잘리지 않고 다 보이게 한다.
    return (
      <div className="flex h-full w-full items-center justify-center rounded-lg bg-slate-700 p-1 text-center text-[10px] font-bold leading-tight text-slate-200 sm:text-xs">
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

export default function CardMatchGame({
  // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): 모달 안에 끼워 넣을
  // 호출부(InteractionPanel)가 "한 세트 클리어"를 알아야 하므로 선택적
  // 콜백을 추가했다 — /card-match 독립 페이지는 이 prop을 안 넘기므로
  // 기존 동작(지갑·보상·"다시 하기" 전부)은 전혀 바뀌지 않는다.
  onCleared,
  // 지시서(직업별 카드 맞추기 게임 개선): 둘 다 지정하면 무작위
  // 직업·도구 대신 이 캐릭터의 등록 직업에 맞춘 용어-뜻 카드를
  // pairCount쌍만큼 쓴다. 둘 중 하나라도 비어 있으면(독립 /card-match
  // 페이지처럼) 기존 방식(JOB_CARDS, 6쌍 고정) 그대로 동작한다.
  professionTerms,
  pairCount,
}: {
  onCleared?: () => void
  professionTerms?: ProfessionCardTerm[]
  pairCount?: number
} = {}) {
  const wallet = useMockWallet()
  const effectivePairCount = pairCount ?? CARDS_PER_GAME
  const [cards, setCards] = useState<GameCard[]>(() =>
    professionTerms ? buildProfessionDeck(professionTerms, effectivePairCount) : buildDeck(JOB_CARDS),
  )
  const [flipped, setFlipped] = useState<number[]>([])
  const [matchedJobIds, setMatchedJobIds] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [cleared, setCleared] = useState(false)
  const [lastMessage, setLastMessage] = useState<string | null>(null)

  useEffect(() => {
    wallet.grantInitialAllowance()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalPairs = professionTerms ? Math.min(effectivePairCount, professionTerms.length) : CARDS_PER_GAME
  const matchedCount = matchedJobIds.size

  useEffect(() => {
    if (matchedCount === totalPairs && totalPairs > 0 && !cleared) {
      setCleared(true)
      reward(wallet, CLEAR_BONUS_WON, 'card_match_reward')
      setLastMessage(`🎉 전체 클리어! 보너스 +${CLEAR_BONUS_WON.toLocaleString('ko-KR')}원`)
      speak('모두 맞혔어요! 축하해요!')
      onCleared?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedCount, totalPairs, cleared])

  const handleNewGame = () => {
    setCards(professionTerms ? buildProfessionDeck(professionTerms, effectivePairCount) : buildDeck(JOB_CARDS))
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
                card.kind === 'term' || card.kind === 'meaning' ? (
                  // 용어·뜻 카드는 CardArt의 텍스트 fallback이 이미
                  // 전체 내용을 보여주므로, job/tool처럼 따로 캡션을
                  // 덧붙이지 않는다(같은 글자를 두 번 보여주지 않음).
                  <CardArt src={card.image} label={card.label} />
                ) : (
                  <>
                    <CardArt src={card.image} label={card.label} />
                    <span className="text-xs font-bold text-slate-800">{card.label}</span>
                  </>
                )
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
