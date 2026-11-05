import { sql, type CharacterRow } from './db'
import {
  type AgeTier,
  type MissionType,
  MISSION_TYPES,
  MISSIONS_REQUIRED_PER_TYPE,
  AGE_TIER_MIN_LEVEL,
  AGE_TIER_LABEL,
  AGE_TIER_STAGE_LABEL,
  ageTierForLevel,
  nextAgeTier,
} from './characterAge'

// PR #63: "학습 단계 진화" 게이트 — 한 연령대에서 유형별(객관식/주관식/
// 노하우) 2개씩 총 6개의 지식을 확정(save-knowledge) 저장해야만 다음
// 연령대로 진화한다. 캐릭터의 "진짜" 연령대는 더 이상 character.level의
// 순수 파생값이 아니다 — characters.mission_unlocked_tier가 NULL이면
// (모든 기존 캐릭터 + 아직 게이트를 한 번도 평가받지 않은 캐릭터) 지금
// 까지와 똑같이 레벨에서 계산하고, 이 값이 한 번이라도 채워지면 그
// 때부터는 이 값이 상한선이 된다 — 레벨이 아무리 올라도 이 티어의
// 6미션을 끝내기 전까지는 다음 단계로 못 넘어간다.
export function effectiveAgeTier(character: Pick<CharacterRow, 'level' | 'mission_unlocked_tier'>): AgeTier {
  return character.mission_unlocked_tier ?? ageTierForLevel(character.level)
}

export interface MissionTypeProgress {
  type: MissionType
  confirmed: number
  required: number
  complete: boolean
}

export interface MissionProgress {
  ageTier: AgeTier
  ageTierLabel: string
  byType: Record<MissionType, MissionTypeProgress>
  confirmedTotal: number
  requiredTotal: number
  allConfirmed: boolean
  nextAgeTier: AgeTier | null
  nextAgeTierLabel: string | null
}

// 현재(또는 지정한) 연령대에서, 유형별로 몇 개를 확정했는지 센다.
// age_tier_at_save가 이 티어와 정확히 같은 행만 집계하므로 — 이전
// 단계에서 쌓은 저장이나, 이 컬럼이 생기기 전(NULL)의 예전 저장은
// 어느 단계의 집계에도 섞여 들어가지 않는다(완전히 새 시작).
export async function getMissionProgress(userId: number, characterId: number, tier: AgeTier): Promise<MissionProgress> {
  const result = await sql<{ mission_type: MissionType; count: number }>`
    SELECT mission_type, COUNT(*)::int AS count
    FROM character_knowledge_entries
    WHERE character_id = ${characterId} AND user_id = ${userId}
      AND age_tier_at_save = ${tier} AND mission_type IS NOT NULL
    GROUP BY mission_type
  `
  const counts = new Map(result.rows.map((r) => [r.mission_type, r.count]))

  const byType = {} as Record<MissionType, MissionTypeProgress>
  let confirmedTotal = 0
  for (const type of MISSION_TYPES) {
    const confirmed = Math.min(counts.get(type) ?? 0, MISSIONS_REQUIRED_PER_TYPE)
    confirmedTotal += confirmed
    byType[type] = { type, confirmed, required: MISSIONS_REQUIRED_PER_TYPE, complete: confirmed >= MISSIONS_REQUIRED_PER_TYPE }
  }
  const requiredTotal = MISSIONS_REQUIRED_PER_TYPE * MISSION_TYPES.length
  const next = nextAgeTier(tier)

  return {
    ageTier: tier,
    ageTierLabel: AGE_TIER_LABEL[tier],
    byType,
    confirmedTotal,
    requiredTotal,
    allConfirmed: MISSION_TYPES.every((type) => byType[type].complete),
    nextAgeTier: next,
    nextAgeTierLabel: next ? AGE_TIER_LABEL[next] : null,
  }
}

export interface EvolveResult {
  evolved: boolean
  newAgeTier: AgeTier | null
  newAgeTierLabel: string | null
  newAgeTierStageLabel: string | null
  effectiveTier: AgeTier
  missionProgress: MissionProgress
}

// 저장/퀴즈/시험 등 XP가 바뀔 수 있는 모든 액션 뒤에 공통으로 호출한다.
// level은 그 액션의 XP 반영이 끝난 *이후* 값을 넘겨야 한다(applyExpGain의
// 결과) — 레벨 조건(AGE_TIER_MIN_LEVEL)과 미션 조건(6개 확정) 둘 다
// 만족해야만 실제로 진화한다(사용자 승인: "레벨 조건 유지 + 미션 게이트
// 추가").
//
// pinnedTier가 null(아직 한 번도 이 게이트를 평가받은 적 없는 캐릭터 —
// 이 기능이 생기기 전부터 있던 모든 캐릭터 포함)이면, 그 "첫 평가" 시점의
// ageTierForLevel(level)을 그 즉시 한 번만 고정해 박아넣는다 — 레벨이
// 이미 높은 기존 캐릭터를 소급 강등시키지 않으면서도(요청 1번 "레벨 조건
// 유지"), 그 순간부터는 더 이상 레벨만으로 재계산하지 않고 오직 이
// 함수(미션 확정)만이 값을 전진시킨다. 이렇게 "최초 1회는 레벨로 자리를
// 잡고, 그 뒤로는 미션으로만 전진"해야, 레벨이 한 번에 여러 단계
// 임계값을 건너뛰어도(예: 시험 +50XP) 중간 단계 미션이 조용히 생략되는
// 일이 없다 — 최초 고정 이후로는 아래 while 루프가 한 단계씩만 전진
// 시키기 때문이다(한 번의 XP로 여러 단계를 건너뛸 수 있는 레벨과 달리,
// 진화는 항상 한 단계씩).
export async function maybeEvolveAgeTier(userId: number, characterId: number, level: number, pinnedTier: AgeTier | null): Promise<EvolveResult> {
  let tier = pinnedTier
  if (tier === null) {
    tier = ageTierForLevel(level)
    await sql`
      UPDATE characters SET mission_unlocked_tier = ${tier}
      WHERE id = ${characterId} AND user_id = ${userId}
    `
  }

  let evolved = false
  let newTier: AgeTier | null = null
  for (;;) {
    const next = nextAgeTier(tier)
    if (!next || level < AGE_TIER_MIN_LEVEL[next]) break
    const progress = await getMissionProgress(userId, characterId, tier)
    if (!progress.allConfirmed) break
    await sql`
      UPDATE characters SET mission_unlocked_tier = ${next}
      WHERE id = ${characterId} AND user_id = ${userId}
    `
    tier = next
    evolved = true
    newTier = next
  }

  const missionProgress = await getMissionProgress(userId, characterId, tier)
  return {
    evolved,
    newAgeTier: newTier,
    newAgeTierLabel: newTier ? AGE_TIER_LABEL[newTier] : null,
    newAgeTierStageLabel: newTier ? AGE_TIER_STAGE_LABEL[newTier] : null,
    effectiveTier: tier,
    missionProgress,
  }
}
