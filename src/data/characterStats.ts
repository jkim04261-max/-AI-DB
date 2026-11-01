import { PROFESSION_CATEGORY, type ProfessionCategory, type ProfessionId } from './characterProfessions'

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
  // PR #48: 직업별로 성장 스탯이 조금씩 다르게 느껴지도록 하는 가중치
  // 입력 — 직업을 아직 안 고른 캐릭터는 null을 넘기면 가중치 없이
  // 계산된다(DEFAULT_STAT_WEIGHT).
  profession: ProfessionId | null
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
const DEFAULT_STAT_WEIGHT: StatGauges = { knowledge: 1, work: 1, communication: 1, creativity: 1 }

// PR #48: 직업별 성장 스탯 가중치 — DB에는 전혀 저장되지 않는, 표시용
// 게이지의 계산 비중일 뿐이다. 회계사는 꼼꼼한 업무 처리를, 가수는
// 사람들과의 소통·무대 위 창의성을 더 강조해 같은 활동을 해도 직업에
// 따라 성장 그래프가 조금 다르게 보이도록 한다. PR #49: 직업 카탈로그가
// 50개로 늘었지만, 가중치가 아직 없는 직업은 아래에서 DEFAULT_STAT_WEIGHT
// 로 자연스럽게 떨어진다(Partial이라 모든 키를 채울 필요 없음).
const PROFESSION_STAT_WEIGHT: Partial<Record<ProfessionId, StatGauges>> = {
  accountant: { knowledge: 1.1, work: 1.3, communication: 0.8, creativity: 0.8 },
  singer: { knowledge: 0.9, work: 0.8, communication: 1.2, creativity: 1.3 },
}

// PR #51(직업 선택 제한 해제): 이제 50개 직업 전부 선택할 수 있지만,
// 개별 가중치는 여전히 회계사·가수 2개뿐이다(나머지 48개까지 직업 하나
// 하나 손으로 맞추는 건 과한 범위라 판단). 대신 6개 카테고리 단위로
// "이 계열은 대체로 이런 쪽에 강하다" 정도의 기본값을 둬서, 적어도
// 업무/전문직 계열과 문화·예술 계열의 게이지가 완전히 똑같아 보이지는
// 않게 한다 — PROFESSION_STAT_WEIGHT와 마찬가지로 실제 AI 성능과는
// 무관한 임의의 게임 밸런스 값이다.
const CATEGORY_STAT_WEIGHT: Record<ProfessionCategory, StatGauges> = {
  it: { knowledge: 1.1, work: 1.2, communication: 0.8, creativity: 1.1 },
  professional: { knowledge: 1.2, work: 1.3, communication: 0.9, creativity: 0.7 },
  healthcare: { knowledge: 1.3, work: 1.1, communication: 1.0, creativity: 0.7 },
  education: { knowledge: 1.3, work: 0.9, communication: 1.1, creativity: 0.8 },
  culture: { knowledge: 0.8, work: 0.8, communication: 1.1, creativity: 1.4 },
  service: { knowledge: 0.8, work: 1.0, communication: 1.3, creativity: 0.9 },
}

export function computeStatGauges({
  level,
  knowledgeTotal,
  aiGeneratedTotal,
  messageTotal,
  examPassed,
  profession,
}: StatGaugeInputs): StatGauges {
  const category = profession ? PROFESSION_CATEGORY[profession] : null
  const weight = (profession && PROFESSION_STAT_WEIGHT[profession]) || (category && CATEGORY_STAT_WEIGHT[category]) || DEFAULT_STAT_WEIGHT
  const knowledge = clampPct(knowledgeTotal * 10 * weight.knowledge)
  const communication = clampPct(messageTotal * 4 * weight.communication)
  const creativity = clampPct(aiGeneratedTotal * 20 * weight.creativity)
  const work = clampPct((examPassed ? 100 : level * 15) * weight.work)
  return { knowledge, work, communication, creativity }
}

// PR #49: 상단 리소스 바의 "종합 성향" — 4개 스탯 중 가장 높은 것의
// 라벨을 보여준다(평균이 아니라 "어느 쪽으로 더 치우쳤는지"가 더
// 직관적이라 판단). 전부 0이면(갓 시작한 캐릭터) 중립적으로 '균형형'을
// 보여준다 — 새 데이터를 만드는 게 아니라 이미 계산된 4개 숫자를
// 요약하는 파생값일 뿐이다.
export function dominantStatLabel(gauges: StatGauges): string {
  const entries = STAT_META.map((meta) => ({ label: meta.label, value: gauges[meta.key] }))
  const max = Math.max(...entries.map((e) => e.value))
  if (max === 0) return '균형형'
  const top = entries.find((e) => e.value === max)
  return `${top?.label ?? '균형'}형`
}

// PR #49: 상단 리소스 바의 "날짜/시즌" — 실제 오늘 날짜를 그대로
// 보여주고, 계절은 실제 달(月)에서 그냥 파생한 꾸밈 문구일 뿐이다.
// 날짜·시즌에 따라 바뀌는 게임 메커니즘은 전혀 없다 — 가짜 게임 캘린더를
// 새로 만든 게 아니라는 점을 분명히 하기 위해 주석으로 남긴다.
export function todaySeasonLabel(date: Date = new Date()): string {
  const month = date.getMonth() + 1
  if (month >= 3 && month <= 5) return '봄'
  if (month >= 6 && month <= 8) return '여름'
  if (month >= 9 && month <= 11) return '가을'
  return '겨울'
}

export interface StatMeta {
  key: keyof StatGauges
  label: string
  colorClassName: string
}

// PR #49: 보석톤 팔레트로 교체 — 따뜻한 카드 배경(크림/목재) 위에서도
// 각 스탯이 또렷이 구분되도록 했다(계산 로직은 변경 없음).
export const STAT_META: StatMeta[] = [
  { key: 'knowledge', label: '지식', colorClassName: 'from-amber-500 to-yellow-400' },
  { key: 'work', label: '업무', colorClassName: 'from-emerald-500 to-teal-400' },
  { key: 'communication', label: '소통', colorClassName: 'from-sky-500 to-blue-400' },
  { key: 'creativity', label: '창의', colorClassName: 'from-rose-500 to-fuchsia-400' },
]
