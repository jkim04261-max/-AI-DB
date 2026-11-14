import type { MockWallet } from '../hooks/useMockWallet'

// 지시서(결제 서비스 추상화): 나중에 "일반/프로/프리미엄" 구독제를 붙일 때,
// 지금 각 화면이 useMockWallet()의 spend/earn을 직접 호출하던 구조로는
// "프리미엄 구독자는 차감 면제", "프로 구독자는 지급 2배" 같은 규칙을
// 한곳에서 관리할 수 없다 — 이 파일이 그 중앙 창구다.
//
// 지금은 가상용돈(체험판) 1:1 패스스루일 뿐이고, 동작은 전혀 바뀌지
// 않는다(사용자 승인: "추상화 작업 진행" — 순수 리팩터링, 기능 변경 없음).
// 나중에 실제 결제(Stripe/토스)와 구독 등급을 도입할 때는:
//   1. 등급별 배율/면제 표를 이 파일에 추가하고
//   2. charge/reward 안에서 "지금 로그인한 사용자의 구독 등급"을 조회해
//      금액을 조정하거나 차감을 건너뛰면 된다.
// 호출부(GrowPage/CardMatchGame/JobQuiz/UniversalMarket 등)는 이 함수들의
// 시그니처가 그대로라면 전혀 바뀔 필요가 없다.

// 어떤 상황에서 발생한 지급/차감인지 — 지금은 로직에 전혀 쓰이지 않지만
// (모든 reason이 똑같이 동작), 구독 등급 규칙이 "이 종류의 결제만
// 면제/배율 적용" 식으로 달라질 걸 대비해 호출부가 처음부터 넘기게
// 했다. 새 결제 지점이 생기면 이 목록에 추가한다.
export type PaymentReason =
  | 'meal'
  | 'quiz_snack'
  | 'market_purchase'
  | 'quiz_reward'
  | 'part_time_job'
  | 'card_match_reward'
  | 'job_quiz_reward'

// 가상용돈을 차감한다(= 결제). 지갑이 아직 없거나(온보딩 전) 잔액이
// 모자라면 아무것도 바꾸지 않고 false를 돌려준다 — useMockWallet.spend와
// 동일한 계약.
export function charge(wallet: MockWallet, amountWon: number, _reason: PaymentReason): boolean {
  return wallet.spend(amountWon)
}

// 가상용돈을 지급한다(= 보상/수입). 지갑이 아직 없으면 그대로 건너뛴다 —
// useMockWallet.earn과 동일한 계약.
export function reward(wallet: MockWallet, amountWon: number, _reason: PaymentReason): void {
  wallet.earn(amountWon)
}

export interface PurchaseResult {
  ok: boolean
  // ok=false일 때만 채워지는 사용자 안내 문구.
  error?: string
}

// 지시서(결제 서비스 추상화 연동): 마켓에서 아이템을 살 때 거치는 단일
// 진입점 — 지금은 charge()를 그대로 호출하는 가상용돈 결제 1:1
// 패스스루다(사용자 승인: "가상용돈 결제만 작동"). 성공/실패를
// boolean 대신 { ok, error } 모양으로 돌려줘서, 호출부가 매번 똑같은
// 실패 문구를 직접 만들지 않아도 되게 한다.
//
// TODO(실제 결제 연동): 나중에 PG(토스페이먼츠 등) 연동 및 일반/프로/
// 프리미엄 구독을 붙일 때, 여기서 "지금 로그인한 사용자의 구독
// 등급"(useAccountTier.ts)을 조회해 실제 카드 결제 API를 호출하거나,
// 등급별 할인/면제를 적용하도록 분기한다. 호출부(UniversalMarket 등)는
// 이 함수의 시그니처가 그대로라면 전혀 바뀔 필요가 없다.
export function processPurchase(wallet: MockWallet, amountWon: number, reason: PaymentReason): PurchaseResult {
  const ok = charge(wallet, amountWon, reason)
  if (!ok) {
    return { ok: false, error: '가상 용돈이 부족하거나 아직 지급되지 않았어요.' }
  }
  return { ok: true }
}
