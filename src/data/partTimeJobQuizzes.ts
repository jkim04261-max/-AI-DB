// 지시서(10대 전용 알바 시스템): 10대 커리큘럼 중간에 뜨는 알바
// 이벤트에서 출제하는 3문제짜리 퀴즈. 딥시크(DeepSeek) 연동은 이
// 프로젝트가 지금까지 Gemini 외의 외부 AI를 새로 붙인 적이 없어("금지
// 사항" 범위 밖의 신규 연동) 지시서 자신이 제시한 대안("준비된 퀴즈
// 데이터... 활용")을 택했다 — HouseworkQuizModal(householdQuizzes.ts)과
// 같은 설계: 숨겨진 정답이 없는 완전 클라이언트 전용 저위험
// 미니게임이라 서버 왕복이 필요 없다.
export type PartTimeJobType = 'dishwashing' | 'serving' | 'convenience_store'

export interface PartTimeJobQuizQuestion {
  id: string
  question: string
  choices: string[]
  correctIndex: number
}

export const PART_TIME_JOB_LABEL: Record<PartTimeJobType, string> = {
  dishwashing: '설거지 알바',
  serving: '서빙 알바',
  convenience_store: '편의점 알바',
}

const DISHWASHING_QUESTIONS: PartTimeJobQuizQuestion[] = [
  { id: 'dw-1', question: '설거지를 하기 전에 먼저 해야 할 일은?', choices: ['그릇에 묻은 음식 찌꺼기 털어내기', '그릇을 그냥 물에 담그지 않기', '세제를 먼저 다 쏟아붓기'], correctIndex: 0 },
  { id: 'dw-2', question: '기름기가 많은 그릇을 씻을 때 가장 좋은 방법은?', choices: ['찬물로만 헹군다', '주방세제로 거품을 내서 씻는다', '물티슈로 닦기만 한다'], correctIndex: 1 },
  { id: 'dw-3', question: '씻은 그릇은 어떻게 정리해야 할까요?', choices: ['물기를 제거하고 건조대에 엎어 놓는다', '젖은 채로 바로 쌓아 놓는다', '아무 데나 둔다'], correctIndex: 0 },
  { id: 'dw-4', question: '날카로운 칼을 설거지할 때 주의할 점은?', choices: ['다른 그릇과 섞어서 대충 씻는다', '칼날 방향을 조심하며 따로 씻는다', '빠르게 던지듯 씻는다'], correctIndex: 1 },
  { id: 'dw-5', question: '설거지할 때 고무장갑을 끼는 이유로 가장 알맞은 것은?', choices: ['멋있어 보이려고', '손을 보호하고 위생을 지키려고', '그릇을 더 무겁게 들려고'], correctIndex: 1 },
  { id: 'dw-6', question: '컵 안쪽까지 깨끗이 씻으려면?', choices: ['겉면만 문지른다', '수세미로 컵 안쪽도 꼼꼼히 닦는다', '물만 붓고 흔든다'], correctIndex: 1 },
]

const SERVING_QUESTIONS: PartTimeJobQuizQuestion[] = [
  { id: 'sv-1', question: '손님에게 음식을 가져다 드릴 때 가장 중요한 것은?', choices: ['손님이 보는 앞에서 뛰어다니기', '뜨거운 그릇은 조심히, 안전하게 나르기', '빨리 던지듯 내려놓기'], correctIndex: 1 },
  { id: 'sv-2', question: '손님에게 물을 따라드릴 때 알맞은 태도는?', choices: ['웃으며 "맛있게 드세요"라고 인사한다', '아무 말 없이 쏟아붓는다', '손님을 쳐다보지 않는다'], correctIndex: 0 },
  { id: 'sv-3', question: '주문을 받을 때 가장 먼저 해야 할 일은?', choices: ['손님 말을 끝까지 잘 듣기', '손님 말을 끊고 메뉴를 추천하기', '주문을 받지 않고 그냥 가기'], correctIndex: 0 },
  { id: 'sv-4', question: '뜨거운 국물이 담긴 그릇을 옮길 때는?', choices: ['맨손으로 빠르게 든다', '쟁반이나 장갑을 이용해 조심히 든다', '기울여서 들고 간다'], correctIndex: 1 },
  { id: 'sv-5', question: '테이블을 정리할 때 가장 먼저 해야 할 일은?', choices: ['빈 그릇과 쓰레기를 치운다', '새 손님을 먼저 앉힌다', '아무것도 안 치우고 둔다'], correctIndex: 0 },
  { id: 'sv-6', question: '손님이 음식에 대해 물어보면?', choices: ['모른 척 지나간다', '아는 만큼 친절하게 설명해 드린다', '귀찮다는 표정을 짓는다'], correctIndex: 1 },
]

const CONVENIENCE_STORE_QUESTIONS: PartTimeJobQuizQuestion[] = [
  { id: 'cs-1', question: '계산할 때 손님에게 거스름돈을 드리는 순서로 알맞은 것은?', choices: ['금액을 정확히 확인하고 드린다', '대충 세어서 빨리 드린다', '거스름돈을 안 드려도 된다'], correctIndex: 0 },
  { id: 'cs-2', question: '유통기한이 지난 상품을 발견하면?', choices: ['그냥 진열대에 둔다', '바로 매대에서 빼고 담당자에게 알린다', '손님에게 먼저 판다'], correctIndex: 1 },
  { id: 'cs-3', question: '손님이 들어오면 가장 먼저 해야 할 인사는?', choices: ['"어서 오세요"라고 밝게 인사한다', '아무 말도 하지 않는다', '휴대폰만 본다'], correctIndex: 0 },
  { id: 'cs-4', question: '냉장 음료를 진열할 때 주의할 점은?', choices: ['냉장고 문을 오래 열어 둔다', '필요한 만큼만 빠르게 채우고 문을 닫는다', '아무 칸에나 섞어 놓는다'], correctIndex: 1 },
  { id: 'cs-5', question: '물건 가격을 모를 때 가장 올바른 행동은?', choices: ['마음대로 가격을 정한다', '바코드로 정확히 확인한다', '손님에게 물어본다'], correctIndex: 1 },
  { id: 'cs-6', question: '매장 바닥에 물건이 떨어져 있으면?', choices: ['못 본 척 지나간다', '바로 주워서 제자리에 둔다', '발로 치워 버린다'], correctIndex: 1 },
]

const QUESTION_POOLS: Record<PartTimeJobType, PartTimeJobQuizQuestion[]> = {
  dishwashing: DISHWASHING_QUESTIONS,
  serving: SERVING_QUESTIONS,
  convenience_store: CONVENIENCE_STORE_QUESTIONS,
}

// e2e 테스트가 (어떤 jobType이 무작위로 뽑혔든) 화면에 보이는 질문
// 텍스트만으로 정답 보기를 찾아낼 수 있도록 세 직업의 전체 문제은행을
// 합쳐서 내보낸다 — householdQuizzes.ts의 HOUSEWORK_QUIZ_QUESTIONS와
// 같은 용도.
export const ALL_PART_TIME_JOB_QUESTIONS: PartTimeJobQuizQuestion[] = [
  ...DISHWASHING_QUESTIONS,
  ...SERVING_QUESTIONS,
  ...CONVENIENCE_STORE_QUESTIONS,
]

const JOB_TYPES: PartTimeJobType[] = ['dishwashing', 'serving', 'convenience_store']

export function pickRandomPartTimeJobType(): PartTimeJobType {
  return JOB_TYPES[Math.floor(Math.random() * JOB_TYPES.length)]
}

// jobType 안에서 서로 다른 3문제를 무작위로 뽑는다(각 pool이 항상 3개
// 이상이므로 중복 없이 뽑을 수 있다).
export function pickThreePartTimeJobQuestions(jobType: PartTimeJobType): PartTimeJobQuizQuestion[] {
  const pool = [...QUESTION_POOLS[jobType]]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, 3)
}
