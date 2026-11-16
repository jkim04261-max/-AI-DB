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

// PR #52 후속 5차 요청 3번(src/data/characterAge.ts)의 백엔드 사본 —
// 머리 위 나이 뱃지와 똑같은 "티어 안에서 레벨을 나이로 선형 매핑"
// 계산이, 아래 dailyStudyLimitForTier의 50~60대 분기에도 필요해서
// 가져왔다. 두 파일의 레벨/나이 구간은 반드시 같아야 한다.
const AGE_NUMBER_LEVEL_RANGE: Record<AgeTier, [number, number]> = {
  toddler: [1, 4],
  teen: [5, 9],
  junior_20s: [10, 19],
  career_30s: [20, 29],
  veteran_40s: [30, 39],
  master_50s: [40, 65],
}
const AGE_NUMBER_AGE_RANGE: Record<AgeTier, [number, number]> = {
  toddler: [8, 9],
  teen: [10, 19],
  junior_20s: [20, 29],
  career_30s: [30, 39],
  veteran_40s: [40, 49],
  master_50s: [50, 65],
}

export function ageNumberForTier(tier: AgeTier, level: number): number {
  const [lvLo, lvHi] = AGE_NUMBER_LEVEL_RANGE[tier]
  const [ageLo, ageHi] = AGE_NUMBER_AGE_RANGE[tier]
  const clampedLevel = Math.min(Math.max(level, lvLo), lvHi)
  const ratio = lvHi === lvLo ? 0 : (clampedLevel - lvLo) / (lvHi - lvLo)
  return Math.round(ageLo + ratio * (ageHi - ageLo))
}

// 지시서(연령대별 AI 추천(예시) 개수 1개씩 점진적 증가 로직으로 수정):
// "✨ 예시 만들어주기" 버튼을 한 번 누를 때 한꺼번에 생성되는 예시
// 개수가 연령대가 올라갈수록 1개씩 늘어난다 — 8~9살(toddler)=1(아이가
// 부담을 느끼지 않도록 최소화 — 지시서는 "1개(또는 2개)"로 범위를
// 줬지만, "최소화" 쪽을 택해 1로 정했다), 10대=3, 20대=4, 30대=5,
// 40대=6, 50대=7, 60대 이상(master_50s 안에서 ageNumber>=60)=8. 60대
// 분기는 기존 포트레이트 이미지의 50/60대 분기(characterWalking.ts/
// characterEating.ts의 MASTER_TIER_60S_*)와 똑같은 ageNumber 기준을
// 재사용한다.
//
// (PR #124("AI 추천(예시 만들기) 개수에 대한 명확한 지시")에서는 이 표가
// 8~9살=3 ~ 60대=15로, 2개씩 늘어나는 값이었다. 이번 지시서가 "1개씩
// 점진적 증가"로 다시 정정해 전체 값을 교체한다 — 하루 무료 클릭 횟수
// (studyLimit.ts의 DAILY_STUDY_LIMIT=3)는 이번에도 건드리지 않는다.)
export const SELF_STUDY_DRAFT_COUNT_BY_TIER: Record<AgeTier, number> = {
  toddler: 1,
  teen: 3,
  junior_20s: 4,
  career_30s: 5,
  veteran_40s: 6,
  master_50s: 7,
}
const MASTER_TIER_60S_SELF_STUDY_DRAFT_COUNT = 8

export function selfStudyDraftCountForTier(tier: AgeTier, ageNumber?: number): number {
  if (tier === 'master_50s' && ageNumber !== undefined && ageNumber >= 60) {
    return MASTER_TIER_60S_SELF_STUDY_DRAFT_COUNT
  }
  return SELF_STUDY_DRAFT_COUNT_BY_TIER[tier]
}

// 지시서(연령대별 객관식 선택지 개수 동적 변경 및 문제 유형 확장): "객관식"
// 미션 단계(toddler 2문제/teen 3문제, api/character.ts의
// handleGetObjectiveQuiz 참고)에서 문제 1개당 보여줄 보기 개수 — 위
// SELF_STUDY_DRAFT_COUNT_BY_TIER와 똑같은 연령대별 숫자(8~9살=3, 10대=5,
// 20대=7, 30대=9, 40대=11, 50대=13, 60대 이상=15)지만 전혀 다른 용도라
// (한쪽은 "클릭당 예시 개수", 이쪽은 "문제 1개의 선택지 개수") 별도
// 테이블로 둔다.
export const OBJECTIVE_QUIZ_CHOICE_COUNT_BY_TIER: Record<AgeTier, number> = {
  toddler: 3,
  teen: 5,
  junior_20s: 7,
  career_30s: 9,
  veteran_40s: 11,
  master_50s: 13,
}
const MASTER_TIER_60S_OBJECTIVE_QUIZ_CHOICE_COUNT = 15

export function objectiveQuizChoiceCountForTier(tier: AgeTier, ageNumber?: number): number {
  if (tier === 'master_50s' && ageNumber !== undefined && ageNumber >= 60) {
    return MASTER_TIER_60S_OBJECTIVE_QUIZ_CHOICE_COUNT
  }
  return OBJECTIVE_QUIZ_CHOICE_COUNT_BY_TIER[tier]
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
//
// 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): 'card_game'을 네 번째
// 유형으로 추가했다 — character_knowledge_entries.mission_type의 DB
// CHECK 제약도 함께 넓혔다(db.ts). 10대(teen)에서만 실제로 요구되고
// (아래 override), 다른 모든 연령대는 card_game:0을 명시해 기존 숫자가
// 전혀 바뀌지 않는다(splitMissionsRequiredByType는 여전히 기존 3종만
// 나눈다 — 아래 참고).
export type MissionType = 'objective' | 'subjective' | 'knowhow' | 'card_game'
export const MISSION_TYPES: MissionType[] = ['objective', 'subjective', 'knowhow', 'card_game']

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
// 순서대로 +1씩) — 예: teen(10) → [4, 3, 3].
// 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): 이 함수는 일부러
// MISSION_TYPES(4종)가 아니라 기존 3종(LEGACY_SPLIT_TYPES)만 나눈다 —
// card_game은 override가 없는 모든 티어(junior_20s 이상)에서 항상 0으로
// 고정해야, card_game을 추가한 것 자체가 그 티어들의 기존 숫자를 바꿔버
// 리는 회귀를 만들지 않는다.
const LEGACY_SPLIT_TYPES: MissionType[] = ['objective', 'subjective', 'knowhow']
function splitMissionsRequiredByType(total: number): Record<MissionType, number> {
  const base = Math.floor(total / LEGACY_SPLIT_TYPES.length)
  const remainder = total - base * LEGACY_SPLIT_TYPES.length
  const result = { objective: 0, subjective: 0, knowhow: 0, card_game: 0 } as Record<MissionType, number>
  LEGACY_SPLIT_TYPES.forEach((type, i) => {
    result[type] = base + (i < remainder ? 1 : 0)
  })
  return result
}

// 지시서(8~9세 문제 유형 변경 및 종합 최종 시험/패스권 시스템): toddler
// (8~9살)의 3단계가 더 이상 "주관식(AI 추천 받기 중 하나 고르기)"이
// 아니라 "직업 카드 맞추기"다 — "1단계 직접입력 3문제 → 2단계 객관식
// 2문제(전부 정답 필요) → 3단계 직업 카드 맞추기 1개"(knowhow 3 +
// objective 2 + card_game 1 = 6, MISSIONS_REQUIRED_TOTAL_BY_TIER.toddler와
// 동일, teen의 card_game 단계와 똑같은 컴포넌트를 재사용한다). "AI 추천
// 받기" 카드 자체는 1단계(direct)에서 여전히 보이지만(showDirectInputCards),
// 더 이상 "3단계 전용" 필수 미션은 아니다. 6/6을 채워도 더 이상 그
// 즉시 진화하지 않는다 — maybeEvolveAgeTier가 toddler→teen 전환에서
// final_exam_passed도 함께 확인한다(아래 종합 최종 시험 참고).
//
// 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): teen(10대)도 더 이상
// 균등분배가 아니라 고정 순서 흐름이다 — "①직접입력 3 → ②직업 카드
// 맞추기 1 → ③직접입력 1 → ④객관식 3 → ⑤개인 꿀팁/노하우 2"
// (지시서 원문의 ③·⑤는 "주관식 텍스트 입력"이라고 썼지만, 입력
// 방식이 기존 "직접 입력하기" 카드와 완전히 같고 라벨도 "직접
// 입력하기"/"노하우"이므로 knowhow로 집계한다 — subjective는
// "AI 추천 받기"(스스로 공부하기) 전용 집계라 이 커리큘럼에는 쓰지
// 않는다). knowhow 3+1+2=6, objective 3, card_game 1 → 합계 10
// (MISSIONS_REQUIRED_TOTAL_BY_TIER.teen과 동일). junior_20s 이상은
// 이번 지시서의 범위 밖이라(사용자 승인: "일단은 10대 커리큘럼부터
// 완벽히 구현") 기존 균등분배 공식을 그대로 둔다.
const MISSIONS_REQUIRED_PER_TYPE_OVERRIDE: Partial<Record<AgeTier, Record<MissionType, number>>> = {
  toddler: { knowhow: 3, objective: 2, subjective: 0, card_game: 1 },
  teen: { knowhow: 6, objective: 3, subjective: 0, card_game: 1 },
}

export const MISSIONS_REQUIRED_PER_TYPE_BY_TIER: Record<AgeTier, Record<MissionType, number>> = Object.fromEntries(
  AGE_TIER_ORDER.map((tier) => [
    tier,
    MISSIONS_REQUIRED_PER_TYPE_OVERRIDE[tier] ?? splitMissionsRequiredByType(MISSIONS_REQUIRED_TOTAL_BY_TIER[tier]),
  ]),
) as Record<AgeTier, Record<MissionType, number>>

// 지금 연령대가 특정 연령대"이상"인지 — 지식 난이도 게이팅(가르치기 검증)
// 에 쓴다. 캐릭터의 실제 연령대가 지식이 요구하는 연령대보다 낮으면
// false — 호출부(handleVerifyKnowledge)가 저장 전에 거절한다.
export function meetsAgeTier(current: AgeTier, required: AgeTier): boolean {
  return ageTierIndex(current) >= ageTierIndex(required)
}

export const ageBlockedMessage = (requiredLabel: string): string =>
  `아직은 너무 어려워서 이해하기 힘들어요! ${requiredLabel}가 되면 다시 가르쳐 주세요~`

// 지시서(8~9세 문제 유형 변경 및 종합 최종 시험/패스권 시스템): "종합
// 최종 시험"에 불합격(재시험도 불합격)하면 마켓에서 살 수 있는 "음서재
// 패스권" 가격표 — 연령대가 올라갈수록 비싸진다. 사용자 확인("8~9세만
// 실제 구현")에 따라 지금은 toddler만 실제로 구매 가능하고(api/
// character.ts의 handlePurchaseFinalExamPass), 나머지는 그 연령대의
// 종합 최종 시험 자체가 아직 없어 향후 확장용으로만 값을 준비해 둔다.
export const FINAL_EXAM_PASS_PRICE_BY_TIER: Record<AgeTier, number> = {
  toddler: 30_000,
  teen: 50_000,
  junior_20s: 70_000,
  career_30s: 100_000,
  veteran_40s: 150_000,
  master_50s: 200_000,
}

// 지시서: "60대 최종 시험은 패스권 적용 불가(구매 차단) 로직을 미리
// 설계해 두세요" — master_50s 티어 안에서도 ageNumber(selfStudyDraftCount
// ForTier 등이 쓰는 것과 같은 50/60대 분기 기준)가 60 이상이면 패스권을
// 막는다. toddler~veteran_40s는 ageNumber 조건 없이 항상 구매 가능하다.
export function isFinalExamPassBlockedForTier(tier: AgeTier, ageNumber?: number): boolean {
  return tier === 'master_50s' && ageNumber !== undefined && ageNumber >= 60
}

// "종합 최종 시험"이 한 번에 몇 문제를 낼지 — 지시서("3~5문제 랜덤
// 출제")에 따라 서버가 매번 3·4·5 중 하나를 무작위로 고른다.
export function pickFinalExamQuestionCount(): number {
  return 3 + Math.floor(Math.random() * 3)
}

// 지시서("100점 만점에 80점 이상"): 문제 개수에 관계없이 정답률로
// 100점 만점 점수를 환산하고, 80점 이상이면 합격이다.
export const FINAL_EXAM_PASS_SCORE = 80
export function scoreFinalExam(correctCount: number, totalCount: number): number {
  if (totalCount <= 0) return 0
  return Math.round((correctCount / totalCount) * 100)
}
