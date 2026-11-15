import { createHmac, timingSafeEqual } from 'node:crypto'

// 지시서(학습 플로우 전면 개편) 2단계 전용 — api/_lib/knowledgeToken.ts와
// 똑같은 서명 패턴(같은 AUTH_SECRET에서 목적별로 다른 레이블로 파생한
// HMAC 키)이지만, 완전히 별도 토큰이라 서로 바꿔 쓸 수 없다. 이 토큰은
// "지금 이 2문제가 이 사용자·캐릭터에게 실제로 출제됐다"는 사실만
// 서명한다 — 정답(correctIndex)은 토큰에 담지 않고, 제출 시 매번
// objectiveQuizQuestions.ts의 같은 id로 다시 찾아 채점한다(정답을
// 클라이언트로 왕복시키지 않는 기존 퀴즈/시험과 같은 원칙).
const TOKEN_TTL_MS = 10 * 60 * 1000

export interface ObjectiveQuizTokenPayload {
  userId: number
  characterId: number
  companionType: string
  // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): 예전엔 항상 정확히
  // 2문제([string, string])였지만, teen 단계 ④번 "객관식 3문제" 단계도
  // 같은 메커니즘을 재사용하도록 가변 길이 배열로 넓혔다 — 길이 자체는
  // 신뢰하지 않고 제출 시 answers.length와 다시 비교한다(handleSubmit
  // ObjectiveQuiz 참고).
  questionIds: string[]
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET_MISSING')
  }
  return secret
}

function getTokenSecret(): string {
  return createHmac('sha256', getAuthSecret()).update('objective-quiz-token-v1').digest('base64url')
}

function sign(data: string): string {
  return createHmac('sha256', getTokenSecret()).update(data).digest('base64url')
}

export function signObjectiveQuizToken(payload: ObjectiveQuizTokenPayload): string {
  const body = { ...payload, exp: Date.now() + TOKEN_TTL_MS }
  const data = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function verifyObjectiveQuizToken(token: unknown): ObjectiveQuizTokenPayload | null {
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
    if (
      typeof parsed.userId !== 'number' ||
      typeof parsed.characterId !== 'number' ||
      typeof parsed.companionType !== 'string' ||
      !Array.isArray(parsed.questionIds) ||
      parsed.questionIds.length === 0 ||
      !parsed.questionIds.every((id) => typeof id === 'string') ||
      typeof parsed.exp !== 'number'
    ) {
      return null
    }
    if (Date.now() > parsed.exp) return null

    return {
      userId: parsed.userId,
      characterId: parsed.characterId,
      companionType: parsed.companionType,
      questionIds: parsed.questionIds as string[],
    }
  } catch {
    return null
  }
}
