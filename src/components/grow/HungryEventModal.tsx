import type { CompanionType } from '../../context/GrowthContext'
import type { AgeTier } from '../../data/characterAge'
import { eatingPortraitSrc } from '../../data/characterEating'
import { fullBodyPortraitSrc } from '../../data/characterFullBody'
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
  // 지시서(밥 먹는 캐릭터 에셋 깨짐 방지): 식사 그림 로드에 실패하면
  // 평상시 전신 그림으로 조용히 되돌린다(GameStage.tsx와 같은 훅).
  const { src: portraitSrc, onError: handlePortraitError } = useImageFallback(
    eatingPortraitSrc(companionType, ageTier, ageNumber),
    fullBodyPortraitSrc(companionType, ageTier, ageNumber),
  )

  return (
    <div
      data-testid="hungry-event-modal"
      role="dialog"
      aria-label="배고픔 이벤트"
      className="absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-amber-950/80 p-4"
    >
      <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-center shadow-xl">
        <button
          type="button"
          onClick={onLater}
          aria-label="나중에 먹기"
          className="self-end -mb-2 -mt-1 text-xs font-semibold text-amber-400 hover:text-amber-600"
        >
          ✕
        </button>
        <img
          src={portraitSrc}
          onError={handlePortraitError}
          alt=""
          className="h-28 w-28 object-contain"
        />
        <p className="text-sm font-bold text-amber-900">
          앗! {companionName}님, 저 배고파요. 밥 먹으러 갈까요?
        </p>

        {errorMessage && (
          <p data-testid="hungry-event-error" className="text-xs font-semibold text-red-600">
            {errorMessage}
          </p>
        )}

        <div className="flex w-full flex-col gap-2">
          <button
            type="button"
            data-testid="hungry-event-feed-button"
            onClick={onFeed}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2.5 text-sm font-bold text-white shadow-[0_2px_0_rgba(146,64,14,0.4)] hover:from-amber-600 hover:to-yellow-600"
          >
            밥 먹이기 {balanceWon !== null && `(-10,000원)`}
          </button>
          <button
            type="button"
            data-testid="hungry-event-later-button"
            onClick={onLater}
            className="rounded-xl bg-amber-100 px-4 py-2 text-xs font-bold text-amber-700 hover:bg-amber-200"
          >
            나중에 먹기
          </button>
        </div>
      </div>
    </div>
  )
}
