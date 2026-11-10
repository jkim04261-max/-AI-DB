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

// 지시서(연령대별 스테이지 볼륨업): "한 연령대를 졸업하려면 유형별
// 균형(PR #63)을 갖춘 지식을 몇 개 확정해야 하는지"가 더 이상 모든
// 연령대에 똑같이 6개가 아니라, 연령대가 올라갈수록 늘어난다 —
// 8~9살(toddler)=6, 10대(teen)=10, 20대(junior_20s)=20,
// 30대(career_30s)=30, 40대(veteran_40s)=40, 50~60대(master_50s)=50.
// master_50s는 다음 연령대가 없으므로(nextAgeTier가 null) 이 50개는
// "다음 단계로의 진화 조건"이 아니라 "60대 최종 마스터 시험"
// 자체를 뜻한다 — allConfirmed가 true가 되는 순간이 곧 마스터 시험
// 통과 시점이다(src/components/grow/InteractionPanel.tsx 참고).
export const MISSIONS_REQUIRED_TOTAL_BY_TIER: Record<AgeTier, number> = {
  toddler: 6,
  teen: 10,
  junior_20s: 20,
  career_30s: 30,
  veteran_40s: 40,
  master_50s: 50,
}

// 유형별(객관식/주관식/노하우) 균형 요구는 그대로 유지하면서, 총합이
// 위 표와 정확히 일치하도록 3유형에 최대한 고르게 나눈다(나머지는
// MISSION_TYPES 순서대로 +1씩) — 예: teen(10) → [4, 3, 3].
function splitMissionsRequiredByType(total: number): Record<MissionType, number> {
  const base = Math.floor(total / MISSION_TYPES.length)
  const remainder = total - base * MISSION_TYPES.length
  const result = {} as Record<MissionType, number>
  MISSION_TYPES.forEach((type, i) => {
    result[type] = base + (i < remainder ? 1 : 0)
  })
  return result
}

export const MISSIONS_REQUIRED_PER_TYPE_BY_TIER: Record<AgeTier, Record<MissionType, number>> = Object.fromEntries(
  AGE_TIER_ORDER.map((tier) => [tier, splitMissionsRequiredByType(MISSIONS_REQUIRED_TOTAL_BY_TIER[tier])]),
) as Record<AgeTier, Record<MissionType, number>>

// 지금 연령대가 특정 연령대"이상"인지 — 지식 난이도 게이팅(가르치기 검증)
// 에 쓴다. 캐릭터의 실제 연령대가 지식이 요구하는 연령대보다 낮으면
// false — 호출부(handleVerifyKnowledge)가 저장 전에 거절한다.
export function meetsAgeTier(current: AgeTier, required: AgeTier): boolean {
  return ageTierIndex(current) >= ageTierIndex(required)
}

export const ageBlockedMessage = (requiredLabel: string): string =>
  `아직은 너무 어려워서 이해하기 힘들어요! ${requiredLabel}가 되면 다시 가르쳐 주세요~`
