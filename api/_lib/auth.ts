import { createHmac, timingSafeEqual } from 'node:crypto'
import { parseCookie, stringifySetCookie } from 'cookie'
import type { IncomingMessage } from 'node:http'

export const SESSION_COOKIE = 'session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export interface SessionPayload {
  sub: number
  email: string
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET
  if (!secret) {
    throw new Error('AUTH_SECRET_MISSING')
  }
  return secret
}

function sign(data: string): string {
  return createHmac('sha256', getAuthSecret()).update(data).digest('base64url')
}

// A small self-contained session token (HMAC-signed JSON), so this never
// depends on how the serverless bundler treats a third-party JWT library's
// module format.
export function signSession(payload: SessionPayload): string {
  const body = { ...payload, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 }
  const data = Buffer.from(JSON.stringify(body)).toString('base64url')
  return `${data}.${sign(data)}`
}

export function verifySession(token: string): SessionPayload | null {
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
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    if (
      typeof payload.sub !== 'number' ||
      typeof payload.email !== 'string' ||
      typeof payload.exp !== 'number' ||
      Date.now() > payload.exp
    ) {
      return null
    }
    return { sub: payload.sub, email: payload.email }
  } catch {
    return null
  }
}

export function readSessionCookie(req: IncomingMessage): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  return parseCookie(header)[SESSION_COOKIE]
}

export function buildSessionCookie(token: string): string {
  return stringifySetCookie({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export function buildClearedSessionCookie(): string {
  return stringifySetCookie({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
