// 지시서(8세 전용 경제 활동 기획: 엄마/아빠 심부름 이벤트): 심부름을
// 거절했을 때 뜨는 "집에서 숙제하기" 페널티용 문제은행. 직업 무관
// 생활상식 객관식 문제(api/_lib/objectiveQuizQuestions.ts)와 같은
// 원칙으로 사람이 직접 쓴 정적 문제만 쓴다 — 외부 AI(Gemini·DeepSeek
// 등)를 새로 호출하지 않는다(이번 지시서 범위 밖). 이 숙제는 실제
// 학습 미션 채점이 아니라 "심부름을 안 하면 숙제를 해야 한다"는
// 가벼운 페널티 연출이라 정답도 클라이언트 데이터에 그대로 둔다
// (JobQuiz.tsx/jobCards.ts와 같은 "클라이언트 전용 미니게임" 원칙).
export interface HouseworkQuizQuestion {
  id: string
  question: string
  choices: string[]
  correctIndex: number
}

export const HOUSEWORK_QUIZ_QUESTIONS: HouseworkQuizQuestion[] = [
  {
    id: 'hw-1',
    question: '하늘을 날아다니지만 새가 아닌 것은?',
    choices: ['비행기', '참새', '비둘기', '까치'],
    correctIndex: 0,
  },
  {
    id: 'hw-2',
    question: '세상에서 가장 빠른 음식은?',
    choices: ['느린 거북이알', '패스트푸드', '김밥', '라면'],
    correctIndex: 1,
  },
  {
    id: 'hw-3',
    question: '밥을 먹기 전에 손을 씻는 가장 중요한 이유는?',
    choices: ['손이 예뻐 보이려고', '세균을 없애서 건강을 지키려고', '물을 아끼려고', '시간을 보내려고'],
    correctIndex: 1,
  },
  {
    id: 'hw-4',
    question: '바다에서 사는데 다리가 8개인 동물은?',
    choices: ['문어', '거미', '고양이', '달팽이'],
    correctIndex: 0,
  },
  {
    id: 'hw-5',
    question: '길을 건널 때 가장 먼저 해야 할 일은?',
    choices: ['뛰어서 빨리 건넌다', '좌우를 살핀다', '휴대폰을 본다', '노래를 부른다'],
    correctIndex: 1,
  },
  {
    id: 'hw-6',
    question: '모든 요일 중에서 가장 많이 먹는 날은?',
    choices: ['월요일', '화요일', '수요일', '매일'],
    correctIndex: 3,
  },
  {
    id: 'hw-7',
    question: '밤에 잠을 잘 자야 하는 이유로 가장 알맞은 것은?',
    choices: ['몸과 머리가 쉬면서 튼튼하게 자라려고', '꿈을 많이 꾸려고', '시간이 빨리 가라고', '이불이 심심하지 않게'],
    correctIndex: 0,
  },
  {
    id: 'hw-8',
    question: '물이 100도에서 끓으면 생기는 것은?',
    choices: ['얼음', '수증기', '눈', '서리'],
    correctIndex: 1,
  },
  {
    id: 'hw-9',
    question: '거울을 보면 왼손이 어느 손으로 보일까?',
    choices: ['오른손', '왼손 그대로', '보이지 않는다', '두 손 다'],
    correctIndex: 0,
  },
  {
    id: 'hw-10',
    question: '친구와 장난감을 함께 쓸 때 가장 좋은 방법은?',
    choices: ['순서를 정해서 번갈아 쓴다', '먼저 잡는 사람이 계속 쓴다', '큰 소리로 싸운다', '혼자 숨겨둔다'],
    correctIndex: 0,
  },
  {
    id: 'hw-11',
    question: '겨울에 내리는 하얀 것은?',
    choices: ['비', '눈', '우박만', '이슬'],
    correctIndex: 1,
  },
  {
    id: 'hw-12',
    question: '아침에 일어나면 가장 먼저 해야 할 일로 알맞은 것은?',
    choices: ['이불을 정리하고 세수를 한다', '바로 TV를 본다', '간식부터 먹는다', '다시 눈을 감는다'],
    correctIndex: 0,
  },
]

export function pickRandomHouseworkQuestion(excludeId?: string): HouseworkQuizQuestion {
  const pool = excludeId ? HOUSEWORK_QUIZ_QUESTIONS.filter((q) => q.id !== excludeId) : HOUSEWORK_QUIZ_QUESTIONS
  return pool[Math.floor(Math.random() * pool.length)]
}
