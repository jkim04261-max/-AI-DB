import type { ProfessionId } from './characterProfessions'

// PR #48: "게임 루프 강화" — 캐릭터가 먼저 말을 걸거나 퀘스트를 제안하는
// 효과를 내기 위한 단일 추천 행동 계산. PR #46의 goalText(오늘의 목표)를
// 대체한다 — 같은 "지금 뭘 하면 좋을지" 판단을 한 곳에서만 계산해서
// GrowthHUD의 문구와 퀘스트 배너/말풍선이 서로 어긋나지 않게 한다.
// 입력은 전부 GrowPage가 이미 읽어오는 기존 데이터뿐이라 새 API 호출이나
// DB 변경이 없다.
//
// action 값은 GameMenu.tsx의 GameMenuAction과 같은 문자열 집합이다 —
// data/ 레이어가 components/ 쪽 타입을 직접 import하지 않도록 여기서는
// 그 부분집합만 별도로 선언해 느슨하게 맞춘다(실제 매핑/버튼 클릭은
// GrowPage가 GameMenuAction으로 그대로 넘겨 처리).
export type QuestAction = 'teach' | 'quiz' | 'study' | 'growth'

export interface ActiveQuest {
  text: string
  action: QuestAction | null
}

export interface QuestInputs {
  profession: ProfessionId | null
  professionLabel: string | null
  knowledgeTotal: number
  examPassed: boolean | null
}

export function computeActiveQuest({ profession, professionLabel, knowledgeTotal, examPassed }: QuestInputs): ActiveQuest {
  if (!profession) {
    return { text: '먼저 직업을 선택해 보세요', action: null }
  }
  if (knowledgeTotal === 0) {
    return { text: '아직 가르쳐준 지식이 없어요. 첫 지식을 가르쳐주시겠어요?', action: 'teach' }
  }
  if (examPassed === false) {
    return { text: `${professionLabel ?? ''} 자격시험에 도전해볼 준비가 된 것 같아요!`, action: 'quiz' }
  }
  if (examPassed === true) {
    return { text: '오늘도 새로운 지식을 가르치거나 스스로 공부시켜보세요', action: 'teach' }
  }
  // examPassed === null: 아직 서버 응답을 기다리는 중 — 로딩 느낌이
  // 나지 않도록 무난한 기본 문구를 보여준다(곧 위 분기 중 하나로 바뀜).
  return { text: '오늘도 함께 성장해볼까요?', action: 'teach' }
}
