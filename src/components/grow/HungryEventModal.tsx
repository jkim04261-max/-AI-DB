import { useEffect, useRef, useState } from 'react'
import type { CompanionType } from '../../context/GrowthContext'
import type { AgeTier } from '../../data/characterAge'
import { eatingPortraitSrc } from '../../data/characterEating'
import { fullBodyPortraitSrc } from '../../data/characterFullBody'
import { walkingPortraitSrc } from '../../data/characterWalking'
import { useImageFallback } from '../../hooks/useImageFallback'

// 지시서(배고픔 이벤트 UI/UX 및 경제 시스템 연동): 기존 triggerMealBreak는
// 사용자 선택 없이 자동으로 식사비를 차감하는 연출이었다 — 이 모달이
// 그 자리를 대신해, "밥 먹이기(-10,000원)"/"나중에 먹기" 중 하나를
// 고르게 한다. GameStage 위에 TurnTransition과 같은 자리
// (absolute inset-0 z-30)에 뜬다.
//
// 이름 표기: 지시서는 "[유저이름]님"을 요구하지만, 온보딩에서 입력한
// 캐릭터 이름은 어디에도 저장되지 않아(생일·거주지역과 같은 원칙,
// OpeningProfileScreen 참고) 이 시점(가르치기 3회 이후)엔 더 이상
// 남아있지 않다 — 식사·알바 등 기존 모든 경제 이벤트가 전부
// COMPANION_LABEL(누리/두리)만 쓰는 것과 같은 이유로, 여기서도 그
// 라벨을 쓴다.
//
// 지시서(배고픔 이벤트 시 2.5D 동네 배경 걷기 애니메이션 구현): 사용자가
// 준비한 실제 동네 배경 이미지를 이 세션에서 끝내 받지 못했다 — 채팅에
// 붙여넣은 이미지는 이 환경에서 파일로 내려받을 방법이 없고(업로드
// 디렉터리에도 남지 않음), 사용자도 더 기다리지 않고 "추천으로 자동
// 실행"을 지시했다. 그래서 TOWN_BG_IMAGE_SRC가 비어 있는 동안은 CSS
// 그라디언트로 그린 임시(placeholder) 배경을 쓴다 — 실제 배경 이미지
// 파일이 생기면(예: public/assets/town_bg.png) 이 상수 하나만 그
// 경로로 채우면 아래 패럴랙스/확대 애니메이션 레이어가 그 이미지를
// 그대로 감싸 쓰도록 구조를 짰다.
const TOWN_BG_IMAGE_SRC: string | null = null

const MEAL_COST_WON = 10_000
// "밥 먹이기" 클릭 후 배경 확대 + 음식 아이콘 연출을 보여주는 시간 —
// 이 시간이 지나야 실제 onFeed(부모의 handleFeedCharacter)를 불러
// 모달을 닫는다(지시서 "애니메이션 시간 및 전환").
const FEED_ANIMATION_MS = 900

export default function HungryEventModal({
  companionType,
  companionName,
  ageTier,
  ageNumber,
  balanceWon,
  errorMessage,
  onFeed,
  onLater,
}: {
  companionType: CompanionType
  companionName: string
  ageTier: AgeTier
  ageNumber?: number
  balanceWon: number | null
  errorMessage: string | null
  onFeed: () => void
  onLater: () => void
}) {
  // 지시서(걷는 중 전신 그림): 평소엔 걷는 포즈, "밥 먹이기" 연출
  // 중에는 식사 포즈로 바꿔 보여준다 — 둘 다 에셋 로드 실패 시
  // GameStage.tsx와 같은 훅으로 조용히 평상시 전신 그림으로 되돌린다.
  const { src: walkingSrc, onError: handleWalkingPortraitError } = useImageFallback(
    walkingPortraitSrc(companionType, ageTier, ageNumber),
    fullBodyPortraitSrc(companionType, ageTier, ageNumber),
  )
  const { src: eatingSrc, onError: handleEatingPortraitError } = useImageFallback(
    eatingPortraitSrc(companionType, ageTier, ageNumber),
    fullBodyPortraitSrc(companionType, ageTier, ageNumber),
  )

  const [feeding, setFeeding] = useState(false)
  const feedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (feedTimeoutRef.current) clearTimeout(feedTimeoutRef.current)
    }
  }, [])

  const handleFeedClick = () => {
    if (feeding) return
    // 잔액이 모자라면 연출 없이 바로 onFeed를 불러 안내만 보여준다 —
    // handleFeedCharacter가 이 경우 모달을 닫지 않고 errorMessage만
    // 채우도록 이미 되어 있다(기존 로직 그대로 재사용).
    if (balanceWon !== null && balanceWon < MEAL_COST_WON) {
      onFeed()
      return
    }
    setFeeding(true)
    feedTimeoutRef.current = setTimeout(onFeed, FEED_ANIMATION_MS)
  }

  const portraitSrc = feeding ? eatingSrc : walkingSrc
  const handlePortraitError = feeding ? handleEatingPortraitError : handleWalkingPortraitError

  return (
    <div
      data-testid="hungry-event-modal"
      role="dialog"
      aria-label="배고픔 이벤트"
      className="absolute inset-0 z-30 overflow-hidden rounded-2xl"
    >
      {/* 동네 배경 — 패럴랙스(평상시) / 확대(밥 먹이기 연출 중) */}
      <div
        aria-hidden
        className={`absolute inset-0 overflow-hidden ${
          feeding
            ? 'motion-safe:animate-[grow-hungry-feed-zoom_0.9s_ease-out_forwards]'
            : 'motion-safe:animate-[grow-hungry-bg-parallax_5s_ease-in-out_infinite]'
        }`}
      >
        {TOWN_BG_IMAGE_SRC ? (
          <img src={TOWN_BG_IMAGE_SRC} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            <div className="grow-hungry-town-bg absolute inset-0" />
            <div className="grow-hungry-town-skyline absolute inset-x-0 bottom-[30%] h-[14%] opacity-70" />
          </>
        )}
      </div>
      {/* 어두운 오버레이 — 캐릭터·문구 가독성 확보 */}
      <div aria-hidden className="absolute inset-0 bg-black/45" />

      <button
        type="button"
        onClick={onLater}
        disabled={feeding}
        aria-label="나중에 먹기"
        className="absolute right-3 top-3 z-20 text-lg font-bold text-white/80 hover:text-white disabled:opacity-40"
      >
        ✕
      </button>

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-between gap-3 p-4">
        <p className="text-center text-sm font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] sm:text-base">
          앗! {companionName}님이 배고파해요. 밥 먹으러 갑니다!
        </p>

        <div className="relative flex flex-1 items-end justify-center pb-2">
          <div
            className={!feeding ? 'motion-safe:animate-[grow-hungry-walk-bounce_0.6s_ease-in-out_infinite]' : undefined}
          >
            <img
              src={portraitSrc}
              onError={handlePortraitError}
              alt=""
              className="h-28 w-28 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)]"
            />
          </div>
          {feeding && (
            <span
              aria-hidden
              data-testid="hungry-event-food-icon"
              className="motion-safe:animate-[grow-hungry-food-pop_0.9s_ease-out_forwards] absolute top-0 text-4xl"
            >
              🍚
            </span>
          )}
        </div>

        <div className="flex w-full max-w-xs flex-col gap-2">
          {errorMessage && (
            <p
              data-testid="hungry-event-error"
              className="rounded-lg bg-black/55 px-3 py-1.5 text-center text-xs font-semibold text-red-200"
            >
              {errorMessage}
            </p>
          )}
          <button
            type="button"
            data-testid="hungry-event-feed-button"
            onClick={handleFeedClick}
            disabled={feeding}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_rgba(146,64,14,0.4)] hover:from-amber-600 hover:to-yellow-600 disabled:opacity-70"
          >
            밥 먹이기 {balanceWon !== null && `(-10,000원)`}
          </button>
          <button
            type="button"
            data-testid="hungry-event-later-button"
            onClick={onLater}
            disabled={feeding}
            className="rounded-xl bg-white/20 px-4 py-2 text-xs font-bold text-white hover:bg-white/30 disabled:opacity-40"
          >
            나중에 먹기
          </button>
        </div>
      </div>
    </div>
  )
}
