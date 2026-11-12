import { Star } from 'lucide-react'
import type { CompanionType } from '../../context/GrowthContext'
import type { AgeTier } from '../../data/characterAge'
import { walkingPortraitSrc } from '../../data/characterWalking'

// 지시서(8~9살 기초지식 3문제 완료 후 서점 외출 미션): 가르치기 완료
// 보상 중 하나로 "서점에 다녀오는" 짧은 외출 이벤트를 보여주는 전용
// 오버레이. GameStage 위에 TurnTransition과 같은 자리(absolute inset-0
// z-30)에 뜬다.
//
// 중요 — 실제 네이버 스마트플레이스 API 연동이나 실제 리뷰 게시는
// 하지 않는다: 이 세션에는 네이버 API 키가 없고, 실제 존재하는 특정
// 서점 체인(예: 교보문고)의 상호를 그대로 쓰면서 "진짜 리뷰를
// 남긴다"처럼 보이면 실제로 존재하지 않는 제휴·실제 리뷰 작성처럼
// 오인될 위험이 있다(CLAUDE.md 9번 지식재산권 지침과도 맞닿아 있음).
// 그래서 지도 앱 "장소 정보 카드"를 흉내 낸, 이 게임 전용의 가상
// 서점(아래 이름)으로 구현했다 — 가는 길/도착/오는 길이라는 요청하신
// 흐름과 "리뷰 남기기 → 교구 획득" 보상 구조는 그대로 반영했다.
export type BookstoreOutingStage = 'walking-there' | 'arrived' | 'walking-back'

const COMPANION_LABEL: Record<CompanionType, string> = { nuri: '누리', duri: '두리' }

export default function BookstoreOutingOverlay({
  stage,
  companionType,
  storeName,
  onLeaveReview,
  ageTier,
  ageNumber,
}: {
  stage: BookstoreOutingStage
  companionType: CompanionType
  storeName: string
  onLeaveReview: () => void
  ageTier?: AgeTier
  ageNumber?: number
}) {
  const name = COMPANION_LABEL[companionType]

  if (stage === 'arrived') {
    return (
      <div
        data-testid="bookstore-outing-overlay"
        className="motion-safe:animate-[grow-bubble-pop_0.2s_ease-out] absolute inset-0 z-30 flex items-center justify-center rounded-2xl bg-amber-950/80 p-4"
      >
        <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-center shadow-xl">
          <span className="text-3xl" aria-hidden>
            📚
          </span>
          <p className="text-sm font-bold text-amber-900">{storeName}</p>
          <p className="text-xs text-amber-700/80">{name}가 도착했어요! 둘러보고 느낀 점을 별점으로 남겨주세요.</p>
          <div className="flex gap-0.5 text-amber-400" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} size={18} fill="currentColor" />
            ))}
          </div>
          <button
            type="button"
            data-testid="bookstore-leave-review-button"
            onClick={onLeaveReview}
            className="w-full rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 px-4 py-2 text-sm font-bold text-white shadow-[0_2px_0_rgba(146,64,14,0.4)] hover:from-amber-600 hover:to-yellow-600"
          >
            ⭐ 리뷰 남기고 교구 받기
          </button>
        </div>
      </div>
    )
  }

  const walkingLabel = stage === 'walking-there' ? `${storeName}으로 걸어가는 중...` : '집으로 돌아가는 중...'

  return (
    <div
      data-testid="bookstore-outing-overlay"
      className="motion-safe:animate-[grow-bubble-pop_0.2s_ease-out] absolute inset-0 z-30 overflow-hidden rounded-2xl bg-gradient-to-b from-sky-200 to-amber-100"
    >
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-10 bg-amber-300/70" />
      <div
        data-testid="bookstore-walk-sprite"
        className="grow-walk-sprite motion-safe:animate-[grow-walk-across_5.5s_linear_infinite] absolute bottom-6 left-0"
        style={stage === 'walking-back' ? { transform: 'scaleX(-1)' } : undefined}
      >
        <img
          src={walkingPortraitSrc(companionType, ageTier ?? 'junior_20s', ageNumber)}
          alt=""
          aria-hidden
          className="h-24 w-auto object-contain"
          style={{ filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.35))' }}
        />
      </div>
      <p className="absolute inset-x-0 top-4 text-center text-sm font-bold text-amber-900">{walkingLabel}</p>
    </div>
  )
}
