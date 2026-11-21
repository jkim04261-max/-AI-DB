import type { ComponentType } from 'react'
import { Grid3x3, Lightbulb } from 'lucide-react'
import type { AgeTier } from './characterAge'

// 지시서(연령별 미니게임 보조 편성): 미니게임은 "학습의 흥미를 돕는
// 보조 기능"일 뿐이라 기존 8세~60세 문제 풀이(가르치기/퀴즈/시험) 진도,
// XP, mission_unlocked_tier 등 어떤 서버 상태도 건드리지 않는다. 등록된
// 각 게임은 이미 /card-match, /job-quiz에서 "독립적인 별도 잔액"으로
// 검증된 완전히 자급자족형 컴포넌트(onCleared 등 필수 prop 없음)만
// 재사용한다 — 새 미니게임을 추가할 때도 같은 원칙(자체 useMockWallet
// 인스턴스, /grow의 실제 캐릭터 상태와 절대 연결하지 않음)을 지킨다.
export type MinigameId = 'card_match' | 'job_quiz'

export interface MinigameDef {
  id: MinigameId
  label: string
  description: string
  icon: ComponentType<{ size?: number; className?: string }>
  // 실제 플레이 화면 — 지연 로딩 없이 바로 쓸 수 있도록 컴포넌트
  // 참조 자체를 들고 있는다(React.lazy는 이 정도 크기에선 과한 복잡도).
  Component: ComponentType
}

// 기존 /card-match, /job-quiz 라우트가 쓰던 바로 그 컴포넌트를 그대로
// import한다 — 새 게임 로직을 만들지 않고 "재사용"하라는 지시를
// 문자 그대로 따른 것.
import CardMatchGame from '../components/games/CardMatchGame'
import JobQuiz from '../components/JobQuiz'

// 등록 순서 = 연령대가 올라갈수록 해금되는 순서(아래 슬롯 수만큼
// 앞에서부터 잘라 보여준다). 새 미니게임(스피드 퀴즈, 도구 분류하기,
// 상황극 퀴즈, 초성 퀴즈 등)은 이 배열 뒤에 추가하면 된다 — 그 즉시
// 모든 연령대의 해금 슬롯 계산에 자동으로 반영된다(아래
// unlockedMinigamesForTier가 배열 길이로 자연히 상한을 잡는다).
export const MINIGAME_REGISTRY: MinigameDef[] = [
  {
    id: 'card_match',
    label: '카드 맞추기',
    description: '직업 카드와 도구 카드를 뒤집어 짝을 맞혀요.',
    icon: Grid3x3,
    Component: CardMatchGame,
  },
  {
    id: 'job_quiz',
    label: '직업 그림 퀴즈',
    description: '그림을 보고 어떤 직업/도구인지 맞혀요.',
    icon: Lightbulb,
    Component: JobQuiz,
  },
]

// 지시서(연령별 미니게임 개수 매핑): 8세=1, 10대=3, 20대=5, 30대=7,
// 40대=9, 50대=11, 60대=13 — characterAge.ts의
// SELF_STUDY_DRAFT_COUNT_BY_TIER/OBJECTIVE_QUIZ_CHOICE_COUNT_BY_TIER와
// 똑같은 패턴(Record<AgeTier, number> + 60대 전용 override + ageNumber
// 기준 분기). 지금은 실제로 구현된 미니게임이 2종뿐이라 10대 이상은
// unlockedMinigamesForTier가 MINIGAME_REGISTRY.length로 자동으로
// 상한을 잡는다 — 지정된 슬롯 수 자체(아래 값)는 지시서 그대로 유지해,
// 새 미니게임이 추가될 때마다 그 연령대부터 바로 더 열리게 해둔다.
export const MINIGAME_SLOT_COUNT_BY_TIER: Record<AgeTier, number> = {
  toddler: 1,
  teen: 3,
  junior_20s: 5,
  career_30s: 7,
  veteran_40s: 9,
  master_50s: 11,
}
const MASTER_TIER_60S_MINIGAME_SLOT_COUNT = 13

export function minigameSlotCountForTier(tier: AgeTier, ageNumber?: number): number {
  if (tier === 'master_50s' && ageNumber !== undefined && ageNumber >= 60) {
    return MASTER_TIER_60S_MINIGAME_SLOT_COUNT
  }
  return MINIGAME_SLOT_COUNT_BY_TIER[tier]
}

export function unlockedMinigamesForTier(tier: AgeTier, ageNumber?: number): MinigameDef[] {
  const slots = minigameSlotCountForTier(tier, ageNumber)
  return MINIGAME_REGISTRY.slice(0, Math.min(slots, MINIGAME_REGISTRY.length))
}
