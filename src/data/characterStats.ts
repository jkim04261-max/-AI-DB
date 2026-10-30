// PR #47 체크포인트 1: 지식/업무/소통/창의 4개 스탯 게이지.
//
// 중요: 이 게이지는 새로 저장되는 값이 아니다 — DB 스키마는 전혀 바뀌지
// 않았다. GrowPage가 이미 읽어오는 기존 데이터(지식 저장 건수, 대화
// 메시지 수, 자격시험 합격 여부, 레벨)를 그 자리에서 0~100 사이로
// 환산해 보여주기만 하는 "표시용" 지표다. 실제로 활동별 포인트를
// 누적·저장하는 진짜 스탯 시스템은 별도 설계 문서와 승인이 필요한
// 체크포인트 2 범위(CLAUDE.md 8번 규칙)로 남겨둔다.
export interface StatGaugeInputs {
  level: number
  knowledgeTotal: number
  aiGeneratedTotal: number
  messageTotal: number
  examPassed: boolean | null
}

export interface StatGauges {
  knowledge: number
  work: number
  communication: number
  creativity: number
}

function clampPct(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)))
}

// 각 환산 계수는 임의의 게임 밸런스 값이다 — 실제 AI 성능/정확도와는
// 무관하고, 오직 "최근에 얼마나 활동했는지"를 눈에 보이는 게이지로
// 바꾸기 위한 것이다(characterGrowth.ts의 KNOWLEDGE_VS_MODEL_DISCLAIMER와
// 같은 취지).
export function computeStatGauges({
  level,
  knowledgeTotal,
  aiGeneratedTotal,
  messageTotal,
  examPassed,
}: StatGaugeInputs): StatGauges {
  const knowledge = clampPct(knowledgeTotal * 10)
  const communication = clampPct(messageTotal * 4)
  const creativity = clampPct(aiGeneratedTotal * 20)
  const work = examPassed ? 100 : clampPct(level * 15)
  return { knowledge, work, communication, creativity }
}

export interface StatMeta {
  key: keyof StatGauges
  label: string
  colorClassName: string
}

export const STAT_META: StatMeta[] = [
  { key: 'knowledge', label: '지식', colorClassName: 'from-indigo-400 to-blue-400' },
  { key: 'work', label: '업무', colorClassName: 'from-emerald-400 to-teal-400' },
  { key: 'communication', label: '소통', colorClassName: 'from-amber-400 to-orange-400' },
  { key: 'creativity', label: '창의', colorClassName: 'from-pink-400 to-rose-400' },
]
