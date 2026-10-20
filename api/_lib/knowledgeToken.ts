import { createHmac, timingSafeEqual } from 'node:crypto'
import type { KnowledgeVerificationStatus } from './gemini'

// How long a verify-knowledge result stays saveable. Long enough for a user
// to read the result and decide, short enough to keep any leaked/replayed
// token's usefulness small.
const TOKEN_TTL_MS = 30 * 60 * 1000

const VERIFICATION_STATUSES = new Set<string>(['appropriate', 'needs_revision', 'unverifiable'])

export interface KnowledgeVerificationTokenPayload {
  userId: number
  characterId: number
  companionType: string
  title: string
  content: string
  status: KnowledgeVerificationStatus
  explanation: string
  relevance: string
  issues: string
  suggestion: string
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET_MISSING')
  }
  return secret
}

// Derived from AUTH_SECRET with a fixed, purpose-specific label so this
// token's signature can never be interchanged with a session cookie's
// signature (api/_lib/auth.ts) even though both ultimately depend on the
// same underlying secret — a session token can never be replayed here, and
// a knowledge-verification token can never be replayed as a session.
function getTokenSecret(): string {
  return createHmac('sha256', getAuthSecret()).update('knowledge-verification-token-v1').digest('base64url')
}

function sign(data: string): string {
  return createHmac('sha256', getTokenSecret()).update(data).digest('base64url')
}

// Binds a Gemini verification result to the exact (user, character, title,
// content) it was produced for. save-knowledge never has to trust a
// client-resent "this was appropriate" claim — the only thing that can
// assert a status here is a signature only the server could have produced,
// over content save-knowledge will require to match byte-for-byte.
export function signKnowledgeVerification(payload: KnowledgeVerificationTokenPayload): string {
  const body = { ...payload, exp: Date.now() + TOKEN_TTL_MS }
  const data = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function verifyKnowledgeVerificationToken(token: unknown): KnowledgeVerificationTokenPayload | null {
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
      typeof parsed.title !== 'string' ||
      typeof parsed.content !== 'string' ||
      typeof parsed.status !== 'string' ||
      !VERIFICATION_STATUSES.has(parsed.status) ||
      typeof parsed.explanation !== 'string' ||
      typeof parsed.relevance !== 'string' ||
      typeof parsed.issues !== 'string' ||
      typeof parsed.suggestion !== 'string' ||
      typeof parsed.exp !== 'number'
    ) {
      return null
    }
    if (Date.now() > parsed.exp) return null

    return {
      userId: parsed.userId,
      characterId: parsed.characterId,
      companionType: parsed.companionType,
      title: parsed.title,
      content: parsed.content,
      status: parsed.status as KnowledgeVerificationStatus,
      explanation: parsed.explanation,
      relevance: parsed.relevance,
      issues: parsed.issues,
      suggestion: parsed.suggestion,
    }
  } catch {
    return null
  }
}
