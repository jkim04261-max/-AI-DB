import { useEffect, useRef, useState } from 'react'
import type { CompanionType } from '../../context/GrowthContext'
import type { AgeTier } from '../../data/characterAge'
import { eatingPortraitSrc } from '../../data/characterEating'
import { fullBodyPortraitSrc } from '../../data/characterFullBody'
import { walkingPortraitSrc } from '../../data/characterWalking'
import { useImageFallback } from '../../hooks/useImageFallback'
import { TOWN_SQUARE_BG_SRC, RESTAURANT_INTERIOR_SRC } from '../../data/lifeEventAssets'

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
// 지시서(이벤트별(밥 먹기/심부름/알바) 2.5D 배경 이미지 매핑 및 입장
// 연출 구현): 사용자가 이번에 실제 배경 이미지 파일을 제공해, 이전
// placeholder(CSS 그라디언트 동네 배경)를 실제 이미지로 교체했다.
//
// 지시서(밥 먹기 이벤트 연출 수정: 동네 걷기 → 식당 입장 → 식사
// 연출(3~4초) → 자동 종료): 그 위에, "밥 먹이기"를 누르면 분수대 앞
// (동네 전경 기준 화면 왼쪽)에서 식당 건물(화면 오른쪽) 쪽으로 실제
// 가로 이동(걷기, 2.5초)하고, 도착하면 배경이 식당 내부로 전환되며
// "냠냠! 잘 먹었습니다!" 문구가 3.5초간 보인 뒤 모달이 자동으로
// 닫히도록 했다 — choosing(고르는 중) → walking(걷는 중) →
// eating(식사 중) 3단계 상태 머신. 이번에도 "앉아서 밥 먹는" 전용
// 이미지가 따로 오지 않아, 이미 있는 식당 내부 배경(RESTAURANT_INTERIOR_SRC)
// + 식사 포즈 전신 그림(eatingSrc)을 그대로 조합해 식사 장면을
// 구성한다.
const MEAL_COST_WON = 10_000
// 분수대 → 식당 가로 이동 시간(지시서: "약 2~3초").
const WALK_DURATION_MS = 2500
// 식당 도착 후 "냠냠! 잘 먹었습니다!" 문구를 보여주는 시간(지시서:
// "3~4초") — 이 시간이 지나야 onFeed(부모의 handleFeedCharacter)를
// 불러 모달을 닫는다.
const EAT_DURATION_MS = 3500
// 분수대 앞(시작)과 식당 건물 앞(도착)의 화면 가로 위치 — 동네 전경
// 이미지(TOWN_SQUARE_BG_SRC)에서 분수대는 중앙보다 약간 왼쪽, 식당은
// 오른쪽 가장자리 근처에 있다.
const WALK_START_LEFT_PERCENT = 42
const WALK_END_LEFT_PERCENT = 80

type HungryEventPhase = 'choosing' | 'walking' | 'eating'

export default function HungryEventModal({
  companionType,
  companionName,
  ageTier,
  ageNumber,
  balanceWon,
  errorMessage,
  onFeed,
  onLater,
  onChallenge,
  challengeDisabled,
}: {
  companionType: CompanionType
  companionName: string
  ageTier: AgeTier
  ageNumber?: number
  balanceWon: number | null
  errorMessage: string | null
  onFeed: () => void
  onLater: () => void
  onChallenge: () => void
  challengeDisabled: boolean
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

  const [phase, setPhase] = useState<HungryEventPhase>('choosing')
  const phaseTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    return () => {
      phaseTimeoutsRef.current.forEach(clearTimeout)
    }
  }, [])

  const handleFeedClick = () => {
    if (phase !== 'choosing') return
    // 잔액이 모자라면 연출 없이 바로 onFeed를 불러 안내만 보여준다 —
    // handleFeedCharacter가 이 경우 모달을 닫지 않고 errorMessage만
    // 채우도록 이미 되어 있다(기존 로직 그대로 재사용).
    if (balanceWon !== null && balanceWon < MEAL_COST_WON) {
      onFeed()
      return
    }
    setPhase('walking')
    phaseTimeoutsRef.current.push(
      setTimeout(() => setPhase('eating'), WALK_DURATION_MS),
      setTimeout(onFeed, WALK_DURATION_MS + EAT_DURATION_MS),
    )
  }

  const feeding = phase !== 'choosing'
  const eating = phase === 'eating'
  const portraitSrc = eating ? eatingSrc : walkingSrc
  const handlePortraitError = eating ? handleEatingPortraitError : handleWalkingPortraitError

  return (
    <div
      data-testid="hungry-event-modal"
      role="dialog"
      aria-label="배고픔 이벤트"
      className="absolute inset-0 z-30 overflow-hidden rounded-2xl"
    >
      {/* 동네 배경(choosing/walking 단계) — 식당에 도착하면(eating)
          식당 내부 이미지가 페이드인되어 "식당에 들어감"을 보여준다. */}
      <div
        aria-hidden
        className={`absolute inset-0 overflow-hidden ${
          eating
            ? 'motion-safe:animate-[grow-hungry-feed-zoom_0.9s_ease-out_forwards]'
            : 'motion-safe:animate-[grow-hungry-bg-parallax_5s_ease-in-out_infinite]'
        }`}
      >
        {/* 배경 2장은 <img>가 아니라 CSS background-image로 깐다 — 이
            모달 안의 유일한 <img>를 캐릭터 전신 그림으로 유지해야,
            "hungry-event-modal 안의 img" 하나만 찾는 기존 e2e
            테스트(초상화 교체·폴백 확인)가 그대로 통한다. */}
        <div
          aria-hidden
          data-testid="hungry-event-town-bg"
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${TOWN_SQUARE_BG_SRC})` }}
        />
        <div
          aria-hidden
          data-testid="hungry-event-restaurant-bg"
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${
            eating ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ backgroundImage: `url(${RESTAURANT_INTERIOR_SRC})` }}
        />
      </div>
      {/* 어두운 오버레이 — 캐릭터·문구 가독성 확보 */}
      <div aria-hidden className="absolute inset-0 bg-black/45" />

      <button
        type="button"
        onClick={onLater}
        disabled={feeding}
        data-testid="hungry-event-later-button"
        aria-label="나중에 먹기"
        className="absolute right-3 top-3 z-20 text-lg font-bold text-white/80 hover:text-white disabled:opacity-40"
      >
        ✕
      </button>

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-between gap-3 p-4">
        <p className="text-center text-sm font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] sm:text-base">
          {eating ? '냠냠! 잘 먹었습니다!' : `앗! ${companionName}님이 배고파해요. 밥 먹으러 갑니다!`}
        </p>

        <div className="relative flex w-full flex-1 items-end pb-2">
          {/* 걷기 연출(지시서: "분수대 → 식당 2.5D 이동"): choosing/
              walking 단계에선 캐릭터를 분수대 앞(왼쪽)에서 식당 앞
              (오른쪽)까지 절대 위치(left)를 transition으로 2.5초간
              이동시킨다. eating 단계에서는 더 이상 거리 위의 캐릭터가
              아니므로 가운데로 되돌려 식사 장면으로 보여준다.
              버그 수정(캐릭터가 안 보이던 문제): 이 div가 absolute로
              빠지면서 부모(위 .relative 래퍼)가 items-center 때문에
              내용 없이 너비 0으로 쪼그라들어, left:42%가 "0의 42%" =
              0px가 되어 캐릭터가 화면 밖(진짜 너비 0인 상자 안)에
              숨어버렸다 — 부모에 w-full을 추가해 고쳤다. 캐릭터가
              배경보다 항상 위에 보이도록 z-index도 명시한다. */}
          <div
            className="absolute z-10 bottom-2 transition-[left] ease-in-out"
            style={{
              left: eating ? '50%' : phase === 'walking' ? `${WALK_END_LEFT_PERCENT}%` : `${WALK_START_LEFT_PERCENT}%`,
              transitionDuration: eating ? '0ms' : `${WALK_DURATION_MS}ms`,
              transform: 'translateX(-50%)',
            }}
          >
            <div
              className={
                !eating ? 'motion-safe:animate-[grow-hungry-walk-bounce_0.6s_ease-in-out_infinite]' : undefined
              }
            >
              <img
                src={portraitSrc}
                onError={handlePortraitError}
                alt=""
                className="h-44 w-44 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)] sm:h-56 sm:w-56"
              />
            </div>
            {eating && (
              <span
                aria-hidden
                data-testid="hungry-event-food-icon"
                className="motion-safe:animate-[grow-hungry-food-pop_0.9s_ease-out_forwards] absolute -top-2 left-1/2 -translate-x-1/2 text-4xl"
              >
                🍚
              </span>
            )}
          </div>
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
            data-testid="hungry-event-quiz-button"
            onClick={onChallenge}
            disabled={feeding || challengeDisabled}
            className="rounded-xl bg-white/25 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/35 disabled:opacity-40"
          >
            직업 퀴즈 도전하기
          </button>
          {challengeDisabled && (
            <p data-testid="hungry-event-quiz-disabled-note" className="text-center text-[11px] font-semibold text-amber-200">
              가상 용돈이 20,000원 이상일 때 도전할 수 있어요.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
