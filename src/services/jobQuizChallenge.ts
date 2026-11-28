import type { MockWallet } from '../hooks/useMockWallet'
import { charge, reward } from './paymentService'
import {
  ALL_PART_TIME_JOB_QUESTIONS,
  type PartTimeJobQuizQuestion,
} from '../data/partTimeJobQuizzes'

// 지시서(선택형 직업 퀴즈 보상·패널티): 밥 먹이기/엄마 심부름 이벤트에서
// 공통으로 쓰는 "직업 퀴즈 도전" 규칙. 2문제를 모두 맞히면 +20,000원,
// 하나라도 틀리면 -20,000원(부분 보상 없음)이며, 문제마다가 아니라
// 최종 결과로 딱 한 번만 정산한다. 가상 용돈 전용 — 실제 돈과 무관하다.
export const JOB_QUIZ_QUESTION_COUNT = 2
export const JOB_QUIZ_REWARD_WON = 20_000
export const JOB_QUIZ_PENALTY_WON = 20_000

export type JobQuizOutcome = 'success' | 'fail'

export interface JobQuizSettlement {
  outcome: JobQuizOutcome
  // 실제로 잔액이 바뀐 금액(+/-). 지갑이 없으면 0.
  deltaWon: number
  balanceAfterWon: number | null
}

// 오답 시 20,000원이 차감되므로 잔액이 모자라면 도전 자체를 막는다
// (마이너스 잔액·가상 빚 방지). 지갑이 아직 없는(null) 캐릭터도 막는다.
export function canAttemptJobQuizChallenge(balanceWon: number | null): boolean {
  return balanceWon !== null && balanceWon >= JOB_QUIZ_PENALTY_WON
}

// 순수 계산 — 결과(전부 정답인지)와 정산 전 잔액으로 정산 결과를 구한다.
export function computeJobQuizSettlement(correctCount: number, total: number, balanceWon: number | null): JobQuizSettlement {
  const success = total > 0 && correctCount >= total
  if (balanceWon === null) return { outcome: success ? 'success' : 'fail', deltaWon: 0, balanceAfterWon: null }
  if (success) return { outcome: 'success', deltaWon: JOB_QUIZ_REWARD_WON, balanceAfterWon: balanceWon + JOB_QUIZ_REWARD_WON }
  // 잔액이 모자라면(이론상 도전 전에 막힘) 0 아래로 내려가지 않게 보호한다.
  const penalty = Math.min(JOB_QUIZ_PENALTY_WON, balanceWon)
  return { outcome: 'fail', deltaWon: -penalty, balanceAfterWon: balanceWon - penalty }
}

// 실제 지갑에 반영한다. 정산 로직은 이 함수 한 곳뿐이다.
export function applyJobQuizSettlement(wallet: MockWallet, settlement: JobQuizSettlement): void {
  if (settlement.deltaWon > 0) reward(wallet, settlement.deltaWon, 'job_quiz_challenge')
  else if (settlement.deltaWon < 0) charge(wallet, -settlement.deltaWon, 'job_quiz_challenge')
}

// 기존 문제은행(알바 퀴즈 3종 풀)에서 서로 다른 2문제를 무작위로 뽑는다.
// 새 문제 생성·외부 AI 호출 없음.
export function pickJobQuizQuestions(random: () => number = Math.random): PartTimeJobQuizQuestion[] {
  const pool = [...ALL_PART_TIME_JOB_QUESTIONS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, JOB_QUIZ_QUESTION_COUNT)
}
