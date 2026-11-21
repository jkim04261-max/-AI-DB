import { createHmac, timingSafeEqual } from 'node:crypto'

// 지시서(8~9세 문제 유형 변경 및 종합 최종 시험/패스권 시스템) — 종합
// 최종 시험 전용 서명 토큰. api/_lib/objectiveQuizToken.ts와 완전히
// 같은 원칙(같은 AUTH_SECRET에서 목적별로 다른 레이블로 파생한 HMAC
// 키, 생성된 문제 전체를 토큰에 직접 서명해 넣어 correctIndex가
// 클라이언트 응답에는 내려가지 않게 함)이지만, 완전히 별도 토큰이라
// 서로 바꿔 쓸 수 없다(objective-quiz 토큰으로 final-exam을 채점하려
// 하거나 그 반대를 시도해도 서명이 안 맞아 거부된다).
const TOKEN_TTL_MS = 10 * 60 * 1000

export interface FinalExamTokenQuestion {
  id: string
  text: string
  choices: string[]
  correctIndex: number
  explanation: string
}

export interface FinalExamTokenPayload {
  userId: number
  characterId: number
  companionType: string
  questions: FinalExamTokenQuestion[]
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET_MISSING')
  }
  return secret
}

function getTokenSecret(): string {
  return createHmac('sha256', getAuthSecret()).update('final-exam-token-v1').digest('base64url')
}

function sign(data: string): string {
  return createHmac('sha256', getTokenSecret()).update(data).digest('base64url')
}

export function signFinalExamToken(payload: FinalExamTokenPayload): string {
  const body = { ...payload, exp: Date.now() + TOKEN_TTL_MS }
  const data = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function verifyFinalExamToken(token: unknown): FinalExamTokenPayload | null {
  if (typeof token !== 'string') return null
  const [data, signature] = token.split('.')
  if (!data || !signature) return null

  let expectedSignature: string
  try {
    expectedSignature = sign(data)
  } catch {
    return null
  }

  const sigBuf = Buffer.from(signature)
  const expectedBuf = Buffer.from(expectedSignature)
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null
  }

  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as Record<string, unknown>
    const isValidQuestion = (q: unknown): q is FinalExamTokenQuestion => {
      if (!q || typeof q !== 'object') return false
      const o = q as Record<string, unknown>
      return (
        typeof o.id === 'string' &&
        typeof o.text === 'string' &&
        Array.isArray(o.choices) &&
        o.choices.every((c) => typeof c === 'string') &&
        typeof o.correctIndex === 'number' &&
        Number.isInteger(o.correctIndex) &&
        o.correctIndex >= 0 &&
        o.correctIndex < o.choices.length &&
        typeof o.explanation === 'string'
      )
    }
    if (
      typeof parsed.userId !== 'number' ||
      typeof parsed.characterId !== 'number' ||
      typeof parsed.companionType !== 'string' ||
      !Array.isArray(parsed.questions) ||
      parsed.questions.length === 0 ||
      !parsed.questions.every(isValidQuestion) ||
      typeof parsed.exp !== 'number'
    ) {
      return null
    }
    if (Date.now() > parsed.exp) return null

    return {
      userId: parsed.userId,
      characterId: parsed.characterId,
      companionType: parsed.companionType,
      questions: parsed.questions as FinalExamTokenQuestion[],
    }
  } catch {
    return null
  }
}
