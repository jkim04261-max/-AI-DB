// 지시서(8세 학습 시스템: 8문제 커리큘럼 재구성) "신유형 미니게임" 2/2 —
// SequenceOrderGame과 같은 이유로 직업과 무관한, 8~9살 눈높이의 쉬운
// 분류 지식(과일/채소, 동물 종류 등)만 쓴다.
export interface CategorizeGameSet {
  id: string
  prompt: string
  groupALabel: string
  groupBLabel: string
  items: { label: string; group: 'A' | 'B' }[]
}

export const CATEGORIZE_GAME_SETS: CategorizeGameSet[] = [
  {
    id: 'fruit-vegetable',
    prompt: '과일과 채소를 구분해 보세요',
    groupALabel: '과일',
    groupBLabel: '채소',
    items: [
      { label: '사과', group: 'A' },
      { label: '당근', group: 'B' },
      { label: '바나나', group: 'A' },
      { label: '오이', group: 'B' },
      { label: '포도', group: 'A' },
      { label: '감자', group: 'B' },
    ],
  },
  {
    id: 'land-water-animal',
    prompt: '육지 동물과 물에 사는 동물을 구분해 보세요',
    groupALabel: '육지 동물',
    groupBLabel: '물에 사는 동물',
    items: [
      { label: '강아지', group: 'A' },
      { label: '물고기', group: 'B' },
      { label: '사자', group: 'A' },
      { label: '문어', group: 'B' },
      { label: '토끼', group: 'A' },
      { label: '고래', group: 'B' },
    ],
  },
]
