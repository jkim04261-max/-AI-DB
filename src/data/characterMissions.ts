import type { AgeTier } from './characterAge'

// PR #63: "가르치기·스스로 공부하기" 화면의 카드형 미션 — 한 연령대를
// "졸업"하려면 유형별(객관식/주관식/노하우)로 고르게 확정 저장해야
// 다음 연령대로 진화한다. api/_lib/characterAge.ts의 MissionType과
// 반드시 같은 값이어야 한다(이 저장소의 기존 api//src 중복 패턴과
// 동일).
//
// 지시서(연령대별 스테이지 볼륨업): 유형별 필요 개수는 더 이상 모든
// 연령대에 동일하지 않다(8~9살=6, 10대=10, 20대=20, 30대=30,
// 40대=40, 50~60대=50 — api/_lib/characterAge.ts의
// MISSIONS_REQUIRED_PER_TYPE_BY_TIER 참고) — 화면은 서버가 그때그때
// 내려주는 MissionProgress.byType[type].required/requiredTotal을
// 그대로 표시할 뿐이라, 이 파일 자체는 바꿀 로직이 없다.
//
// 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): 'card_game'(직업 카드
// 맞추기)을 네 번째 유형으로 추가했다 — api/_lib/characterAge.ts와
// 반드시 같은 값이어야 한다. 10대에서만 1개 요구되고, 다른 연령대는
// 전부 0이다(해당 파일의 override 참고).
//
// 지시서(8세 학습 시스템: 8문제 커리큘럼 재구성): 'sequence_order'(순서
// 맞추기)/'categorize'(분류하기) 2종을 추가했다 — toddler(8~9살)에서만
// 각 1개씩 요구되고, 다른 연령대는 전부 0이다.
export type MissionType = 'objective' | 'subjective' | 'knowhow' | 'card_game' | 'sequence_order' | 'categorize'
export const MISSION_TYPES: MissionType[] = ['objective', 'subjective', 'knowhow', 'card_game', 'sequence_order', 'categorize']

// PR #62의 3개 입력 카드(① 선택지 고르기 ② AI 추천 받기 ③ 직접
// 입력하기)가 그대로 이 3개 미션 유형에 대응한다 — 새 입력 방식을
// 만들지 않고 기존 카드가 "어느 미션을 채우는지"만 태깅한다.
export const MISSION_TYPE_LABEL: Record<MissionType, string> = {
  objective: '선택지에서 고르기',
  subjective: 'AI 추천 받기',
  knowhow: '직접 입력하기',
  card_game: '직업 카드 맞추기',
  sequence_order: '순서 맞추기',
  categorize: '분류하기',
}
export const MISSION_TYPE_ICON: Record<MissionType, string> = {
  objective: '🎯',
  subjective: '✨',
  knowhow: '✏️',
  card_game: '🃏',
  sequence_order: '🔢',
  categorize: '🗂️',
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
