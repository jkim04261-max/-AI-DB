// PR #52: 캐릭터 6단계 연령대(Age Tier) — src/data/characterAge.ts와 같은
// 개념의 백엔드 쪽 사본이다(이 저장소의 기존 api//src 중복 패턴과 동일,
// characterProfessions.ts/db.ts의 ProfessionId 관계 참고). DB에는 전혀
// 저장하지 않고 character.level에서 그때그때 계산한다 — 두 파일의
// ageTierForLevel 임계값은 반드시 같아야 한다.
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

export function ageTierForLevel(level: number): AgeTier {
  if (level >= 40) return 'master_50s'
  if (level >= 30) return 'veteran_40s'
  if (level >= 20) return 'career_30s'
  if (level >= 10) return 'junior_20s'
  if (level >= 5) return 'teen'
  return 'toddler'
}

function ageTierIndex(tier: AgeTier): number {
  return AGE_TIER_ORDER.indexOf(tier)
}

// 지금 연령대가 특정 연령대"이상"인지 — 지식 난이도 게이팅(가르치기 검증)
// 에 쓴다. 캐릭터의 실제 연령대가 지식이 요구하는 연령대보다 낮으면
// false — 호출부(handleVerifyKnowledge)가 저장 전에 거절한다.
export function meetsAgeTier(current: AgeTier, required: AgeTier): boolean {
  return ageTierIndex(current) >= ageTierIndex(required)
}

export const ageBlockedMessage = (requiredLabel: string): string =>
  `아직은 너무 어려워서 이해하기 힘들어요! ${requiredLabel}가 되면 다시 가르쳐 주세요~`
