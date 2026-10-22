// PR #45 checkpoint 4: 회계사·가수 직업별 기초 퀴즈/시험 문제은행 —
// 직접 작성한 독자 콘텐츠. 정답(correctIndex)과 해설은 이 서버 전용
// 파일에만 있고, 클라이언트로는 절대 내려가지 않는다 — 화면에는
// src/data/examQuestions.ts(정답 없는 버전)만 쓰인다. 채점은 항상 이
// 파일의 correctIndex와 서버에서 직접 비교해서 이루어진다(클라이언트가
// "정답" 여부를 주장해도 신뢰하지 않음).
//
// PR #41 설계 문서의 결정("시험은 검증된 문제은행을 기본으로")에 따라
// Gemini 호출 없이 정적 데이터만으로 채점이 끝난다 — 이 파일 자체는
// Gemini 비용이 전혀 들지 않는다.

export interface ExamQuestion {
  id: string
  profession: 'accountant' | 'singer'
  text: string
  choices: string[]
  correctIndex: number
  explanation: string
}

export const EXAM_QUESTIONS: ExamQuestion[] = [
  {
    id: 'accountant-1',
    profession: 'accountant',
    text: '복식부기의 핵심 원리로 가장 알맞은 것은?',
    choices: [
      '모든 거래를 차변과 대변에 동시에 기록한다',
      '현금 거래만 기록하고 나머지는 기록하지 않는다',
      '수입과 지출을 한 줄로만 기록한다',
      '연말에 한 번만 장부를 정리한다',
    ],
    correctIndex: 0,
    explanation: '복식부기는 거래 하나를 차변과 대변 양쪽에 동시에 기록해 균형을 맞추는 방식이에요.',
  },
  {
    id: 'accountant-2',
    profession: 'accountant',
    text: '회계의 기본 등식으로 알맞은 것은?',
    choices: ['자산 = 부채 + 자본', '자산 = 수익 - 비용', '부채 = 자산 + 자본', '자본 = 부채 - 자산'],
    correctIndex: 0,
    explanation: '자산은 부채(남의 돈)와 자본(내 돈)을 합친 것과 항상 같아요.',
  },
  {
    id: 'accountant-3',
    profession: 'accountant',
    text: '손익계산서가 보여주는 것은 무엇인가요?',
    choices: ['특정 시점의 재산 상태', '일정 기간의 수익과 비용(경영성과)', '현금의 입출금 내역', '주주의 명단'],
    correctIndex: 1,
    explanation: '손익계산서는 일정 기간 동안 얼마나 벌고 얼마나 썼는지를 보여줘요.',
  },
  {
    id: 'accountant-4',
    profession: 'accountant',
    text: '발생주의 원칙에 대한 설명으로 알맞은 것은?',
    choices: [
      '현금을 받은 시점에만 수익을 인식한다',
      '거래가 실제로 발생한 시점에 수익과 비용을 인식한다',
      '연말에 몰아서 모든 거래를 인식한다',
      '현금이 오가지 않으면 기록하지 않는다',
    ],
    correctIndex: 1,
    explanation: '발생주의는 현금 수수와 관계없이 거래가 실제로 일어난 시점에 기록하는 원칙이에요.',
  },
  {
    id: 'singer-1',
    profession: 'singer',
    text: '복식호흡에 대한 설명으로 가장 알맞은 것은?',
    choices: [
      '어깨를 들썩이며 숨을 들이쉬는 호흡법',
      '배를 이용해 깊게 숨을 쉬어 안정적인 소리를 내는 호흡법',
      '숨을 참고 노래하는 기법',
      '입으로만 짧게 숨을 쉬는 방법',
    ],
    correctIndex: 1,
    explanation: '복식호흡은 배(횡격막)를 이용해 깊게 숨을 쉬어 소리를 안정적으로 받쳐주는 발성의 기초예요.',
  },
  {
    id: 'singer-2',
    profession: 'singer',
    text: '"음정"이 의미하는 것은?',
    choices: ['소리의 크기', '음의 높낮이', '노래의 빠르기', '악기의 종류'],
    correctIndex: 1,
    explanation: '음정은 음이 얼마나 높고 낮은지를 나타내는 말이에요.',
  },
  {
    id: 'singer-3',
    profession: 'singer',
    text: '음악에서 "박자"가 뜻하는 것은?',
    choices: ['음의 높낮이', '소리의 세기', '음악의 시간적 길이 단위(리듬의 기초)', '가사의 운율'],
    correctIndex: 2,
    explanation: '박자는 음악이 흘러가는 시간을 일정한 단위로 나눈 것으로, 리듬의 기초가 돼요.',
  },
  {
    id: 'singer-4',
    profession: 'singer',
    text: '"반음"에 대한 설명으로 알맞은 것은?',
    choices: ['온음의 두 배 크기인 음정', '가장 작은 단위의 음정(온음의 절반)', '박자의 한 종류', '화음을 쌓는 방법'],
    correctIndex: 1,
    explanation: '반음은 음악에서 쓰이는 가장 작은 음정 단위로, 온음의 절반에 해당해요.',
  },
]

export function getQuestionsForProfession(profession: 'accountant' | 'singer'): ExamQuestion[] {
  return EXAM_QUESTIONS.filter((q) => q.profession === profession)
}

export function getQuestionById(id: string): ExamQuestion | undefined {
  return EXAM_QUESTIONS.find((q) => q.id === id)
}
