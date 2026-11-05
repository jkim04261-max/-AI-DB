// PR #52: 캐릭터 6단계 연령대(Age Tier) — src/data/characterAge.ts와 같은
// 개념의 백엔드 쪽 사본이다(이 저장소의 기존 api//src 중복 패턴과 동일,
// characterProfessions.ts/db.ts의 ProfessionId 관계 참고). DB에는 전혀
// 저장하지 않고 character.level에서 그때그때 계산한다 — 두 파일의
// ageTierForLevel 임계값은 반드시 같아야 한다.
export type AgeTier = 'toddler' | 'teen' | 'junior_20s' | 'career_30s' | 'veteran_40s' | 'master_50s'

export const AGE_TIER_ORDER: AgeTier[] = ['toddler', 'teen', 'junior_20s', 'career_30s', 'veteran_40s', 'master_50s']

// PR #52 후속 5차: toddler 라벨을 2~3살 → 8~9살로 상향(프런트 사본과
// 반드시 일치해야 한다). 내부 식별자 'toddler'/레벨 임계값은 그대로.
export const AGE_TIER_LABEL: Record<AgeTier, string> = {
  toddler: '8~9살',
  teen: '10대',
  junior_20s: '20대',
  career_30s: '30대',
  veteran_40s: '40대',
  master_50s: '50~60대',
}

// PR #53 후속: 진화 메시지(characterDialogue.ts)용 — src/data/characterAge.ts
// AGE_TIER_STAGE_LABEL의 백엔드 사본. 두 파일은 반드시 같은 값이어야 한다.
export const AGE_TIER_STAGE_LABEL: Record<AgeTier, string> = {
  toddler: '초등 저학년',
  teen: '청소년',
  junior_20s: '청년',
  career_30s: '중급 전문가',
  veteran_40s: '베테랑',
  master_50s: '마스터',
}

// 각 연령대가 시작되는 최소 레벨 — ageTierForLevel이 바로 이 값들로
// 판정하므로(아래), 여기 숫자만 바꾸면 두 로직이 항상 같이 움직인다.
export const AGE_TIER_MIN_LEVEL: Record<AgeTier, number> = {
  toddler: 1,
  teen: 5,
  junior_20s: 10,
  career_30s: 20,
  veteran_40s: 30,
  master_50s: 40,
}

export function ageTierForLevel(level: number): AgeTier {
  // AGE_TIER_ORDER는 연령 낮은 순이므로 뒤에서부터 훑어 레벨이 그 단계의
  // 최소 레벨 이상인 첫 번째 단계를 고른다(= level이 속하는 가장 높은 단계).
  for (let i = AGE_TIER_ORDER.length - 1; i >= 0; i--) {
    const tier = AGE_TIER_ORDER[i]
    if (level >= AGE_TIER_MIN_LEVEL[tier]) return tier
  }
  return 'toddler'
}

function ageTierIndex(tier: AgeTier): number {
  return AGE_TIER_ORDER.indexOf(tier)
}

// 다음 연령대 — 마지막 단계(master_50s)면 null.
export function nextAgeTier(tier: AgeTier): AgeTier | null {
  const idx = ageTierIndex(tier)
  return idx >= 0 && idx < AGE_TIER_ORDER.length - 1 ? AGE_TIER_ORDER[idx + 1] : null
}

// PR #63: "지식 적합 저장 개수가 쌓이면 조기 진화"하던 예전
// EVOLUTION_KNOWLEDGE_COUNT/cumulativeEvolutionThreshold 가속 장치를
// 완전히 대체한다 — 더 이상 개수만 세지 않고, 유형별(객관식/주관식/
// 노하우) 균형을 요구하는 진짜 게이트로 바뀐다. 실제 집계/진화 판정
// 로직은 api/_lib/characterMissions.ts에 있다(이 파일은 상수만 둔다).
export type MissionType = 'objective' | 'subjective' | 'knowhow'
export const MISSION_TYPES: MissionType[] = ['objective', 'subjective', 'knowhow']
// 한 연령대를 "졸업"하려면 유형마다 이 개수만큼 확정해야 한다(2개씩 x
// 3유형 = 총 6개) — 모든 연령대에 동일하게 적용되는 고정값.
export const MISSIONS_REQUIRED_PER_TYPE = 2
export const MISSIONS_REQUIRED_TOTAL = MISSIONS_REQUIRED_PER_TYPE * MISSION_TYPES.length

// 지금 연령대가 특정 연령대"이상"인지 — 지식 난이도 게이팅(가르치기 검증)
// 에 쓴다. 캐릭터의 실제 연령대가 지식이 요구하는 연령대보다 낮으면
// false — 호출부(handleVerifyKnowledge)가 저장 전에 거절한다.
export function meetsAgeTier(current: AgeTier, required: AgeTier): boolean {
  return ageTierIndex(current) >= ageTierIndex(required)
}

export const ageBlockedMessage = (requiredLabel: string): string =>
  `아직은 너무 어려워서 이해하기 힘들어요! ${requiredLabel}가 되면 다시 가르쳐 주세요~`
