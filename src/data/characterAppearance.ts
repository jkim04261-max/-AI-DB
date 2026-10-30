// PR #47 체크포인트 1: 레벨에 따라 캐릭터 외형이 달라 보일 수 있는 분기
// "구조"만 먼저 만든다 — 실제 전문가용 일러스트/의상 에셋은 이후 별도
// 작업이고, 지금은 CharacterSprite가 받는 tier 값에 따라 색/장식 요소를
// 조금 바꾸는 최소 구현만 넣는다. 레벨은 이미 서버가 내려주는 값이라
// DB 변경이 전혀 없다 — characters.stage(어린이/성인, 무료회원 시작값
// 용도)와는 별개의, 순수 프런트엔드 전용 파생값이다.
export type AppearanceTier = 'rookie' | 'student' | 'expert'

export const APPEARANCE_TIER_LABEL: Record<AppearanceTier, string> = {
  rookie: '초보',
  student: '학생',
  expert: '전문가',
}

export function appearanceTierForLevel(level: number): AppearanceTier {
  if (level >= 6) return 'expert'
  if (level >= 3) return 'student'
  return 'rookie'
}
