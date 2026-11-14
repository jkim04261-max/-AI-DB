import { useCallback, useState } from 'react'

// 지시서(한도 소진 시 구매 유도 UI + 향후 구독 확장 설계): 지금은 "일반/
// 프로/프리미엄" 유료 구독이 전혀 존재하지 않는다 — 이 훅은 나중에 실제
// 구독을 붙일 자리를 미리 만들어 두는 상태 추상화일 뿐이다(사용자
// 승인: "UI만 먼저" — 서버 하루 한도까지 실제로 늘리는 건 DB 구조에
// 큰 영향을 주는 별도 범위라 CLAUDE.md 8번 규칙에 따라 다음 PR에서
// 따로 설계·승인받는다). 실제 구독 서버 상태로 바꿀 때는 이 훅의 반환
// 모양을 그대로 두고 내부만 GrowthContext 스타일 fetch 훅으로 교체하면
// 되도록 설계했다 — useMockWallet.ts와 같은 설계 의도.
export type UserTier = 'basic' | 'pro' | 'premium'

export interface AccountTierState {
  // 지금은 실제 구독이 없어 항상 'basic'이다 — 나중에 결제가 붙으면
  // 서버가 내려주는 실제 등급으로 바뀐다.
  userTier: UserTier
  // 프리미엄 전용 "무제한" 플래그 — 지금은 항상 false. UI에서 한도
  // 소진 여부를 판단할 때는 숫자(count)보다 이 값을 먼저 확인해야
  // 한다(프리미엄은 숫자가 0이어도 소진된 게 아니다).
  isUnlimitedRecommend: boolean
  isUnlimitedValidation: boolean
  // 만능마켓에서 구매한 충전권 개수 — 체험판 표시값이다. 실제 서버의
  // 하루 한도(daily_teach_usage/daily_study_usage)는 이 값과 무관하게
  // 그대로 동작하므로, 오늘 남은 실제 사용 가능 횟수에는 아직 반영되지
  // 않는다("완료 후 검증" 참고 — 다음 PR에서 서버 한도 검사 로직을
  // 함께 바꿔 실제로 연결한다).
  aiRecommendBonus: number
  dailyValidationBonus: number
  addRecommendBonus: (amount: number) => void
  addValidationBonus: (amount: number) => void
}

export function useAccountTier(): AccountTierState {
  // 실제 구독 결제가 없으므로 지금은 고정값이다 — 나중에 서버 구독
  // 상태를 조회하는 fetch로 교체할 자리.
  const userTier: UserTier = 'basic'
  const isUnlimitedRecommend = false
  const isUnlimitedValidation = false

  const [aiRecommendBonus, setAiRecommendBonus] = useState(0)
  const [dailyValidationBonus, setDailyValidationBonus] = useState(0)

  const addRecommendBonus = useCallback((amount: number) => {
    setAiRecommendBonus((prev) => prev + amount)
  }, [])
  const addValidationBonus = useCallback((amount: number) => {
    setDailyValidationBonus((prev) => prev + amount)
  }, [])

  return {
    userTier,
    isUnlimitedRecommend,
    isUnlimitedValidation,
    aiRecommendBonus,
    dailyValidationBonus,
    addRecommendBonus,
    addValidationBonus,
  }
}
