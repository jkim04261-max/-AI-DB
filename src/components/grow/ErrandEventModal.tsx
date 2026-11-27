import { useEffect, useRef, useState } from 'react'
import type { CompanionType } from '../../context/GrowthContext'
import type { AgeTier } from '../../data/characterAge'
import { fullBodyPortraitSrc } from '../../data/characterFullBody'
import { walkingPortraitSrc } from '../../data/characterWalking'
import { useImageFallback } from '../../hooks/useImageFallback'
import { TOWN_SQUARE_BG_SRC, STORE_INTERIOR_SRC } from '../../data/lifeEventAssets'

// 지시서(8세 전용 경제 활동 기획: 엄마/아빠 심부름 이벤트): 기존
// HungryEventModal(배고픔 이벤트)과 똑같은 자리(GameStage 위,
// absolute inset-0 z-30)에 뜨는 선택형 모달 — "심부름 하러 가기"를
// 고르면 가상 용돈을 벌고, "거절하기"를 고르면 부모(GrowPage)가
// HomeworkQuizModal을 대신 띄운다.
// 지시서(이벤트별(밥 먹기/심부름/알바) 2.5D 배경 이미지 매핑 및 입장
// 연출 구현): 이전엔 실제 이미지가 없어 HungryEventModal과 같은 CSS
// 동네 배경을 썼지만, 이제 실제 동네 전경/가게 내부 이미지로
// 교체한다 — "심부름 하러 가기"를 누르면(= 가게로 걸어 들어가면)
// 기존 확대(zoom) 애니메이션 위로 가게 내부 이미지가 페이드인된다.
const ERRAND_EARNING_WON = 10_000
// "심부름 하러 가기" 클릭 후 장보러 가는 연출을 보여주는 시간 —
// HungryEventModal의 FEED_ANIMATION_MS와 같은 원칙(연출이 끝나야
// 실제 onAccept를 불러 모달을 닫는다).
//
// 간헐 실패 수정: 가게 내부 배경은 0.7초(duration-700) 동안 페이드인되는데,
// 예전엔 0.9초 만에 모달을 닫아 페이드가 끝난 뒤 보이는 시간이 0.2초뿐이었다
// — 느린 환경에선 "배경이 가게 내부로 바뀐 상태"를 사용자도, E2E도 놓칠 수
// 있었다. 페이드(0.7초) 뒤에 가게 내부를 약 0.9초 더 보여주도록 늘렸다.
const ERRAND_ANIMATION_MS = 1600

export default function ErrandEventModal({
  companionType,
  ageTier,
  ageNumber,
  onAccept,
  onDecline,
  onChallenge,
  challengeDisabled,
}: {
  companionType: CompanionType
  ageTier: AgeTier
  ageNumber?: number
  onAccept: () => void
  onDecline: () => void
  onChallenge: () => void
  challengeDisabled: boolean
}) {
  const { src: walkingSrc, onError: handleWalkingPortraitError } = useImageFallback(
    walkingPortraitSrc(companionType, ageTier, ageNumber),
    fullBodyPortraitSrc(companionType, ageTier, ageNumber),
  )

  const [departing, setDeparting] = useState(false)
  const departTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (departTimeoutRef.current) clearTimeout(departTimeoutRef.current)
    }
  }, [])

  const handleAcceptClick = () => {
    if (departing) return
    setDeparting(true)
    departTimeoutRef.current = setTimeout(onAccept, ERRAND_ANIMATION_MS)
  }

  return (
    <div
      data-testid="errand-event-modal"
      role="dialog"
      aria-label="심부름 이벤트"
      className="absolute inset-0 z-30 overflow-hidden rounded-2xl"
    >
      {/* 동네 전경(평상시) — 심부름을 수락하면(departing) 확대
          애니메이션 위로 가게 내부 이미지가 페이드인된다. */}
      <div
        aria-hidden
        className={`absolute inset-0 overflow-hidden ${
          departing
            ? 'motion-safe:animate-[grow-hungry-feed-zoom_0.9s_ease-out_forwards]'
            : 'motion-safe:animate-[grow-hungry-bg-parallax_5s_ease-in-out_infinite]'
        }`}
      >
        {/* 배경 2장은 <img>가 아니라 CSS background-image로 깐다 —
            HungryEventModal과 같은 이유(이 모달 안의 유일한 <img>를
            캐릭터 전신 그림으로 유지). */}
        <div
          aria-hidden
          data-testid="errand-event-town-bg"
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${TOWN_SQUARE_BG_SRC})` }}
        />
        <div
          aria-hidden
          data-testid="errand-event-store-bg"
          className={`absolute inset-0 bg-cover bg-center transition-opacity duration-700 ${
            departing ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ backgroundImage: `url(${STORE_INTERIOR_SRC})` }}
        />
      </div>
      <div aria-hidden className="absolute inset-0 bg-black/45" />

      <button
        type="button"
        onClick={onDecline}
        disabled={departing}
        data-testid="errand-event-decline-button"
        aria-label="거절하기"
        className="absolute right-3 top-3 z-20 text-lg font-bold text-white/80 hover:text-white disabled:opacity-40"
      >
        ✕
      </button>

      <div className="absolute inset-0 z-10 flex flex-col items-center justify-between gap-3 p-4">
        <p className="text-center text-sm font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] sm:text-base">
          엄마가 심부름을 부탁하셨어요! 두부를 사오면 용돈 {ERRAND_EARNING_WON.toLocaleString('ko-KR')}원을 줄게요.
        </p>

        <div className="relative flex flex-1 items-end justify-center pb-2">
          <div
            className={!departing ? 'motion-safe:animate-[grow-hungry-walk-bounce_0.6s_ease-in-out_infinite]' : undefined}
          >
            <img
              src={walkingSrc}
              onError={handleWalkingPortraitError}
              alt=""
              className="h-44 w-44 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)] sm:h-56 sm:w-56"
            />
          </div>
          {departing && (
            <span
              aria-hidden
              data-testid="errand-event-cart-icon"
              className="motion-safe:animate-[grow-hungry-food-pop_0.9s_ease-out_forwards] absolute top-0 text-4xl"
            >
              🛒
            </span>
          )}
        </div>

        <div className="flex w-full max-w-xs flex-col gap-2">
          <button
            type="button"
            data-testid="errand-event-accept-button"
            onClick={handleAcceptClick}
            disabled={departing}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_rgba(146,64,14,0.4)] hover:from-amber-600 hover:to-yellow-600 disabled:opacity-70"
          >
            심부름하기 (+{ERRAND_EARNING_WON.toLocaleString('ko-KR')}원)
          </button>
          <button
            type="button"
            data-testid="errand-event-quiz-button"
            onClick={onChallenge}
            disabled={departing || challengeDisabled}
            className="rounded-xl bg-white/25 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/35 disabled:opacity-40"
          >
            직업 퀴즈 도전하기
          </button>
          {challengeDisabled && (
            <p data-testid="errand-event-quiz-disabled-note" className="text-center text-[11px] font-semibold text-amber-200">
              가상 용돈이 20,000원 이상일 때 도전할 수 있어요.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
