import type { CompanionType } from '../context/GrowthContext'

import nuriFull from '../assets/grow/full-body/nuri-full.webp'
import duriFull from '../assets/grow/full-body/duri-full.webp'

// PR #56: 사용자가 직접 제공한 누리(빨간 한복)·두리(파란 한복) 전신
// 일러스트 — 흰 배경을 제거해 투명 PNG를 webp로 저장한 결과물이다.
// PR #52 후속 3차의 연령대별 흉상 컷(AGE_PORTRAIT_SRC, 220x220 정사각
// 6장×2인)과 달리, 연령대별로 별도 그림을 받지 못했으므로 캐릭터당
// 전신 일러스트 "한 장"만 있다 — 연령대 구분은 (이전부터 쓰던) 스케일
// 변환(AGE_TIER_SCALE in GameStage.tsx)과 나이 배지로만 표현한다.
// 새 연령대별 전신 원화를 받으면 이 표를 Record<CompanionType,
// Record<AgeTier, string>>로 다시 확장하면 된다.
export const FULL_BODY_PORTRAIT_SRC: Record<CompanionType, string> = {
  nuri: nuriFull,
  duri: duriFull,
}
