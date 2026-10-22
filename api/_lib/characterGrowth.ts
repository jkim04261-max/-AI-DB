// PR #45 checkpoint 4: XP/레벨 상수와 순수 계산 함수. DB 컬럼이 아니라
// 코드 상수로 관리해서(characterProfessions.ts/PROFESSIONS와 같은 원칙),
// 밸런스 조정이 마이그레이션 없이 코드 변경만으로 가능하다.
//
// 레벨업 임계값: 레벨 L에서 L+1로 가려면 (L * 100) XP가 더 필요하다.
// 즉 레벨 1→2는 100XP, 2→3은 200XP(누적 300XP), 3→4는 300XP(누적
// 600XP)... 식으로 점점 더 많은 XP가 필요해지는 완만한 곡선이다.
export const KNOWLEDGE_SAVE_EXP = 10
export const QUIZ_CORRECT_EXP = 5
export const EXAM_PASS_EXP = 50
// 시험 합격 기준 — 전체 문항 중 이 비율 이상 정답이면 합격.
export const EXAM_PASS_THRESHOLD = 0.6

// 레벨 L에서 L+1로 올라가는 데 필요한 XP(그 레벨 "안에서" 쌓아야 하는 양).
export function expThresholdForLevel(level: number): number {
  return level * 100
}

// 총 누적 exp로부터 현재 레벨을 계산한다 — characters.level은 이 값을
// 캐싱해둔 것일 뿐이고(조회 편의를 위한 비정규화), 진짜 기준은 항상
// characters.exp다. exp가 바뀔 때마다 이 함수로 다시 계산해 level 컬럼을
// 갱신한다(applyExpGain에서 두 컬럼을 함께 갱신).
export function levelForExp(exp: number): number {
  let level = 1
  let remaining = Math.max(0, exp)
  while (remaining >= expThresholdForLevel(level)) {
    remaining -= expThresholdForLevel(level)
    level++
  }
  return level
}

export interface LevelProgress {
  level: number
  // 현재 레벨 안에서 이미 쌓은 exp (0 이상, expForNextLevel 미만)
  expIntoLevel: number
  // 다음 레벨까지 필요한 exp (= expThresholdForLevel(level))
  expForNextLevel: number
}

// 화면의 "Lv.N" + 진행 막대(progress bar)에 바로 쓸 수 있는 형태로
// 가공한 값 — levelForExp와 같은 로직을 공유하되 중간 상태까지 돌려준다.
export function levelProgress(exp: number): LevelProgress {
  let level = 1
  let remaining = Math.max(0, exp)
  while (remaining >= expThresholdForLevel(level)) {
    remaining -= expThresholdForLevel(level)
    level++
  }
  return { level, expIntoLevel: remaining, expForNextLevel: expThresholdForLevel(level) }
}
