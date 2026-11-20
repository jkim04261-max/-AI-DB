// 지시서(8세 학습 시스템: 8문제 커리큘럼 재구성) "신유형 미니게임" 1/2 —
// 완전히 새로 설계한 미니게임이다. 직업과 무관한, 8~9살이 실제로 매일
// 겪는 일과를 순서대로 눌러 맞히는 게임으로, 직업별 콘텐츠를 새로
// 만들 필요 없이(지시서 범위 밖) 가장 단순하고 안전하게 "쉬운 지식"
// 요구를 만족한다.
export interface SequenceOrderGameSet {
  id: string
  title: string
  steps: string[]
}

export const SEQUENCE_ORDER_GAME_SETS: SequenceOrderGameSet[] = [
  {
    id: 'morning-routine',
    title: '아침에 학교 가기 전까지',
    steps: ['일어나기', '세수하기', '아침밥 먹기', '옷 입기', '가방 메고 집 나서기'],
  },
  {
    id: 'hand-washing',
    title: '손 씻기',
    steps: ['수도꼭지 틀기', '비누 묻히기', '거품 내서 문지르기', '물로 헹구기', '수건으로 닦기'],
  },
  {
    id: 'plant-growing',
    title: '씨앗이 자라는 과정',
    steps: ['씨앗 심기', '물 주기', '싹 트기', '잎이 자라기', '꽃이 피기'],
  },
]
