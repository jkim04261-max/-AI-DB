import { useEffect, useRef, useState } from 'react'
import type { CompanionType } from '../../context/GrowthContext'
import type { AgeTier } from '../../data/characterAge'
import { fullBodyPortraitSrc } from '../../data/characterFullBody'
import { walkingPortraitSrc } from '../../data/characterWalking'
import { useImageFallback } from '../../hooks/useImageFallback'

// 지시서(8세 전용 경제 활동 기획: 엄마/아빠 심부름 이벤트): 기존
// HungryEventModal(배고픔 이벤트)과 똑같은 자리(GameStage 위,
// absolute inset-0 z-30)에 뜨는 선택형 모달 — "심부름 하러 가기"를
// 고르면 가상 용돈을 벌고, "거절하기"를 고르면 부모(GrowPage)가
// HomeworkQuizModal을 대신 띄운다. 실제 마을/가게 배경 이미지는
// HungryEventModal과 같은 이유로 이 세션에서 파일로 받을 수 없어
// (채팅에 붙여넣은 이미지는 다운로드할 방법이 없음), 그 모달이 이미
// 쓰고 있는 CSS 동네 배경(grow-hungry-town-bg 등)을 그대로 재사용한다
// — 둘 다 "동네 마실"이라는 같은 장면이라 자연스럽다.
const ERRAND_EARNING_WON = 10_000
// "심부름 하러 가기" 클릭 후 장보러 가는 연출을 보여주는 시간 —
// HungryEventModal의 FEED_ANIMATION_MS와 같은 원칙(연출이 끝나야
// 실제 onAccept를 불러 모달을 닫는다).
const ERRAND_ANIMATION_MS = 900

export default function ErrandEventModal({
  companionType,
  ageTier,
  ageNumber,
  onAccept,
  onDecline,
}: {
  companionType: CompanionType
  ageTier: AgeTier
  ageNumber?: number
  onAccept: () => void
  onDecline: () => void
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
      {/* HungryEventModal과 같은 CSS 동네 배경 — 패럴랙스(평상시) /
          확대(심부름 떠나는 연출 중). */}
      <div
        aria-hidden
        className={`absolute inset-0 overflow-hidden ${
          departing
            ? 'motion-safe:animate-[grow-hungry-feed-zoom_0.9s_ease-out_forwards]'
            : 'motion-safe:animate-[grow-hungry-bg-parallax_5s_ease-in-out_infinite]'
        }`}
      >
        <div className="grow-hungry-town-bg absolute inset-0" />
        <div className="grow-hungry-town-skyline absolute inset-x-0 bottom-[30%] h-[14%] opacity-70" />
      </div>
      <div aria-hidden className="absolute inset-0 bg-black/45" />

      <button
        type="button"
        onClick={onDecline}
        disabled={departing}
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
              className="h-28 w-28 object-contain drop-shadow-[0_6px_10px_rgba(0,0,0,0.4)]"
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
            심부름 하러 가기 (+{ERRAND_EARNING_WON.toLocaleString('ko-KR')}원)
          </button>
          <button
            type="button"
            data-testid="errand-event-decline-button"
            onClick={onDecline}
            disabled={departing}
            className="rounded-xl bg-white/20 px-4 py-2 text-xs font-bold text-white hover:bg-white/30 disabled:opacity-40"
          >
            거절하기
          </button>
        </div>
      </div>
    </div>
  )
}
