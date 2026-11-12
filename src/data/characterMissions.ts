import type { AgeTier } from './characterAge'

// Introductory learning: 2 selections + 2 examples + 1 card lesson + 1 personal tip.
// Later stages retain their existing knowledge requirements; cardmatch is optional there.
export type MissionType = 'objective' | 'subjective' | 'cardmatch' | 'knowhow'
export const MISSION_TYPES: MissionType[] = ['objective', 'subjective', 'cardmatch', 'knowhow']

// PR #62의 3개 입력 카드(① 선택지 고르기 ② AI 추천 받기 ③ 직접
// 입력하기)가 그대로 이 3개 미션 유형에 대응한다 — 새 입력 방식을
// 만들지 않고 기존 카드가 "어느 미션을 채우는지"만 태깅한다.
export const MISSION_TYPE_LABEL: Record<MissionType, string> = {
  objective: '선택지에서 고르기',
  subjective: 'AI 추천 받기',
  cardmatch: '직업 카드 맞추기',
  knowhow: '직접 입력하기',
}
export const MISSION_TYPE_ICON: Record<MissionType, string> = {
  objective: '🎯',
  subjective: '✨',
  cardmatch: '🧩',
  knowhow: '✏️',
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
