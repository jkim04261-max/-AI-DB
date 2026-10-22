// PR #45 checkpoint 4: mirrors api/_lib/characterGrowth.ts's levelProgress
// math. api/_lib is server-only (not part of the frontend build), so this
// small pure function is duplicated here rather than imported — it only
// turns the character/exp the server already returned into a progress-bar
// fraction, it never decides XP amounts or grants anything itself.
export function expThresholdForLevel(level: number): number {
  return level * 100
}

export interface LevelProgress {
  level: number
  expIntoLevel: number
  expForNextLevel: number
}

export function levelProgress(exp: number): LevelProgress {
  let level = 1
  let remaining = Math.max(0, exp)
  while (remaining >= expThresholdForLevel(level)) {
    remaining -= expThresholdForLevel(level)
    level++
  }
  return { level, expIntoLevel: remaining, expForNextLevel: expThresholdForLevel(level) }
}

// PR #45 checkpoint 4 (조건 7): shown next to the level/XP display so it's
// never mistaken for a claim about the real Gemini model's capability.
export const KNOWLEDGE_VS_MODEL_DISCLAIMER =
  '레벨·XP는 게임 속 성장 지표예요. 실제 Gemini AI 모델의 성능이 바뀌는 것은 아니에요.'
