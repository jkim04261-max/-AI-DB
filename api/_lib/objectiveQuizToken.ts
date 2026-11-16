import { createHmac, timingSafeEqual } from 'node:crypto'

// 지시서(학습 플로우 전면 개편) 2단계 전용 — api/_lib/knowledgeToken.ts와
// 똑같은 서명 패턴(같은 AUTH_SECRET에서 목적별로 다른 레이블로 파생한
// HMAC 키)이지만, 완전히 별도 토큰이라 서로 바꿔 쓸 수 없다. 이 토큰은
// "지금 이 문제들이 이 사용자·캐릭터에게 실제로 출제됐다"는 사실만
// 서명한다.
//
// 지시서(연령대별 객관식 선택지 개수 동적 변경 및 문제 유형 확장): 문제가
// 더 이상 objectiveQuizQuestions.ts의 고정 문제은행에서 id로 뽑히지
// 않고 Gemini가 매번 새로 생성하므로(generateObjectiveQuizBatch), 예전처럼
// "문제 id만 서명하고 제출 시 같은 id로 문제은행에서 다시 찾아 채점"하는
// 방식을 쓸 수 없다 — 방금 생성된 문제는 어디에도 영속 저장되지 않기
// 때문이다. 그래서 api/_lib/knowledgeToken.ts(자기생성 지식 검증 결과를
// 토큰에 통째로 서명)와 같은 원칙으로, 생성된 문제 전체(텍스트·보기·
// 정답 인덱스·해설)를 이 토큰에 직접 서명해 넣는다 — correctIndex는
// 여전히 GET 응답(questions)에는 내려가지 않고, 서명된 토큰 안에만
// 있어 제출 시 그 서명을 다시 검증해서만 신뢰한다(클라이언트가 위조할
// 수 없음).
const TOKEN_TTL_MS = 10 * 60 * 1000

export interface ObjectiveQuizTokenQuestion {
  id: string
  text: string
  choices: string[]
  correctIndex: number
  explanation: string
}

export interface ObjectiveQuizTokenPayload {
  userId: number
  characterId: number
  companionType: string
  // 지시서(10대 커리큘럼: 직업 카드 맞추기 통합): 예전엔 항상 정확히
  // 2문제였지만, teen 단계 ④번 "객관식 3문제" 단계도 같은 메커니즘을
  // 재사용하도록 가변 길이 배열로 넓혔다 — 길이 자체는 신뢰하지 않고
  // 제출 시 answers.length와 다시 비교한다(handleSubmitObjectiveQuiz 참고).
  questions: ObjectiveQuizTokenQuestion[]
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
    const isValidQuestion = (q: unknown): q is ObjectiveQuizTokenQuestion => {
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
      questions: parsed.questions as ObjectiveQuizTokenQuestion[],
    }
  } catch {
    return null
  }
}
