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

// PR #52 후속 5차: 시작 연령을 2~3살(영유아)에서 8~9살(초등 저학년)로
// 상향해달라는 요청에 따라 toddler 라벨만 바꿨다 — 내부 식별자
// 'toddler'/레벨 구간/게이팅 로직은 과거 데이터·테스트와의 호환을
// 위해 그대로 두고, 화면에 보이는 문구만 전부 바꿨다.
export const AGE_TIER_LABEL: Record<AgeTier, string> = {
  toddler: '8~9살',
  teen: '10대',
  junior_20s: '20대',
  career_30s: '30대',
  veteran_40s: '40대',
  master_50s: '50~60대',
}

// 메뉴/HUD 등에서 "지금 어떤 단계인지" 한 단어로 보여줄 때 쓰는 짧은 이름.
export const AGE_TIER_STAGE_LABEL: Record<AgeTier, string> = {
  toddler: '초등 저학년',
  teen: '청소년',
  junior_20s: '청년',
  career_30s: '중급 전문가',
  veteran_40s: '베테랑',
  master_50s: '마스터',
}

// 각 연령대가 시작되는 최소 레벨 — ageTierForLevel이 바로 이 값들로
// 판정한다(백엔드 api/_lib/characterAge.ts의 같은 이름의 표와 반드시
// 같아야 한다 — 특히 진화 로직이 이 표를 기준으로 다음 단계의 레벨을
// 계산한다).
export const AGE_TIER_MIN_LEVEL: Record<AgeTier, number> = {
  toddler: 1,
  teen: 5,
  junior_20s: 10,
  career_30s: 20,
  veteran_40s: 30,
  master_50s: 40,
}

export function ageTierForLevel(level: number): AgeTier {
  for (let i = AGE_TIER_ORDER.length - 1; i >= 0; i--) {
    const tier = AGE_TIER_ORDER[i]
    if (level >= AGE_TIER_MIN_LEVEL[tier]) return tier
  }
  return 'toddler'
}

// PR #52 후속 5차 요청 3번: 머리 위 나이 뱃지용 — 티어보다 더 촘촘하게
// "지금 레벨이면 몇 살인지" 하나의 숫자로 보여준다. 각 티어 내부에서
// 레벨 구간을 그 티어의 나이 구간에 선형으로 매핑한다(레벨 구간/나이
// 구간 경계는 ageTierForLevel·AGE_TIER_LABEL과 반드시 같은 뜻이어야
// 하므로 아래 두 표에서만 따로 관리). toddler 레벨 1~2→8세, 3~4→9세로
// 요청하신 예시와 정확히 맞아떨어진다.
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

export function ageNumberForLevel(level: number): number {
  const tier = ageTierForLevel(level)
  const [lvLo, lvHi] = AGE_NUMBER_LEVEL_RANGE[tier]
  const [ageLo, ageHi] = AGE_NUMBER_AGE_RANGE[tier]
  const clampedLevel = Math.min(Math.max(level, lvLo), lvHi)
  const ratio = lvHi === lvLo ? 0 : (clampedLevel - lvLo) / (lvHi - lvLo)
  return Math.round(ageLo + ratio * (ageHi - ageLo))
}

export function ageTierIndex(tier: AgeTier): number {
  return AGE_TIER_ORDER.indexOf(tier)
}

// 지금 연령대가 특정 연령대"이상"인지 — 지식 난이도 게이팅에 쓴다.
export function meetsAgeTier(current: AgeTier, required: AgeTier): boolean {
  return ageTierIndex(current) >= ageTierIndex(required)
}

// 8~9살(초등 저학년) 캐릭터가 직업을 고른 직후 보여줄, 아동스러운
// 말투의 인사 — PR #52 요청 2번의 튜토리얼 대사. 직업 라벨을 그대로
// 끼워 넣는다.
export function toddlerProfessionGreeting(professionLabel: string): string {
  return `나 ${professionLabel} 되고 싶어요! 저에게 지식, 훈련, 강의를 가르쳐주세요!`
}

// 지시서(캐릭터 인사말 말풍선): 프로필 생성 직후(오프닝 화면을 막
// 통과한 시점) 한 번 보여주는 인사말 — 입력한 캐릭터 이름을 그대로
// 끼워 넣는다. 이름은 OpeningProfileScreen에서 항상 값이 있도록
// 보장되지만(비워두면 시작 버튼이 비활성화됨), 혹시라도 비어 있으면
// 지시서가 요구한 기본값으로 대체한다.
//
// 문구 정정(2026-11-13 지시서): 직업을 끼워 넣던 이전 문구("저는
// {직업}입니다")와 존칭("님")을 빼고, 지시서가 지정한 정확한 문구
// ("안녕하세요, {이름}이에요! 저를 잘 키워주세요.")로 교체했다 — 그 외
// 타이밍(0.5초 지연·5초 유지·탭 시 조기 종료)과 말풍선 디자인은 전혀
// 바뀌지 않는다(이미 요구사항을 만족하고 있었음). 직업을 더 이상
// 쓰지 않아 매개변수에서도 뺐다(호출부 GrowPage.tsx도 함께 수정).
export function openingGreeting(name: string): string {
  if (!name) return '안녕하세요! 저를 잘 키워주세요.'
  return `안녕하세요, ${name}이에요! 저를 잘 키워주세요.`
}

// 연령대에 비해 너무 어려운 지식을 가르치려 할 때 보여줄 거절 메시지 —
// 요청 3번의 예시 문구를 그대로 따른다. requiredLabel은 그 지식이 원래
// 필요한 최소 연령대의 라벨이다.
export function ageBlockedMessage(requiredLabel: string): string {
  return `아직은 너무 어려워서 이해하기 힘들어요! ${requiredLabel}가 되면 다시 가르쳐 주세요~`
}
