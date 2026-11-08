import { useCallback, useState } from 'react'

// Stage 1(오프닝 프로필): 캐릭터 생성 시 지급되는 "초기 가상 용돈"의 체험판
// 전용 상태 — useMockInventory.ts(PR #50)와 완전히 같은 원칙이다.
//
// 중요 — 이건 체험판이다: 실제 DB에 전혀 저장되지 않고, 새로고침하면
// 지급 전 상태(null)로 되돌아간다. Preview/Production DB 분리가 아직
// 검증되지 않은 상태라, 이번 Stage 1에서는 새 DB 쓰기 트랜잭션을 하나도
// 추가하지 않기로 했다(캐릭터 생성·직업 저장은 PR #65까지 이미 있는
// 기존 API를 그대로 재사용 — 그건 새로운 쓰기 위험이 아니다).
//
// 나중에 실제 서버 지급으로 바꿀 때는 이 훅의 반환 모양(state + action
// 함수)을 그대로 두고 내부 구현만 GrowthContext 스타일의 fetch 기반
// 훅으로 바꾸면 되도록 설계했다 — useMockInventory.ts와 동일한 설계
// 의도.
export const INITIAL_ALLOWANCE_WON = 1_000_000

export function useMockWallet() {
  // null = 아직 캐릭터를 만들지 않았거나 초기 지급을 받기 전.
  const [balanceWon, setBalanceWon] = useState<number | null>(null)

  // 같은 세션 안에서 여러 번 불러도 딱 한 번만 지급한다(이미 지급받은
  // 뒤라면 그대로 둔다) — 서버의 "최초 1회 지급" 원자적 보장을 체험판
  // 수준에서 흉내낸 것일 뿐, 실제 중복 지급 방지는 Stage 2(실제 DB
  // 전환)에서 서버가 보장해야 한다.
  const grantInitialAllowance = useCallback(() => {
    setBalanceWon((prev) => prev ?? INITIAL_ALLOWANCE_WON)
  }, [])

  const resetWallet = useCallback(() => {
    setBalanceWon(null)
  }, [])

  return { balanceWon, grantInitialAllowance, resetWallet }
}

export type MockWallet = ReturnType<typeof useMockWallet>
