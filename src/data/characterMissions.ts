import type { AgeTier } from './characterAge'

// PR #63: "가르치기·스스로 공부하기" 화면의 6단계 카드형 미션 — 한
// 연령대를 "졸업"하려면 유형별(객관식/주관식/노하우) 2개씩 총 6개를
// 확정 저장해야 다음 연령대로 진화한다. api/_lib/characterAge.ts의
// MissionType/MISSIONS_REQUIRED_PER_TYPE과 반드시 같은 값이어야 한다
// (이 저장소의 기존 api//src 중복 패턴과 동일).
export type MissionType = 'objective' | 'subjective' | 'knowhow'
export const MISSION_TYPES: MissionType[] = ['objective', 'subjective', 'knowhow']
export const MISSIONS_REQUIRED_PER_TYPE = 2

// PR #62의 3개 입력 카드(① 선택지 고르기 ② AI 추천 받기 ③ 직접
// 입력하기)가 그대로 이 3개 미션 유형에 대응한다 — 새 입력 방식을
// 만들지 않고 기존 카드가 "어느 미션을 채우는지"만 태깅한다.
export const MISSION_TYPE_LABEL: Record<MissionType, string> = {
  objective: '선택지에서 고르기',
  subjective: 'AI 추천 받기',
  knowhow: '직접 입력하기',
}
export const MISSION_TYPE_ICON: Record<MissionType, string> = {
  objective: '🎯',
  subjective: '✨',
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
