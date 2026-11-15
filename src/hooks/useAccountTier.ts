// 지시서(한도 소진 시 구매 유도 UI + 향후 구독 확장 설계): 지금은 "일반/
// 프로/프리미엄" 유료 구독이 전혀 존재하지 않는다 — 이 훅은 나중에 실제
// 구독을 붙일 자리를 미리 만들어 두는 상태 추상화일 뿐이다. 실제 구독
// 서버 상태로 바꿀 때는 이 훅의 반환 모양을 그대로 두고 내부만
// GrowthContext 스타일 fetch 훅으로 교체하면 되도록 설계했다 —
// useMockWallet.ts와 같은 설계 의도.
//
// 지시서(만능마켓 구매 즉시 이용권 실시간 연동): "AI 추천 충전권"/
// "지식 검증 충전권"을 구매했을 때 체험판 표시값만 올려주던
// aiRecommendBonus/dailyValidationBonus는 여기서 제거됐다 — 실제로
// 하루 무료 한도를 늘려주는 진짜 기능으로 바뀌어 GrowthContext.tsx의
// tickets(계정 단위, DB 영속)로 옮겨갔다. 구독 등급(userTier/
// isUnlimited...)은 이 이용권과 무관한 별개의 설계라 그대로 둔다.
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
}

export function useAccountTier(): AccountTierState {
  // 실제 구독 결제가 없으므로 지금은 고정값이다 — 나중에 서버 구독
  // 상태를 조회하는 fetch로 교체할 자리.
  const userTier: UserTier = 'basic'
  const isUnlimitedRecommend = false
  const isUnlimitedValidation = false

  return {
    userTier,
    isUnlimitedRecommend,
    isUnlimitedValidation,
  }
}
