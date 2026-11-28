import type { CompanionType } from '../context/GrowthContext'

// 서버 지갑 API 클라이언트(api/character.ts의 ?action=wallet*). 서버에서
// WALLET_API_ENABLED가 꺼져 있으면 {enabled:false}가 와서 기존 체험판 지갑을
// 그대로 쓴다. 금액은 서버가 정하므로 클라이언트는 이유(reason)와 거래 ID만 보낸다.
export interface WalletHistoryItem {
  reason: string
  deltaWon: number
  balanceAfterWon: number
  createdAt: string
}

export type WalletSnapshot = { enabled: false } | { enabled: true; balanceWon: number; history: WalletHistoryItem[] }

export interface WalletTxResponse {
  enabled: boolean
  status?: 'applied' | 'duplicate' | 'insufficient' | 'capped'
  balanceWon?: number
}

export interface ChallengeQuestion {
  id: string
  text: string
  choices: string[]
}

export interface ChallengeStart {
  challengeId: string
  questions: ChallengeQuestion[]
  balanceWon: number
}

export interface ChallengeResult {
  outcome: 'success' | 'fail'
  correctCount: number
  deltaWon: number
  balanceWon: number
  review: { id: string; text: string; choices: string[]; correctIndex: number; explanation: string; myAnswer: number }[]
  history: WalletHistoryItem[]
}

export function newEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

async function readJson<T>(res: Response): Promise<T & { error?: string }> {
  return (await res.json().catch(() => ({}))) as T & { error?: string }
}

export async function fetchWallet(companionType: CompanionType): Promise<WalletSnapshot | null> {
  const res = await fetch(`/api/character?${new URLSearchParams({ action: 'wallet', companionType })}`)
  if (!res.ok) return null
  const data = await readJson<{ enabled?: boolean; balanceWon?: number; history?: WalletHistoryItem[] }>(res)
  if (!data.enabled || typeof data.balanceWon !== 'number') return { enabled: false }
  return { enabled: true, balanceWon: data.balanceWon, history: data.history ?? [] }
}

export async function postWalletTx(body: {
  companionType: CompanionType
  reason: string
  eventId: string
  amountWon?: number
}): Promise<WalletTxResponse | null> {
  const res = await fetch('/api/character?action=wallet-tx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) return null
  return readJson<WalletTxResponse>(res)
}

// 실패하면 서버가 내려준 안내 문구(잔액 부족·하루 횟수 소진 등)를 담은 Error를 던진다.
export async function startQuizChallenge(companionType: CompanionType, context: 'meal' | 'errand'): Promise<ChallengeStart | null> {
  const res = await fetch('/api/character?action=quiz-challenge-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companionType, context }),
  })
  const data = await readJson<Partial<ChallengeStart> & { enabled?: boolean }>(res)
  if (res.ok && data.enabled === false) return null
  if (!res.ok || !data.challengeId || !data.questions) throw new Error(data.error || '퀴즈를 준비하는 중 오류가 발생했어요.')
  return { challengeId: data.challengeId, questions: data.questions, balanceWon: data.balanceWon ?? 0 }
}

export async function submitQuizChallenge(challengeId: string, answers: number[]): Promise<ChallengeResult> {
  const res = await fetch('/api/character?action=quiz-challenge-submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, answers }),
  })
  const data = await readJson<Partial<ChallengeResult>>(res)
  if (!res.ok || !data.outcome || !data.review) throw new Error(data.error || '결과를 처리하는 중 오류가 발생했어요.')
  return data as ChallengeResult
}
