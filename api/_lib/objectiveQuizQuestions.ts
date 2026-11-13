// 지시서(학습 플로우 전면 개편) 2단계 "객관식 2문제" 전용 문제은행.
//
// 직업(의사·변호사 등 포함 50개 전체)과 무관하게 모든 캐릭터에 똑같이
// 적용되는 8~9살(toddler) 수준의 안전한 생활 상식/예절 문제다 — 이미
// 이 코드베이스에 있는 정책(api/character.ts의 EXAM_SUPPORTED_PROFESSIONS
// 주석: "법률·헬스케어 등은 틀리면 안 되는 영역이라 임의로 대량 생성할
// 수 없음")을 그대로 따라, Gemini로 직업별 문제를 즉석 생성하지 않고
// 사람이 직접 쓴 정적 문제만 쓴다(사용자 승인: "직업 무관 생활상식 동일
// 문제은행"). 정답(correctIndex)과 해설은 이 서버 전용 파일에만 있고,
// 클라이언트로는 절대 내려가지 않는다(examQuestions.ts와 같은 원칙) —
// 채점은 항상 이 파일의 correctIndex와 서버에서 직접 비교해서 이루어진다.
export interface ObjectiveQuizQuestion {
  id: string
  text: string
  choices: string[]
  correctIndex: number
  explanation: string
}

export const OBJECTIVE_QUIZ_QUESTIONS: ObjectiveQuizQuestion[] = [
  {
    id: 'obj-1',
    text: '친구가 넘어져서 다쳤을 때 가장 먼저 해야 할 일은 무엇일까요?',
    choices: ['모르는 척 지나간다', '괜찮은지 물어보고 어른에게 알린다', '사진을 찍어서 친구들에게 보여준다', '넘어진 친구를 비웃는다'],
    correctIndex: 1,
    explanation: '다친 친구에게는 먼저 괜찮은지 물어보고, 어른에게 알려서 도움을 받는 게 중요해요.',
  },
  {
    id: 'obj-2',
    text: '길을 건널 때 가장 안전한 방법은 무엇일까요?',
    choices: ['휴대폰을 보면서 빠르게 건넌다', '좌우를 살피고 횡단보도의 초록불에 건넌다', '차가 멈출 때까지 기다리지 않고 뛰어간다', '친구와 장난치며 건넌다'],
    correctIndex: 1,
    explanation: '횡단보도에서 좌우를 살피고 초록불일 때 건너는 것이 가장 안전해요.',
  },
  {
    id: 'obj-3',
    text: '다른 사람의 물건을 쓰고 싶을 때 가장 올바른 행동은 무엇일까요?',
    choices: ['먼저 주인에게 물어보고 허락을 받는다', '주인이 없을 때 몰래 가져온다', '그냥 마음대로 쓴다', '친구에게 몰래 빌려달라고 한다'],
    correctIndex: 0,
    explanation: '다른 사람의 물건을 쓰려면 먼저 주인에게 물어보고 허락을 받아야 해요.',
  },
  {
    id: 'obj-4',
    text: '밥을 먹기 전에 꼭 해야 하는 좋은 습관은 무엇일까요?',
    choices: ['손을 깨끗이 씻는다', '텔레비전을 크게 켠다', '밖에서 뛰어논다', '손을 씻지 않고 바로 먹는다'],
    correctIndex: 0,
    explanation: '밥을 먹기 전에는 손을 깨끗이 씻어야 세균으로부터 건강을 지킬 수 있어요.',
  },
  {
    id: 'obj-5',
    text: '교실에서 선생님이 말씀하실 때 올바른 자세는 무엇일까요?',
    choices: ['친구와 큰 소리로 이야기한다', '자리에서 일어나 돌아다닌다', '선생님을 바라보며 조용히 듣는다', '엎드려서 잔다'],
    correctIndex: 2,
    explanation: '선생님이 말씀하실 때는 바라보며 조용히 듣는 것이 올바른 태도예요.',
  },
  {
    id: 'obj-6',
    text: '쓰레기를 버릴 때 가장 올바른 방법은 무엇일까요?',
    choices: ['아무 데나 던진다', '정해진 쓰레기통에 분리해서 버린다', '친구에게 버리라고 시킨다', '모아뒀다가 땅에 묻는다'],
    correctIndex: 1,
    explanation: '쓰레기는 정해진 통에 분리해서 버려야 환경을 깨끗하게 지킬 수 있어요.',
  },
  {
    id: 'obj-7',
    text: '친구와 의견이 다를 때 가장 좋은 해결 방법은 무엇일까요?',
    choices: ['서로의 생각을 이야기하며 대화로 푼다', '무조건 내 말이 맞다고 소리친다', '친구를 때린다', '말을 걸지 않고 무시한다'],
    correctIndex: 0,
    explanation: '의견이 다를 때는 서로의 생각을 이야기하며 대화로 푸는 것이 가장 좋아요.',
  },
  {
    id: 'obj-8',
    text: '처음 만난 사람이 집 주소를 물어볼 때 가장 안전한 행동은 무엇일까요?',
    choices: ['바로 자세히 알려준다', '알려주지 않고 보호자에게 이야기한다', '따라가서 보여준다', '집 전화번호도 함께 알려준다'],
    correctIndex: 1,
    explanation: '잘 모르는 사람에게는 집 주소 같은 개인정보를 알려주지 말고 보호자에게 바로 이야기해야 해요.',
  },
]

export function getObjectiveQuizQuestionById(id: string): ObjectiveQuizQuestion | null {
  return OBJECTIVE_QUIZ_QUESTIONS.find((q) => q.id === id) ?? null
}

// 매번 다른 2문제가 나오도록(요청: "문제 순서를 섞어서 내보내면 더
// 좋다") 전체 은행에서 무작위로 섞어 2개를 고른다 — 오답으로 다시
// 도전할 때도 같은 두 문제가 반복되지 않을 확률이 높다.
export function pickRandomObjectiveQuizQuestions(count: number): ObjectiveQuizQuestion[] {
  const shuffled = [...OBJECTIVE_QUIZ_QUESTIONS].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
