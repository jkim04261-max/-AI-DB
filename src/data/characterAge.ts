// PR #52: 캐릭터 6단계 연령대(Age Tier) — 사용자 승인된 설계대로, DB에는
// 전혀 저장하지 않고 이미 존재하는 character.level에서 그때그때 계산하는
// 순수 파생값이다(PR #47의 appearanceTierForLevel과 같은 "DB 변경 없이
// 표시만 분기" 원칙). characters.stage('child'|'adult', 무료회원 시작값
// 용도)와는 완전히 별개의 개념 — stage는 전혀 건드리지 않는다.
//
// 레벨 구간은 기존 characterGrowth.ts의 레벨업 곡선(레벨이 올라갈수록
// 더 많은 XP가 필요)과 맞춰, "꾸준히 하면 몇 주~몇 달 안에 다음 연령대로"
// 정도의 체감이 나오도록 고른 값이다 — 실제 밸런스는 코드 상수라 언제든
// 조정 가능하다.
export type AgeTier = 'toddler' | 'teen' | 'junior_20s' | 'career_30s' | 'veteran_40s' | 'master_50s'

export const AGE_TIER_ORDER: AgeTier[] = ['toddler', 'teen', 'junior_20s', 'career_30s', 'veteran_40s', 'master_50s']

export const AGE_TIER_LABEL: Record<AgeTier, string> = {
  toddler: '2~3살',
  teen: '10대',
  junior_20s: '20대',
  career_30s: '30대',
  veteran_40s: '40대',
  master_50s: '50~60대',
}

// 메뉴/HUD 등에서 "지금 어떤 단계인지" 한 단어로 보여줄 때 쓰는 짧은 이름.
export const AGE_TIER_STAGE_LABEL: Record<AgeTier, string> = {
  toddler: '왕초보 유아',
  teen: '청소년',
  junior_20s: '청년',
  career_30s: '중급 전문가',
  veteran_40s: '베테랑',
  master_50s: '마스터',
}

export function ageTierForLevel(level: number): AgeTier {
  if (level >= 40) return 'master_50s'
  if (level >= 30) return 'veteran_40s'
  if (level >= 20) return 'career_30s'
  if (level >= 10) return 'junior_20s'
  if (level >= 5) return 'teen'
  return 'toddler'
}

export function ageTierIndex(tier: AgeTier): number {
  return AGE_TIER_ORDER.indexOf(tier)
}

// 지금 연령대가 특정 연령대"이상"인지 — 지식 난이도 게이팅에 쓴다.
export function meetsAgeTier(current: AgeTier, required: AgeTier): boolean {
  return ageTierIndex(current) >= ageTierIndex(required)
}

// 2~3살 유아가 직업을 고른 직후 보여줄, 아동스러운 말투의 인사 — PR #52
// 요청 2번의 튜토리얼 대사. 직업 라벨을 그대로 끼워 넣는다.
export function toddlerProfessionGreeting(professionLabel: string): string {
  return `나 ${professionLabel} 되고 싶어요! 저에게 지식, 훈련, 강의를 가르쳐주세요!`
}

// 연령대에 비해 너무 어려운 지식을 가르치려 할 때 보여줄 거절 메시지 —
// 요청 3번의 예시 문구를 그대로 따른다. requiredLabel은 그 지식이 원래
// 필요한 최소 연령대의 라벨이다.
export function ageBlockedMessage(requiredLabel: string): string {
  return `아직은 너무 어려워서 이해하기 힘들어요! ${requiredLabel}가 되면 다시 가르쳐 주세요~`
}
